import {
  type CommerceCatalog,
  type CommerceErrorResult,
  type CommerceFailureResult,
  type CommerceFinish,
  type CommerceFinishRequest,
  type CommerceOffering,
  type CommercePendingResult,
  type CommercePurchase,
  type CommercePurchaseRequest,
  type CommerceQuarantinedTransaction,
  type CommerceRestore,
  type CommerceResult,
  type CommerceServerVerifiedAcknowledgement,
  type CommerceServerVerificationRequest,
  type CommerceSuccessResult,
  type CommerceTransaction,
  type CommerceTransactionInbox,
  type NativeCommerceProvider,
} from './commerce-provider.native';
import {
  APPLE_MEMBERSHIP_PRODUCT_IDS,
  getMembershipProductByAppleId,
  getMembershipProductByKey,
  listMembershipProducts,
  normalizeStoreKitEnvironment,
} from './membership-products.native';
import type {
  StoreKitClient,
  StoreKitPurchaseError,
  StoreKitTransaction,
} from './storekit-client.native';

const APPLICATION_ACCOUNT_TOKEN_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const DEFAULT_PURCHASE_EVENT_TIMEOUT_MS = 90_000;
const DEFAULT_NATIVE_CALL_TIMEOUT_MS = 15_000;
const MAX_INBOX_ENTRIES = 256;
const MAX_OBSERVED_TRANSACTIONS = 512;
const MAX_FINISHED_TRANSACTION_REFERENCES = 512;

const PURCHASE_CANCELLED_RESULT = Object.freeze({
  ok: false,
  state: 'cancelled',
  code: 'commerce_purchase_cancelled',
  charged: false,
  retryable: true,
} as const);

const PURCHASE_PENDING_RESULT: CommercePendingResult = Object.freeze({
  ok: false,
  state: 'pending',
  code: 'commerce_purchase_pending',
  charged: false,
  retryable: false,
});

export type StoreKitCommerceRuntime = Readonly<{
  now(): number;
  schedule(delayMs: number, callback: () => void): () => void;
}>;

export type StoreKitCommerceProviderOptions = Readonly<{
  purchaseEventTimeoutMs?: number;
  nativeCallTimeoutMs?: number;
  runtime?: StoreKitCommerceRuntime;
}>;

type NativeCallOutcome<T> =
  | Readonly<{ state: 'succeeded'; value: T }>
  | Readonly<{ state: 'failed'; error: unknown }>
  | Readonly<{ state: 'timed-out' }>;

const DEFAULT_RUNTIME: StoreKitCommerceRuntime = {
  now: () => Date.now(),
  schedule: (delayMs, callback) => {
    const timeout = setTimeout(callback, delayMs);
    return () => clearTimeout(timeout);
  },
};

function success<T>(value: T): CommerceSuccessResult<T> {
  return { ok: true, state: 'succeeded', value };
}

function errorResult(
  code: CommerceErrorResult['code'],
  options: { retryable: boolean; charged?: false | 'unknown' },
): CommerceErrorResult {
  return {
    ok: false,
    state: 'error',
    code,
    charged: options.charged ?? false,
    retryable: options.retryable,
  };
}

function connectionFailure(): CommerceFailureResult {
  return {
    ok: false,
    state: 'unavailable',
    code: 'commerce_store_connection_failed',
    charged: false,
    retryable: true,
  };
}

function toIsoDate(timestamp: number): string | undefined {
  const date = new Date(timestamp);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

function toCommerceTransaction(
  transaction: StoreKitTransaction,
): CommerceTransaction | undefined {
  const product = getMembershipProductByAppleId(transaction.productId);
  const purchasedAt = toIsoDate(transaction.transactionDate);
  if (
    !product ||
    transaction.purchaseState !== 'purchased' ||
    !transaction.transactionId.trim() ||
    !transaction.purchaseToken?.trim() ||
    !purchasedAt
  ) {
    return undefined;
  }

  return {
    offeringKey: product.key,
    transactionReference: transaction.transactionId,
    purchasedAt,
    signedTransaction: transaction.purchaseToken,
    environment: normalizeStoreKitEnvironment(transaction.environmentIOS),
    requiresServerVerification: true,
  };
}

function toQuarantinedTransaction(
  transaction: StoreKitTransaction,
): CommerceQuarantinedTransaction | undefined {
  if (transaction.purchaseState !== 'purchased') return undefined;

  const product = getMembershipProductByAppleId(transaction.productId);
  const purchasedAt = toIsoDate(transaction.transactionDate);
  return {
    productId: transaction.productId,
    ...(transaction.transactionId.trim()
      ? { transactionReference: transaction.transactionId }
      : {}),
    ...(purchasedAt ? { purchasedAt } : {}),
    ...(transaction.purchaseToken?.trim()
      ? { signedTransaction: transaction.purchaseToken }
      : {}),
    environment: normalizeStoreKitEnvironment(transaction.environmentIOS),
    reason: product ? 'invalid_transaction' : 'unknown_product',
    finishAllowed: false,
  };
}

type PendingPurchase = {
  productId: string;
  applicationAccountToken: string;
  requestStartedAt: number;
  purchaseDispatched: boolean;
  resolve(result: CommerceResult<CommercePurchase>): void;
  cancelTimeout(): void;
};

export class StoreKitNativeCommerceProvider implements NativeCommerceProvider {
  private connectPromise?: Promise<void>;
  private pendingPurchase?: PendingPurchase;
  private disposed = false;
  private inboxOverflowed = false;
  private fallbackInboxKey = 0;
  private readonly reconciliationDeliveredKeys = new Set<string>();
  private readonly transactionInbox = new Map<string, CommerceTransaction>();
  private readonly quarantineInbox = new Map<string, CommerceQuarantinedTransaction>();
  private readonly observedTransactions = new Map<string, CommerceTransaction>();
  private readonly acknowledgementsByReference = new Map<
    string,
    CommerceServerVerifiedAcknowledgement
  >();
  private validAcknowledgements = new WeakSet<object>();
  private completedAcknowledgements = new WeakSet<object>();
  private readonly finishedReferences = new Set<string>();
  private readonly runtime: StoreKitCommerceRuntime;
  private readonly purchaseEventTimeoutMs: number;
  private readonly nativeCallTimeoutMs: number;

  constructor(
    private readonly client: StoreKitClient,
    options: StoreKitCommerceProviderOptions = {},
  ) {
    this.runtime = options.runtime ?? DEFAULT_RUNTIME;
    this.purchaseEventTimeoutMs = Math.max(
      1,
      options.purchaseEventTimeoutMs ?? DEFAULT_PURCHASE_EVENT_TIMEOUT_MS,
    );
    this.nativeCallTimeoutMs = Math.max(
      1,
      options.nativeCallTimeoutMs ?? DEFAULT_NATIVE_CALL_TIMEOUT_MS,
    );
  }

  private async connect(): Promise<boolean> {
    if (this.disposed) return false;
    if (!this.connectPromise) {
      this.connectPromise = this.client
        .connect({
          onPurchaseUpdated: (transaction) => this.handlePurchaseUpdated(transaction),
          onPurchaseError: (error) => this.handlePurchaseError(error),
        })
        .catch((error: unknown) => {
          this.connectPromise = undefined;
          throw error;
        });
    }

    const connection = this.connectPromise;
    const outcome = await this.runNativeCall(() => connection);
    return outcome.state === 'succeeded' && !this.disposed;
  }

  private disposedResult(): CommerceErrorResult {
    return errorResult('commerce_provider_disposed', { retryable: false });
  }

  async listOfferings(): Promise<CommerceResult<CommerceCatalog>> {
    if (this.disposed) return this.disposedResult();
    if (!(await this.connect())) {
      return this.disposed ? this.disposedResult() : connectionFailure();
    }

    const productQuery = await this.runNativeCall(() =>
      this.client.fetchProducts(APPLE_MEMBERSHIP_PRODUCT_IDS),
    );
    if (productQuery.state !== 'succeeded') {
      return errorResult('commerce_catalog_query_failed', { retryable: true });
    }
    const storeProducts = productQuery.value;

    const storeProductById = new Map(
      storeProducts.map((product) => [product.productId, product] as const),
    );
    const products = listMembershipProducts();
    if (storeProductById.size !== products.length) {
      return errorResult('commerce_catalog_incomplete', { retryable: true });
    }

    const offerings: CommerceOffering[] = [];
    for (const product of products) {
      const storeProduct = storeProductById.get(product.appleProductId);
      if (
        !storeProduct ||
        storeProduct.productTypeIOS !== 'non-renewing-subscription' ||
        !storeProduct.localizedPrice.trim() ||
        !storeProduct.currencyCode.trim()
      ) {
        return errorResult('commerce_catalog_invalid', { retryable: false });
      }

      offerings.push({
        key: product.key,
        title: product.title,
        durationDays: product.durationDays,
        recommended: product.recommended,
        localizedPrice: storeProduct.localizedPrice,
        currencyCode: storeProduct.currencyCode,
      });
    }

    return success({ offerings });
  }

  async purchase(
    request: CommercePurchaseRequest,
  ): Promise<CommerceResult<CommercePurchase>> {
    if (this.disposed) return this.disposedResult();
    const product = getMembershipProductByKey(request.offeringKey);
    if (!product) {
      return errorResult('commerce_offering_unknown', { retryable: false });
    }
    if (!APPLICATION_ACCOUNT_TOKEN_PATTERN.test(request.applicationAccountToken)) {
      return errorResult('commerce_account_token_invalid', { retryable: false });
    }
    if (this.pendingPurchase) {
      return errorResult('commerce_purchase_busy', { retryable: true });
    }

    let resolvePurchase!: (result: CommerceResult<CommercePurchase>) => void;
    const resultPromise = new Promise<CommerceResult<CommercePurchase>>((resolve) => {
      resolvePurchase = resolve;
    });
    const pendingPurchase: PendingPurchase = {
      productId: product.appleProductId,
      applicationAccountToken: request.applicationAccountToken,
      requestStartedAt: this.runtime.now(),
      purchaseDispatched: false,
      resolve: resolvePurchase,
      cancelTimeout: () => undefined,
    };
    this.pendingPurchase = pendingPurchase;
    pendingPurchase.cancelTimeout = this.runtime.schedule(this.purchaseEventTimeoutMs, () => {
      this.completePendingPurchase(
        pendingPurchase,
        errorResult('commerce_purchase_timed_out', {
          retryable: true,
          charged: pendingPurchase.purchaseDispatched ? 'unknown' : false,
        }),
      );
    });
    void this.beginPurchase(pendingPurchase);

    return resultPromise;
  }

  async drainTransactionInbox(): Promise<CommerceResult<CommerceTransactionInbox>> {
    if (this.disposed) return this.disposedResult();
    if (!(await this.connect())) {
      return this.disposed ? this.disposedResult() : connectionFailure();
    }
    return success(this.drainInbox());
  }

  async reconcileTransactions(): Promise<CommerceResult<CommerceTransactionInbox>> {
    if (this.disposed) return this.disposedResult();
    if (!(await this.connect())) {
      return this.disposed ? this.disposedResult() : connectionFailure();
    }

    const history = await this.runNativeCall(() => this.client.getTransactions());
    if (history.state !== 'succeeded') {
      return errorResult('commerce_restore_failed', { retryable: true });
    }

    return success(this.reconcileSnapshot(history.value, this.drainInbox()));
  }

  async restorePurchases(): Promise<CommerceResult<CommerceRestore>> {
    if (this.disposed) return this.disposedResult();
    if (!(await this.connect())) {
      return this.disposed ? this.disposedResult() : connectionFailure();
    }

    const sync = await this.runNativeCall(() => this.client.syncPurchases());
    if (sync.state !== 'succeeded') {
      return errorResult('commerce_restore_failed', { retryable: true });
    }
    const history = await this.runNativeCall(() => this.client.getTransactions());
    if (history.state !== 'succeeded') {
      return errorResult('commerce_restore_failed', { retryable: true });
    }

    this.reconciliationDeliveredKeys.clear();
    return success(this.reconcileSnapshot(history.value, this.drainInbox()));
  }

  private reconcileSnapshot(
    storeTransactions: readonly StoreKitTransaction[],
    liveInbox: CommerceTransactionInbox,
  ): CommerceTransactionInbox {
    const recognizedByReference = new Map(
      liveInbox.transactions.map((transaction) => [transaction.transactionReference, transaction]),
    );
    const quarantinedByReference = new Map<string, CommerceQuarantinedTransaction>();
    for (const transaction of liveInbox.quarantinedTransactions) {
      quarantinedByReference.set(this.quarantineKey(transaction), transaction);
    }
    for (const storeTransaction of storeTransactions) {
      const transaction = toCommerceTransaction(storeTransaction);
      if (transaction) {
        recognizedByReference.set(transaction.transactionReference, transaction);
        continue;
      }
      const quarantinedTransaction = toQuarantinedTransaction(storeTransaction);
      if (quarantinedTransaction) {
        quarantinedByReference.set(
          this.quarantineKey(quarantinedTransaction),
          quarantinedTransaction,
        );
      }
    }

    const entries = [
      ...[...recognizedByReference.values()].map((transaction) => ({
        kind: 'recognized' as const,
        deliveryKey: `recognized:${transaction.transactionReference}`,
        sortKey: `${transaction.purchasedAt}:${transaction.transactionReference}`,
        transaction,
      })),
      ...[...quarantinedByReference.values()].map((transaction) => ({
        kind: 'quarantined' as const,
        deliveryKey: `quarantined:${this.quarantineKey(transaction)}`,
        sortKey: `${transaction.purchasedAt ?? ''}:${this.quarantineKey(transaction)}`,
        transaction,
      })),
    ]
      .sort((left, right) => left.sortKey.localeCompare(right.sortKey))
      .filter((entry) => !this.reconciliationDeliveredKeys.has(entry.deliveryKey));

    const page = entries.slice(0, MAX_INBOX_ENTRIES);
    page.forEach((entry) => this.reconciliationDeliveredKeys.add(entry.deliveryKey));
    const overflowed = liveInbox.overflowed || entries.length > page.length;

    const transactions: CommerceTransaction[] = [];
    const quarantinedTransactions: CommerceQuarantinedTransaction[] = [];
    for (const entry of page) {
      if (entry.kind === 'recognized') {
        transactions.push(entry.transaction);
        this.setBounded(
          this.observedTransactions,
          entry.transaction.transactionReference,
          entry.transaction,
          MAX_OBSERVED_TRANSACTIONS,
          false,
          (evictedReference) => this.acknowledgementsByReference.delete(evictedReference),
        );
      } else {
        quarantinedTransactions.push(entry.transaction);
      }
    }
    const inbox = {
      transactions,
      quarantinedTransactions,
      overflowed,
      entitlementGranted: false,
    } as const;
    if (!overflowed) this.reconciliationDeliveredKeys.clear();
    return inbox;
  }

  async markServerVerified(
    request: CommerceServerVerificationRequest,
  ): Promise<CommerceResult<CommerceServerVerifiedAcknowledgement>> {
    if (this.disposed) return this.disposedResult();
    const transaction = this.observedTransactions.get(request.transactionReference);
    if (!transaction || transaction.signedTransaction !== request.signedTransaction) {
      return errorResult('commerce_verification_required', { retryable: false });
    }

    const existing = this.acknowledgementsByReference.get(request.transactionReference);
    if (existing) return success(existing);

    const acknowledgement = Object.freeze({
      transactionReference: request.transactionReference,
    }) as CommerceServerVerifiedAcknowledgement;
    this.validAcknowledgements.add(acknowledgement);
    this.acknowledgementsByReference.set(request.transactionReference, acknowledgement);
    while (this.acknowledgementsByReference.size > MAX_OBSERVED_TRANSACTIONS) {
      const oldestReference = this.acknowledgementsByReference.keys().next().value as
        | string
        | undefined;
      if (!oldestReference) break;
      this.acknowledgementsByReference.delete(oldestReference);
    }
    return success(acknowledgement);
  }

  async finishTransaction(
    request: CommerceFinishRequest,
  ): Promise<CommerceResult<CommerceFinish>> {
    if (this.disposed) return this.disposedResult();
    const acknowledgement = request.acknowledgement;
    if (
      acknowledgement &&
      this.completedAcknowledgements.has(acknowledgement) &&
      this.finishedReferences.has(acknowledgement.transactionReference)
    ) {
      return success({
        transactionReference: acknowledgement.transactionReference,
        transactionFinished: true,
        completion: 'already-finished',
      });
    }
    if (
      !acknowledgement ||
      !this.validAcknowledgements.has(acknowledgement) ||
      this.acknowledgementsByReference.get(acknowledgement.transactionReference) !==
        acknowledgement
    ) {
      return errorResult('commerce_verification_required', { retryable: false });
    }

    const transactionReference = acknowledgement.transactionReference;
    if (!(await this.connect())) {
      return this.disposed ? this.disposedResult() : connectionFailure();
    }

    const finish = await this.runNativeCall(() =>
      this.client.finishTransaction(transactionReference),
    );
    if (finish.state === 'succeeded') {
      this.acknowledgementsByReference.delete(transactionReference);
      this.completedAcknowledgements.add(acknowledgement);
      this.setBoundedFinishedReference(transactionReference);
      return success({
        transactionReference,
        transactionFinished: true,
        completion: finish.value,
      });
    }
    const code =
      finish.state === 'failed' &&
      finish.error instanceof Error &&
      finish.error.message === 'storekit_transaction_unknown'
        ? 'commerce_transaction_unknown'
        : 'commerce_finish_failed';
    return errorResult(code, { retryable: code === 'commerce_finish_failed' });
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    const pendingPurchase = this.pendingPurchase;
    if (pendingPurchase) {
      this.completePendingPurchase(
        pendingPurchase,
        errorResult('commerce_provider_disposed', {
          retryable: false,
          charged: pendingPurchase.purchaseDispatched ? 'unknown' : false,
        }),
      );
    }
    await this.runNativeCall(() => this.client.disconnect());
    this.connectPromise = undefined;
    this.transactionInbox.clear();
    this.quarantineInbox.clear();
    this.observedTransactions.clear();
    this.acknowledgementsByReference.clear();
    this.finishedReferences.clear();
    this.validAcknowledgements = new WeakSet<object>();
    this.completedAcknowledgements = new WeakSet<object>();
    this.reconciliationDeliveredKeys.clear();
  }

  private async beginPurchase(pendingPurchase: PendingPurchase): Promise<void> {
    if (!(await this.connect())) {
      this.completePendingPurchase(
        pendingPurchase,
        this.disposed ? this.disposedResult() : connectionFailure(),
      );
      return;
    }
    if (this.disposed || this.pendingPurchase !== pendingPurchase) return;

    pendingPurchase.purchaseDispatched = true;
    try {
      // Native dispatch may itself hang. Transaction events and our timeout own completion.
      await this.client.requestPurchase({
        productId: pendingPurchase.productId,
        applicationAccountToken: pendingPurchase.applicationAccountToken,
      });
    } catch {
      this.completePendingPurchase(
        pendingPurchase,
        errorResult('commerce_purchase_failed', {
          retryable: true,
          charged: 'unknown',
        }),
      );
    }
  }

  private runNativeCall<T>(call: () => Promise<T>): Promise<NativeCallOutcome<T>> {
    return new Promise((resolve) => {
      let completed = false;
      let cancelTimeout: () => void = () => undefined;
      const complete = (outcome: NativeCallOutcome<T>) => {
        if (completed) return;
        completed = true;
        cancelTimeout();
        resolve(outcome);
      };
      cancelTimeout = this.runtime.schedule(this.nativeCallTimeoutMs, () => {
        complete({ state: 'timed-out' });
      });

      if (completed) return;
      let nativeCall: Promise<T>;
      try {
        nativeCall = call();
      } catch (error) {
        complete({ state: 'failed', error });
        return;
      }
      void nativeCall.then(
        (value) => complete({ state: 'succeeded', value }),
        (error) => complete({ state: 'failed', error }),
      );
    });
  }

  private completePendingPurchase(
    pendingPurchase: PendingPurchase,
    result: CommerceResult<CommercePurchase>,
  ): void {
    if (this.pendingPurchase !== pendingPurchase) return;
    this.pendingPurchase = undefined;
    pendingPurchase.cancelTimeout();
    pendingPurchase.resolve(result);
  }

  private ingestTransaction(transaction: StoreKitTransaction): CommerceTransaction | undefined {
    const commerceTransaction = toCommerceTransaction(transaction);
    if (commerceTransaction) {
      this.setBounded(
        this.observedTransactions,
        commerceTransaction.transactionReference,
        commerceTransaction,
        MAX_OBSERVED_TRANSACTIONS,
        false,
        (evictedReference) => this.acknowledgementsByReference.delete(evictedReference),
      );
      this.setBounded(
        this.transactionInbox,
        commerceTransaction.transactionReference,
        commerceTransaction,
        MAX_INBOX_ENTRIES,
        true,
      );
      return commerceTransaction;
    }

    const quarantinedTransaction = toQuarantinedTransaction(transaction);
    if (quarantinedTransaction) {
      const key =
        quarantinedTransaction.transactionReference ??
        `${quarantinedTransaction.productId}:${quarantinedTransaction.purchasedAt ?? 'unknown'}:${this.fallbackInboxKey++}`;
      this.setBounded(
        this.quarantineInbox,
        key,
        quarantinedTransaction,
        MAX_INBOX_ENTRIES,
        true,
      );
    }
    return undefined;
  }

  private setBounded<T>(
    map: Map<string, T>,
    key: string,
    value: T,
    maximum: number,
    reportOverflow: boolean,
    onEvict?: (key: string) => void,
  ): void {
    map.delete(key);
    map.set(key, value);
    while (map.size > maximum) {
      const oldestKey = map.keys().next().value as string | undefined;
      if (oldestKey === undefined) break;
      map.delete(oldestKey);
      onEvict?.(oldestKey);
      if (reportOverflow) this.inboxOverflowed = true;
    }
  }

  private setBoundedFinishedReference(transactionReference: string): void {
    this.finishedReferences.delete(transactionReference);
    this.finishedReferences.add(transactionReference);
    while (this.finishedReferences.size > MAX_FINISHED_TRANSACTION_REFERENCES) {
      const oldestReference = this.finishedReferences.values().next().value as
        | string
        | undefined;
      if (!oldestReference) break;
      this.finishedReferences.delete(oldestReference);
    }
  }

  private quarantineKey(transaction: CommerceQuarantinedTransaction): string {
    return (
      transaction.transactionReference ??
      `${transaction.productId}:${transaction.purchasedAt ?? 'unknown'}:${transaction.signedTransaction ?? 'unsigned'}`
    );
  }

  private drainInbox(): CommerceTransactionInbox {
    const transactions = [...this.transactionInbox.values()].sort((left, right) =>
      left.purchasedAt.localeCompare(right.purchasedAt),
    );
    const quarantinedTransactions = [...this.quarantineInbox.values()].sort((left, right) =>
      (left.purchasedAt ?? '').localeCompare(right.purchasedAt ?? ''),
    );
    const overflowed = this.inboxOverflowed;
    this.transactionInbox.clear();
    this.quarantineInbox.clear();
    this.inboxOverflowed = false;
    return {
      transactions,
      quarantinedTransactions,
      overflowed,
      entitlementGranted: false,
    };
  }

  private handlePurchaseUpdated(transaction: StoreKitTransaction): void {
    if (this.disposed) return;
    // Every completed transaction enters the inbox before request correlation.
    const commerceTransaction = this.ingestTransaction(transaction);
    const pendingPurchase = this.pendingPurchase;
    if (
      !pendingPurchase ||
      transaction.productId !== pendingPurchase.productId ||
      transaction.appAccountToken !== pendingPurchase.applicationAccountToken ||
      !Number.isFinite(transaction.transactionDate) ||
      transaction.transactionDate < pendingPurchase.requestStartedAt
    ) {
      return;
    }

    if (transaction.purchaseState === 'pending') {
      this.completePendingPurchase(pendingPurchase, PURCHASE_PENDING_RESULT);
      return;
    }
    if (!commerceTransaction) {
      this.completePendingPurchase(
        pendingPurchase,
        errorResult('commerce_purchase_failed', {
          retryable: false,
          charged: 'unknown',
        }),
      );
      return;
    }

    this.completePendingPurchase(
      pendingPurchase,
      success({
        transaction: commerceTransaction,
        entitlementGranted: false,
        transactionFinished: false,
      }),
    );
  }

  private handlePurchaseError(error: StoreKitPurchaseError): void {
    if (this.disposed) return;
    const pendingPurchase = this.pendingPurchase;
    if (!pendingPurchase || (error.productId && error.productId !== pendingPurchase.productId)) {
      return;
    }

    if (error.code === 'user-cancelled') {
      this.completePendingPurchase(pendingPurchase, PURCHASE_CANCELLED_RESULT);
      return;
    }
    if (error.code === 'deferred-payment' || error.code === 'pending') {
      this.completePendingPurchase(pendingPurchase, PURCHASE_PENDING_RESULT);
      return;
    }

    this.completePendingPurchase(
      pendingPurchase,
      errorResult('commerce_purchase_failed', {
        retryable: true,
        charged: 'unknown',
      }),
    );
  }
}

export function createStoreKitNativeCommerceProvider(
  client: StoreKitClient,
  options?: StoreKitCommerceProviderOptions,
): NativeCommerceProvider {
  return new StoreKitNativeCommerceProvider(client, options);
}
