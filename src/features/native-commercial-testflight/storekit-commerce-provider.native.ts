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
  type CommerceRestore,
  type CommerceResult,
  type CommerceSuccessResult,
  type CommerceTransaction,
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
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

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

function toCommerceTransaction(
  transaction: StoreKitTransaction,
): CommerceTransaction | undefined {
  const product = getMembershipProductByAppleId(transaction.productId);
  if (
    !product ||
    transaction.purchaseState !== 'purchased' ||
    !transaction.transactionId ||
    !transaction.purchaseToken ||
    !Number.isFinite(transaction.transactionDate)
  ) {
    return undefined;
  }

  return {
    offeringKey: product.key,
    transactionReference: transaction.transactionId,
    purchasedAt: new Date(transaction.transactionDate).toISOString(),
    signedTransaction: transaction.purchaseToken,
    environment: normalizeStoreKitEnvironment(transaction.environmentIOS),
    requiresServerVerification: true,
  };
}

type PendingPurchase = {
  productId: string;
  resolve(result: CommerceResult<CommercePurchase>): void;
};

export class StoreKitNativeCommerceProvider implements NativeCommerceProvider {
  private connectPromise?: Promise<void>;
  private pendingPurchase?: PendingPurchase;

  constructor(private readonly client: StoreKitClient) {}

  private async connect(): Promise<boolean> {
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

    try {
      await this.connectPromise;
      return true;
    } catch {
      return false;
    }
  }

  async listOfferings(): Promise<CommerceResult<CommerceCatalog>> {
    if (!(await this.connect())) return connectionFailure();

    let storeProducts;
    try {
      storeProducts = await this.client.fetchProducts(APPLE_MEMBERSHIP_PRODUCT_IDS);
    } catch {
      return errorResult('commerce_catalog_query_failed', { retryable: true });
    }

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
    if (!(await this.connect())) return connectionFailure();

    let resolvePurchase!: (result: CommerceResult<CommercePurchase>) => void;
    const resultPromise = new Promise<CommerceResult<CommercePurchase>>((resolve) => {
      resolvePurchase = resolve;
    });
    this.pendingPurchase = {
      productId: product.appleProductId,
      resolve: resolvePurchase,
    };

    try {
      await this.client.requestPurchase({
        productId: product.appleProductId,
        applicationAccountToken: request.applicationAccountToken,
      });
    } catch {
      if (this.pendingPurchase?.resolve === resolvePurchase) {
        this.pendingPurchase = undefined;
        resolvePurchase(
          errorResult('commerce_purchase_failed', {
            retryable: true,
            charged: 'unknown',
          }),
        );
      }
    }

    return resultPromise;
  }

  async restorePurchases(): Promise<CommerceResult<CommerceRestore>> {
    if (!(await this.connect())) return connectionFailure();

    let storeTransactions;
    try {
      storeTransactions = await this.client.restorePurchases();
    } catch {
      return errorResult('commerce_restore_failed', { retryable: true });
    }

    const uniqueTransactions = new Map<string, CommerceTransaction>();
    for (const storeTransaction of storeTransactions) {
      const transaction = toCommerceTransaction(storeTransaction);
      if (transaction) uniqueTransactions.set(transaction.transactionReference, transaction);
    }

    const transactions = [...uniqueTransactions.values()].sort((left, right) =>
      left.purchasedAt.localeCompare(right.purchasedAt),
    );
    return success({ transactions, entitlementGranted: false });
  }

  async finishTransaction(
    request: CommerceFinishRequest,
  ): Promise<CommerceResult<CommerceFinish>> {
    if (!request.transactionReference.trim()) {
      return errorResult('commerce_transaction_unknown', { retryable: false });
    }
    if (!(await this.connect())) return connectionFailure();

    try {
      await this.client.finishTransaction(request.transactionReference);
      return success({
        transactionReference: request.transactionReference,
        transactionFinished: true,
      });
    } catch (error) {
      const code =
        error instanceof Error && error.message === 'storekit_transaction_unknown'
          ? 'commerce_transaction_unknown'
          : 'commerce_finish_failed';
      return errorResult(code, { retryable: code === 'commerce_finish_failed' });
    }
  }

  private handlePurchaseUpdated(transaction: StoreKitTransaction): void {
    const pendingPurchase = this.pendingPurchase;
    if (!pendingPurchase || transaction.productId !== pendingPurchase.productId) return;

    if (transaction.purchaseState === 'pending') {
      this.pendingPurchase = undefined;
      pendingPurchase.resolve(PURCHASE_PENDING_RESULT);
      return;
    }

    const commerceTransaction = toCommerceTransaction(transaction);
    this.pendingPurchase = undefined;
    if (!commerceTransaction) {
      pendingPurchase.resolve(
        errorResult('commerce_purchase_failed', {
          retryable: false,
          charged: 'unknown',
        }),
      );
      return;
    }

    pendingPurchase.resolve(
      success({
        transaction: commerceTransaction,
        entitlementGranted: false,
        transactionFinished: false,
      }),
    );
  }

  private handlePurchaseError(error: StoreKitPurchaseError): void {
    const pendingPurchase = this.pendingPurchase;
    if (!pendingPurchase) return;
    this.pendingPurchase = undefined;

    if (error.code === 'user-cancelled') {
      pendingPurchase.resolve(PURCHASE_CANCELLED_RESULT);
      return;
    }
    if (error.code === 'deferred-payment' || error.code === 'pending') {
      pendingPurchase.resolve(PURCHASE_PENDING_RESULT);
      return;
    }

    pendingPurchase.resolve(
      errorResult('commerce_purchase_failed', {
        retryable: true,
        charged: 'unknown',
      }),
    );
  }
}

export function createStoreKitNativeCommerceProvider(client: StoreKitClient): NativeCommerceProvider {
  return new StoreKitNativeCommerceProvider(client);
}
