import type {
  CommerceOfferingKey,
  CommerceServerVerifiedAcknowledgement,
} from '../commerce-provider.native';
import {
  APPLE_MEMBERSHIP_PRODUCT_IDS,
  getMembershipProductByKey,
  listMembershipProducts,
} from '../membership-products.native';
import {
  createStoreKitNativeCommerceProvider,
  type StoreKitCommerceRuntime,
} from '../storekit-commerce-provider.native';
import type {
  StoreKitClient,
  StoreKitEventHandlers,
  StoreKitFinishCompletion,
  StoreKitProduct,
  StoreKitTransaction,
} from '../storekit-client.native';
import { CommerceRuntimeOperationGate } from '../commerce-runtime-operation.native';

const ACCOUNT_TOKEN = '12345678-1234-4234-8234-123456789abc';
const NOW = Date.UTC(2026, 7, 24, 8);

class ManualRuntime implements StoreKitCommerceRuntime {
  nowMs = NOW;
  private readonly callbacks = new Set<() => void>();

  now(): number {
    return this.nowMs;
  }

  schedule(_delayMs: number, callback: () => void): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }

  fireTimeouts(): void {
    const callbacks = [...this.callbacks];
    this.callbacks.clear();
    callbacks.forEach((callback) => callback());
  }
}

class FakeStoreKitClient implements StoreKitClient {
  handlers?: StoreKitEventHandlers;
  connectionError = false;
  connectNeverResolves = false;
  fetchNeverResolves = false;
  historyNeverResolves = false;
  syncNeverResolves = false;
  disconnectNeverResolves = false;
  finishNeverResolves = false;
  getTransactionsCount = 0;
  syncPurchasesCount = 0;
  products: readonly StoreKitProduct[] = listMembershipProducts().map((product, index) => ({
    productId: product.appleProductId,
    localizedPrice: `本地价格 ${index + 1}`,
    currencyCode: 'CNY',
    productTypeIOS: 'non-renewing-subscription',
  }));
  restoredTransactions: readonly StoreKitTransaction[] = [];
  requestError = false;
  requestNeverResolves = false;
  onRequest?: (input: { productId: string; applicationAccountToken: string }) => void;
  requested: { productId: string; applicationAccountToken: string }[] = [];
  finished: string[] = [];
  unknownFinishReferences = new Set<string>();
  failedFinishReferences = new Set<string>();
  disconnectCount = 0;
  private requestStartedResolve!: () => void;
  readonly requestStarted = new Promise<void>((resolve) => {
    this.requestStartedResolve = resolve;
  });
  private connectStartedResolve!: () => void;
  readonly connectStarted = new Promise<void>((resolve) => {
    this.connectStartedResolve = resolve;
  });
  private fetchStartedResolve!: () => void;
  readonly fetchStarted = new Promise<void>((resolve) => {
    this.fetchStartedResolve = resolve;
  });
  private historyStartedResolve!: () => void;
  readonly historyStarted = new Promise<void>((resolve) => {
    this.historyStartedResolve = resolve;
  });
  private syncStartedResolve!: () => void;
  readonly syncStarted = new Promise<void>((resolve) => {
    this.syncStartedResolve = resolve;
  });
  private disconnectStartedResolve!: () => void;
  readonly disconnectStarted = new Promise<void>((resolve) => {
    this.disconnectStartedResolve = resolve;
  });
  private finishStartedResolve!: () => void;
  readonly finishStarted = new Promise<void>((resolve) => {
    this.finishStartedResolve = resolve;
  });
  private resolveNativeRequest?: () => void;

  settleNativeRequest() {
    this.resolveNativeRequest?.();
  }

  async connect(handlers: StoreKitEventHandlers): Promise<void> {
    this.connectStartedResolve();
    if (this.connectionError) throw new Error('offline');
    if (this.connectNeverResolves) await new Promise<void>(() => undefined);
    this.handlers = handlers;
  }

  async fetchProducts(): Promise<readonly StoreKitProduct[]> {
    this.fetchStartedResolve();
    if (this.fetchNeverResolves) await new Promise<void>(() => undefined);
    return this.products;
  }

  async requestPurchase(input: {
    productId: string;
    applicationAccountToken: string;
  }): Promise<void> {
    this.requested.push(input);
    this.requestStartedResolve();
    if (this.requestError) throw new Error('request failed');
    this.onRequest?.(input);
    if (this.requestNeverResolves) {
      await new Promise<void>((resolve) => { this.resolveNativeRequest = resolve; });
    }
  }

  async getTransactions(): Promise<readonly StoreKitTransaction[]> {
    this.getTransactionsCount += 1;
    this.historyStartedResolve();
    if (this.historyNeverResolves) await new Promise<void>(() => undefined);
    return this.restoredTransactions;
  }

  async syncPurchases(): Promise<void> {
    this.syncPurchasesCount += 1;
    this.syncStartedResolve();
    if (this.syncNeverResolves) await new Promise<void>(() => undefined);
  }

  async finishTransaction(transactionReference: string): Promise<StoreKitFinishCompletion> {
    this.finishStartedResolve();
    if (this.finishNeverResolves) await new Promise<void>(() => undefined);
    if (this.unknownFinishReferences.has(transactionReference)) {
      throw new Error('storekit_transaction_unknown');
    }
    if (this.failedFinishReferences.has(transactionReference)) throw new Error('finish failed');
    this.finished.push(transactionReference);
    return 'finished';
  }

  async disconnect(): Promise<void> {
    this.disconnectCount += 1;
    this.handlers = undefined;
    this.disconnectStartedResolve();
    if (this.disconnectNeverResolves) await new Promise<void>(() => undefined);
  }
}

function purchasedTransaction(
  productId = APPLE_MEMBERSHIP_PRODUCT_IDS[1],
  overrides: Partial<StoreKitTransaction> = {},
): StoreKitTransaction {
  return {
    productId,
    transactionId: 'transaction-31d',
    purchaseState: 'purchased',
    purchaseToken: 'signed-jws-from-storekit',
    transactionDate: NOW + 1_000,
    environmentIOS: 'Sandbox',
    appAccountToken: ACCOUNT_TOKEN,
    ...overrides,
  };
}

function createProvider(client: FakeStoreKitClient, runtime = new ManualRuntime()) {
  return {
    provider: createStoreKitNativeCommerceProvider(client, {
      runtime,
      purchaseEventTimeoutMs: 100,
      nativeCallTimeoutMs: 100,
    }),
    runtime,
  };
}

describe('StoreKit native commerce provider', () => {
  it('returns the three active offerings in duration order using only StoreKit localized prices', async () => {
    const client = new FakeStoreKitClient();
    const { provider } = createProvider(client);

    const result = await provider.listOfferings();

    expect(result).toEqual({
      ok: true,
      state: 'succeeded',
      value: {
        offerings: [
          expect.objectContaining({ key: 'membership_7d_v1', localizedPrice: '本地价格 1' }),
          expect.objectContaining({
            key: 'membership_31d_v1',
            localizedPrice: '本地价格 2',
            recommended: false,
          }),
          expect.objectContaining({ key: 'membership_93d_v1', localizedPrice: '本地价格 3' }),
        ],
      },
    });
    if (result.ok) {
      expect(result.value.offerings.map((offering) => offering.durationDays)).toEqual([
        7, 31, 93,
      ]);
    }
  });

  it('fails closed for incomplete or wrongly typed App Store catalogs', async () => {
    const incompleteClient = new FakeStoreKitClient();
    incompleteClient.products = incompleteClient.products.slice(0, 2);
    const invalidClient = new FakeStoreKitClient();
    invalidClient.products = invalidClient.products.map((product, index) =>
      index === 0 ? { ...product, productTypeIOS: 'consumable' } : product,
    );

    await expect(createProvider(incompleteClient).provider.listOfferings()).resolves.toEqual(
      expect.objectContaining({ code: 'commerce_catalog_incomplete', charged: false }),
    );
    await expect(createProvider(invalidClient).provider.listOfferings()).resolves.toEqual(
      expect.objectContaining({ code: 'commerce_catalog_invalid', charged: false }),
    );
  });

  it('bounds StoreKit connection and catalog calls with retryable uncharged results', async () => {
    const connectingClient = new FakeStoreKitClient();
    connectingClient.connectNeverResolves = true;
    const connecting = createProvider(connectingClient);
    const connectionResult = connecting.provider.listOfferings();
    await connectingClient.connectStarted;
    connecting.runtime.fireTimeouts();
    await expect(connectionResult).resolves.toEqual({
      ok: false,
      state: 'unavailable',
      code: 'commerce_store_connection_failed',
      charged: false,
      retryable: true,
    });
    await connecting.provider.dispose();

    const catalogClient = new FakeStoreKitClient();
    catalogClient.fetchNeverResolves = true;
    const catalog = createProvider(catalogClient);
    const catalogResult = catalog.provider.listOfferings();
    await catalogClient.fetchStarted;
    catalog.runtime.fireTimeouts();
    await expect(catalogResult).resolves.toEqual(
      expect.objectContaining({
        code: 'commerce_catalog_query_failed',
        charged: false,
        retryable: true,
      }),
    );
    await catalog.provider.dispose();
  });

  it('returns a signed unfinished transaction and also retains it in the verification inbox', async () => {
    const client = new FakeStoreKitClient();
    client.onRequest = (input) => {
      client.handlers?.onPurchaseUpdated(purchasedTransaction(input.productId));
    };
    const { provider } = createProvider(client);

    const result = await provider.purchase({
      offeringKey: 'membership_31d_v1',
      applicationAccountToken: ACCOUNT_TOKEN,
    });

    expect(client.requested).toEqual([
      {
        productId: APPLE_MEMBERSHIP_PRODUCT_IDS[1],
        applicationAccountToken: ACCOUNT_TOKEN,
      },
    ]);
    expect(result).toEqual({
      ok: true,
      state: 'succeeded',
      value: {
        transaction: {
          offeringKey: 'membership_31d_v1',
          transactionReference: 'transaction-31d',
          purchasedAt: '2026-08-24T08:00:01.000Z',
          signedTransaction: 'signed-jws-from-storekit',
          environment: 'sandbox',
          requiresServerVerification: true,
        },
        entitlementGranted: false,
        transactionFinished: false,
      },
    });
    await expect(provider.drainTransactionInbox()).resolves.toEqual({
      ok: true,
      state: 'succeeded',
      value: {
        transactions: [expect.objectContaining({ transactionReference: 'transaction-31d' })],
        quarantinedTransactions: [],
        overflowed: false,
        entitlementGranted: false,
      },
    });
  });

  it.each([
    ['user-cancelled', 'cancelled', 'commerce_purchase_cancelled'],
    ['deferred-payment', 'pending', 'commerce_purchase_pending'],
    ['pending', 'pending', 'commerce_purchase_pending'],
    ['network-error', 'error', 'commerce_purchase_failed'],
  ])('maps StoreKit %s to a stable %s result', async (nativeCode, state, businessCode) => {
    const client = new FakeStoreKitClient();
    client.onRequest = () => client.handlers?.onPurchaseError({ code: nativeCode });
    const { provider } = createProvider(client);

    await expect(
      provider.purchase({
        offeringKey: 'membership_7d_v1',
        applicationAccountToken: ACCOUNT_TOKEN,
      }),
    ).resolves.toEqual(expect.objectContaining({ ok: false, state, code: businessCode }));
  });

  it('maps a correlated StoreKit pending transaction update without finishing it', async () => {
    const client = new FakeStoreKitClient();
    client.onRequest = (input) =>
      client.handlers?.onPurchaseUpdated(
        purchasedTransaction(input.productId, {
          transactionId: 'pending-transaction',
          purchaseState: 'pending',
          purchaseToken: undefined,
        }),
      );
    const { provider } = createProvider(client);

    await expect(
      provider.purchase({
        offeringKey: 'membership_31d_v1',
        applicationAccountToken: ACCOUNT_TOKEN,
      }),
    ).resolves.toEqual(
      expect.objectContaining({ state: 'pending', code: 'commerce_purchase_pending' }),
    );
    expect(client.finished).toEqual([]);
  });

  it('accepts only non-nil RFC 4122 UUIDs with a standard version and variant', async () => {
    const client = new FakeStoreKitClient();
    const { provider } = createProvider(client);
    const invalidTokens = [
      'not-a-uuid',
      '00000000-0000-0000-0000-000000000000',
      '12345678-1234-0234-8234-123456789abc',
      '12345678-1234-4234-1234-123456789abc',
    ];

    for (const applicationAccountToken of invalidTokens) {
      await expect(
        provider.purchase({
          offeringKey: 'membership_7d_v1',
          applicationAccountToken,
        }),
      ).resolves.toEqual(
        expect.objectContaining({ code: 'commerce_account_token_invalid', charged: false }),
      );
    }

    client.onRequest = () => client.handlers?.onPurchaseError({ code: 'user-cancelled' });
    await expect(
      provider.purchase({
        offeringKey: 'membership_7d_v1',
        applicationAccountToken: ACCOUNT_TOKEN,
      }),
    ).resolves.toEqual(expect.objectContaining({ code: 'commerce_purchase_cancelled' }));
  });

  it('rejects duplicate attempts and maps native dispatch failure without keeping the provider busy', async () => {
    const client = new FakeStoreKitClient();
    const { provider } = createProvider(client);
    const firstPurchase = provider.purchase({
      offeringKey: 'membership_7d_v1',
      applicationAccountToken: ACCOUNT_TOKEN,
    });
    await client.requestStarted;

    await expect(
      provider.purchase({
        offeringKey: 'membership_31d_v1',
        applicationAccountToken: ACCOUNT_TOKEN,
      }),
    ).resolves.toEqual(expect.objectContaining({ code: 'commerce_purchase_busy' }));
    client.handlers?.onPurchaseError({ code: 'user-cancelled' });
    await expect(firstPurchase).resolves.toEqual(
      expect.objectContaining({ code: 'commerce_purchase_cancelled' }),
    );

    const failingClient = new FakeStoreKitClient();
    failingClient.requestError = true;
    const failingProvider = createProvider(failingClient).provider;
    await expect(
      failingProvider.purchase({
        offeringKey: 'membership_7d_v1',
        applicationAccountToken: ACCOUNT_TOKEN,
      }),
    ).resolves.toEqual(
      expect.objectContaining({ code: 'commerce_purchase_failed', charged: 'unknown' }),
    );
    failingClient.requestError = false;
    failingClient.onRequest = () => failingClient.handlers?.onPurchaseError({ code: 'user-cancelled' });
    await expect(
      failingProvider.purchase({
        offeringKey: 'membership_7d_v1',
        applicationAccountToken: ACCOUNT_TOKEN,
      }),
    ).resolves.toEqual(expect.objectContaining({ code: 'commerce_purchase_cancelled' }));
  });

  it('reconciles cold-start history with JWS/environment and quarantines unknown or invalid products', async () => {
    const client = new FakeStoreKitClient();
    client.restoredTransactions = [
      purchasedTransaction(),
      purchasedTransaction(APPLE_MEMBERSHIP_PRODUCT_IDS[0], {
        transactionId: 'transaction-7d',
        transactionDate: NOW - 1_000,
        purchaseToken: 'signed-7d-jws',
        environmentIOS: 'Production',
      }),
      purchasedTransaction('unrelated.product', { transactionId: 'unrelated' }),
      purchasedTransaction(APPLE_MEMBERSHIP_PRODUCT_IDS[1], {
        transactionId: 'unsigned',
        purchaseToken: undefined,
      }),
    ];
    const { provider } = createProvider(client);

    const result = await provider.restorePurchases();

    expect(result).toEqual({
      ok: true,
      state: 'succeeded',
      value: {
        transactions: [
          expect.objectContaining({
            offeringKey: 'membership_7d_v1',
            transactionReference: 'transaction-7d',
            signedTransaction: 'signed-7d-jws',
            environment: 'production',
          }),
          expect.objectContaining({
            offeringKey: 'membership_31d_v1',
            transactionReference: 'transaction-31d',
          }),
        ],
        quarantinedTransactions: [
          expect.objectContaining({
            transactionReference: 'unrelated',
            reason: 'unknown_product',
            finishAllowed: false,
          }),
          expect.objectContaining({
            transactionReference: 'unsigned',
            reason: 'invalid_transaction',
            finishAllowed: false,
          }),
        ],
        overflowed: false,
        entitlementGranted: false,
      },
    });
    expect(client.finished).toEqual([]);
  });

  it('requires an explicit cold-start reconciliation instead of depending on listener replay', async () => {
    const client = new FakeStoreKitClient();
    client.restoredTransactions = [
      purchasedTransaction(undefined, { transactionId: 'cold-start-unfinished' }),
    ];
    const { provider } = createProvider(client);

    await expect(provider.reconcileTransactions()).resolves.toEqual(
      expect.objectContaining({
        ok: true,
        value: expect.objectContaining({
          transactions: [
            expect.objectContaining({ transactionReference: 'cold-start-unfinished' }),
          ],
          entitlementGranted: false,
        }),
      }),
    );
    expect(client.getTransactionsCount).toBe(1);
    expect(client.syncPurchasesCount).toBe(0);
    expect(client.finished).toEqual([]);
  });

  it('restores retired 15/62-day purchases without offering them for new purchases', async () => {
    const client = new FakeStoreKitClient();
    const retired = (['membership_15d_v1', 'membership_62d_v1'] as const).map((key) => getMembershipProductByKey(key)!);
    client.restoredTransactions = retired.map((product) => purchasedTransaction(product.appleProductId, { transactionId: product.key }));
    const { provider } = createProvider(client);
    const restored = await provider.restorePurchases();
    expect(restored).toEqual(expect.objectContaining({ ok: true, value: expect.objectContaining({
      transactions: expect.arrayContaining(retired.map((product) => expect.objectContaining({ offeringKey: product.key }))),
      entitlementGranted: false,
    }) }));
    for (const product of retired) {
      expect(APPLE_MEMBERSHIP_PRODUCT_IDS).not.toContain(product.appleProductId);
      expect((await provider.purchase({ offeringKey: product.key, applicationAccountToken: ACCOUNT_TOKEN })).ok).toBe(false);
    }
    expect(client.requested).toEqual([]);
    await provider.dispose();
  });

  it('uses StoreKit sync only for the explicit Restore Purchases action', async () => {
    const client = new FakeStoreKitClient();
    client.restoredTransactions = [purchasedTransaction()];
    const { provider } = createProvider(client);

    await provider.reconcileTransactions();
    expect(client.getTransactionsCount).toBe(1);
    expect(client.syncPurchasesCount).toBe(0);

    await provider.restorePurchases();
    expect(client.getTransactionsCount).toBe(2);
    expect(client.syncPurchasesCount).toBe(1);
  });

  it('bounds silent history, explicit sync, and post-sync history independently', async () => {
    const silentClient = new FakeStoreKitClient();
    silentClient.historyNeverResolves = true;
    const silent = createProvider(silentClient);
    const silentResult = silent.provider.reconcileTransactions();
    await silentClient.historyStarted;
    silent.runtime.fireTimeouts();
    await expect(silentResult).resolves.toEqual(
      expect.objectContaining({
        code: 'commerce_restore_failed',
        charged: false,
        retryable: true,
      }),
    );
    expect(silentClient.syncPurchasesCount).toBe(0);
    await silent.provider.dispose();

    const syncClient = new FakeStoreKitClient();
    syncClient.syncNeverResolves = true;
    const sync = createProvider(syncClient);
    const syncResult = sync.provider.restorePurchases();
    await syncClient.syncStarted;
    sync.runtime.fireTimeouts();
    await expect(syncResult).resolves.toEqual(
      expect.objectContaining({
        code: 'commerce_restore_failed',
        charged: false,
        retryable: true,
      }),
    );
    expect(syncClient.getTransactionsCount).toBe(0);
    await sync.provider.dispose();

    const restoredHistoryClient = new FakeStoreKitClient();
    restoredHistoryClient.historyNeverResolves = true;
    const restoredHistory = createProvider(restoredHistoryClient);
    const restoredHistoryResult = restoredHistory.provider.restorePurchases();
    await restoredHistoryClient.historyStarted;
    restoredHistory.runtime.fireTimeouts();
    await expect(restoredHistoryResult).resolves.toEqual(
      expect.objectContaining({
        code: 'commerce_restore_failed',
        charged: false,
        retryable: true,
      }),
    );
    expect(restoredHistoryClient.syncPurchasesCount).toBe(1);
    await restoredHistory.provider.dispose();
  });

  it('pages a large cold-start history so every transaction can be submitted for server verification', async () => {
    const client = new FakeStoreKitClient();
    client.restoredTransactions = Array.from({ length: 513 }, (_, index) =>
      purchasedTransaction(undefined, {
        transactionId: `paged-history-${index}`,
        purchaseToken: `paged-history-jws-${index}`,
        transactionDate: NOW + index,
      }),
    );
    const { provider } = createProvider(client);
    const delivered = new Set<string>();
    const overflowStates: boolean[] = [];

    do {
      const page = await provider.reconcileTransactions();
      if (!page.ok) throw new Error('reconciliation should succeed');
      overflowStates.push(page.value.overflowed);
      for (const transaction of page.value.transactions) {
        delivered.add(transaction.transactionReference);
        await expect(
          provider.markServerVerified({
            transactionReference: transaction.transactionReference,
            signedTransaction: transaction.signedTransaction,
          }),
        ).resolves.toEqual(expect.objectContaining({ ok: true }));
      }
    } while (overflowStates.at(-1));

    expect(overflowStates).toEqual([true, true, false]);
    expect(delivered.size).toBe(513);
  });

  it('does not miss an earlier transaction inserted while a 513-entry history is paged', async () => {
    const client = new FakeStoreKitClient();
    client.restoredTransactions = Array.from({ length: 513 }, (_, index) =>
      purchasedTransaction(undefined, {
        transactionId: `mutable-history-${index}`,
        purchaseToken: `mutable-history-jws-${index}`,
        transactionDate: NOW + index,
      }),
    );
    const { provider } = createProvider(client);
    const delivered: string[] = [];

    const firstPage = await provider.reconcileTransactions();
    if (!firstPage.ok) throw new Error('reconciliation should succeed');
    delivered.push(...firstPage.value.transactions.map(({ transactionReference }) => transactionReference));
    client.restoredTransactions = [
      purchasedTransaction(undefined, {
        transactionId: 'inserted-earlier',
        purchaseToken: 'inserted-earlier-jws',
        transactionDate: NOW - 1,
      }),
      ...client.restoredTransactions,
    ];

    let overflowed = firstPage.value.overflowed;
    while (overflowed) {
      const page = await provider.reconcileTransactions();
      if (!page.ok) throw new Error('reconciliation should succeed');
      delivered.push(...page.value.transactions.map(({ transactionReference }) => transactionReference));
      overflowed = page.value.overflowed;
    }

    expect(new Set(delivered).size).toBe(514);
    expect(delivered).toContain('inserted-earlier');
    expect(delivered).toContain('mutable-history-512');
  });

  it('propagates live-inbox overflow and recovers all 257 events from StoreKit history', async () => {
    const client = new FakeStoreKitClient();
    const { provider } = createProvider(client);
    await provider.listOfferings();
    const transactions = Array.from({ length: 257 }, (_, index) =>
      purchasedTransaction(undefined, {
        transactionId: `live-overflow-${index}`,
        purchaseToken: `live-overflow-jws-${index}`,
        transactionDate: NOW + index,
      }),
    );
    transactions.forEach((transaction) => client.handlers?.onPurchaseUpdated(transaction));
    client.restoredTransactions = transactions;

    const firstPage = await provider.reconcileTransactions();
    if (!firstPage.ok) throw new Error('reconciliation should succeed');
    expect(firstPage.value.transactions).toHaveLength(256);
    expect(firstPage.value.overflowed).toBe(true);

    const secondPage = await provider.reconcileTransactions();
    if (!secondPage.ok) throw new Error('reconciliation should succeed');
    expect(secondPage.value.transactions).toHaveLength(1);
    expect(secondPage.value.overflowed).toBe(false);
    expect(
      new Set([
        ...firstPage.value.transactions,
        ...secondPage.value.transactions,
      ].map(({ transactionReference }) => transactionReference)).size,
    ).toBe(257);
  });

  it('retains a deferred purchase when it is approved after the in-memory request has ended', async () => {
    const client = new FakeStoreKitClient();
    client.onRequest = () => client.handlers?.onPurchaseError({ code: 'deferred-payment' });
    const { provider } = createProvider(client);

    await expect(
      provider.purchase({
        offeringKey: 'membership_31d_v1',
        applicationAccountToken: ACCOUNT_TOKEN,
      }),
    ).resolves.toEqual(expect.objectContaining({ code: 'commerce_purchase_pending' }));

    client.handlers?.onPurchaseUpdated(
      purchasedTransaction(undefined, { transactionId: 'approved-later' }),
    );
    await expect(provider.drainTransactionInbox()).resolves.toEqual(
      expect.objectContaining({
        ok: true,
        value: expect.objectContaining({
          transactions: [expect.objectContaining({ transactionReference: 'approved-later' })],
        }),
      }),
    );
  });

  it.each([false, true])('matches UUID identity regardless of native casing (uppercase request: %s)', async (uppercase) => {
    const client = new FakeStoreKitClient();
    const { provider } = createProvider(client);
    client.onRequest = () => client.handlers?.onPurchaseUpdated(purchasedTransaction(undefined, {
      appAccountToken: uppercase ? ACCOUNT_TOKEN : ACCOUNT_TOKEN.toUpperCase(),
    }));
    await expect(provider.purchase({ offeringKey: 'membership_31d_v1',
      applicationAccountToken: uppercase ? ACCOUNT_TOKEN.toUpperCase() : ACCOUNT_TOKEN,
    })).resolves.toMatchObject({ ok: true, state: 'succeeded' });
  });

  it.each([undefined, '12345678-1234-4234-8234-123456789ABD'])('never matches a missing or different account token: %s', async (appAccountToken) => {
    const client = new FakeStoreKitClient();
    const { provider, runtime } = createProvider(client);
    client.onRequest = () => client.handlers?.onPurchaseUpdated(purchasedTransaction(undefined, { appAccountToken }));
    const result = provider.purchase({ offeringKey: 'membership_31d_v1', applicationAccountToken: ACCOUNT_TOKEN });
    await client.requestStarted;
    runtime.fireTimeouts();
    await expect(result).resolves.toMatchObject({ ok: false, code: 'commerce_purchase_timed_out' });
    await expect(provider.drainTransactionInbox()).resolves.toMatchObject({ value: { transactions: [expect.anything()] } });
  });

  it('never mispairs a different product or same-product old transaction with the active request', async () => {
    const client = new FakeStoreKitClient();
    const { provider, runtime } = createProvider(client);
    const purchase = provider.purchase({
      offeringKey: 'membership_31d_v1',
      applicationAccountToken: ACCOUNT_TOKEN,
    });
    await client.requestStarted;
    let settled = false;
    void purchase.then(() => {
      settled = true;
    });

    client.handlers?.onPurchaseUpdated(
      purchasedTransaction(APPLE_MEMBERSHIP_PRODUCT_IDS[0], {
        transactionId: 'different-product',
      }),
    );
    client.handlers?.onPurchaseUpdated(
      purchasedTransaction(undefined, {
        transactionId: 'old-same-product',
        transactionDate: NOW - 1,
      }),
    );
    await Promise.resolve();
    expect(settled).toBe(false);

    runtime.fireTimeouts();
    await expect(purchase).resolves.toEqual(
      expect.objectContaining({
        code: 'commerce_purchase_timed_out',
        charged: 'unknown',
        retryable: true,
      }),
    );
    const inbox = await provider.drainTransactionInbox();
    expect(inbox).toEqual(
      expect.objectContaining({
        ok: true,
        value: expect.objectContaining({
          transactions: [
            expect.objectContaining({ transactionReference: 'old-same-product' }),
            expect.objectContaining({ transactionReference: 'different-product' }),
          ],
        }),
      }),
    );
  });

  it('times out even if native dispatch never returns, releases busy state, and retains a late callback', async () => {
    const client = new FakeStoreKitClient();
    client.requestNeverResolves = true;
    const { provider, runtime } = createProvider(client);
    const purchase = provider.purchase({
      offeringKey: 'membership_31d_v1',
      applicationAccountToken: ACCOUNT_TOKEN,
    });
    await client.requestStarted;

    runtime.fireTimeouts();
    await expect(purchase).resolves.toEqual(
      expect.objectContaining({ code: 'commerce_purchase_timed_out', charged: 'unknown' }),
    );
    client.handlers?.onPurchaseUpdated(
      purchasedTransaction(undefined, { transactionId: 'late-transaction' }),
    );
    await expect(provider.drainTransactionInbox()).resolves.toEqual(
      expect.objectContaining({
        ok: true,
        value: expect.objectContaining({
          transactions: [expect.objectContaining({ transactionReference: 'late-transaction' })],
        }),
      }),
    );

    client.requestNeverResolves = false;
    client.onRequest = () => client.handlers?.onPurchaseError({ code: 'user-cancelled' });
    await expect(
      provider.purchase({
        offeringKey: 'membership_7d_v1',
        applicationAccountToken: ACCOUNT_TOKEN,
      }),
    ).resolves.toEqual(expect.objectContaining({ code: 'commerce_purchase_cancelled' }));
  });

  it('returns the provider timeout but holds runtime single-flight until raw requestPurchase settles', async () => {
    const client = new FakeStoreKitClient();
    client.requestNeverResolves = true;
    const { provider, runtime } = createProvider(client);
    const gate = new CommerceRuntimeOperationGate();
    const operation = gate.begin()!;
    const purchase = operation.wait(provider.purchase({
      offeringKey: 'membership_31d_v1',
      applicationAccountToken: ACCOUNT_TOKEN,
    }, { lifecycle: operation }));
    await client.requestStarted;

    runtime.fireTimeouts();
    await expect(purchase).resolves.toEqual(expect.objectContaining({
      code: 'commerce_purchase_timed_out',
      charged: 'unknown',
    }));
    operation.finish();
    expect(gate.busy).toBe(true);
    expect(gate.begin()).toBeUndefined();

    client.settleNativeRequest();
    await gate.whenIdle();
    expect(gate.busy).toBe(false);
  });

  it('bounds a connection that never resolves and disposes without waiting for it', async () => {
    const client = new FakeStoreKitClient();
    client.connectNeverResolves = true;
    const { provider, runtime } = createProvider(client);
    const purchase = provider.purchase({
      offeringKey: 'membership_31d_v1',
      applicationAccountToken: ACCOUNT_TOKEN,
    });
    await client.connectStarted;

    runtime.fireTimeouts();
    await expect(purchase).resolves.toEqual(
      expect.objectContaining({
        code: 'commerce_purchase_timed_out',
        charged: false,
        retryable: true,
      }),
    );
    await expect(provider.dispose()).resolves.toBeUndefined();
    expect(client.requested).toEqual([]);
    expect(client.disconnectCount).toBe(1);
  });

  it('requires a provider-owned exact-JWS server acknowledgement before idempotent finish', async () => {
    const client = new FakeStoreKitClient();
    client.restoredTransactions = [purchasedTransaction()];
    const { provider } = createProvider(client);
    await provider.reconcileTransactions();
    const forged = {
      transactionReference: 'transaction-31d',
    } as CommerceServerVerifiedAcknowledgement;

    await expect(provider.finishTransaction({ acknowledgement: forged })).resolves.toEqual(
      expect.objectContaining({ code: 'commerce_verification_required' }),
    );
    await expect(
      provider.markServerVerified({
        transactionReference: 'transaction-31d',
        signedTransaction: 'wrong-jws',
      }),
    ).resolves.toEqual(expect.objectContaining({ code: 'commerce_verification_required' }));

    const verification = await provider.markServerVerified({
      transactionReference: 'transaction-31d',
      signedTransaction: 'signed-jws-from-storekit',
    });
    expect(verification.ok).toBe(true);
    if (!verification.ok) throw new Error('verification should succeed');

    await expect(
      provider.finishTransaction({ acknowledgement: verification.value }),
    ).resolves.toEqual({
      ok: true,
      state: 'succeeded',
      value: {
        transactionReference: 'transaction-31d',
        transactionFinished: true,
        completion: 'finished',
      },
    });
    await expect(
      provider.finishTransaction({ acknowledgement: verification.value }),
    ).resolves.toEqual(
      expect.objectContaining({
        ok: true,
        value: expect.objectContaining({ completion: 'already-finished' }),
      }),
    );
    expect(client.finished).toEqual(['transaction-31d']);
  });

  it('distinguishes an observed-but-unknown StoreKit finish from a retryable finish failure', async () => {
    const client = new FakeStoreKitClient();
    client.restoredTransactions = [
      purchasedTransaction(undefined, {
        transactionId: 'unknown-at-finish',
        purchaseToken: 'unknown-at-finish-jws',
      }),
      purchasedTransaction(undefined, {
        transactionId: 'retry-finish',
        purchaseToken: 'retry-finish-jws',
      }),
    ];
    client.unknownFinishReferences.add('unknown-at-finish');
    client.failedFinishReferences.add('retry-finish');
    const { provider } = createProvider(client);
    await provider.reconcileTransactions();

    const unknownAck = await provider.markServerVerified({
      transactionReference: 'unknown-at-finish',
      signedTransaction: 'unknown-at-finish-jws',
    });
    const retryAck = await provider.markServerVerified({
      transactionReference: 'retry-finish',
      signedTransaction: 'retry-finish-jws',
    });
    if (!unknownAck.ok || !retryAck.ok) throw new Error('verification should succeed');

    await expect(
      provider.finishTransaction({ acknowledgement: unknownAck.value }),
    ).resolves.toEqual(
      expect.objectContaining({ code: 'commerce_transaction_unknown', retryable: false }),
    );
    await expect(
      provider.finishTransaction({ acknowledgement: retryAck.value }),
    ).resolves.toEqual(
      expect.objectContaining({ code: 'commerce_finish_failed', retryable: true }),
    );
  });

  it('bounds a native finish that never resolves and preserves the verification capability', async () => {
    const client = new FakeStoreKitClient();
    client.restoredTransactions = [purchasedTransaction()];
    client.finishNeverResolves = true;
    const { provider, runtime } = createProvider(client);
    await provider.reconcileTransactions();
    const acknowledgement = await provider.markServerVerified({
      transactionReference: 'transaction-31d',
      signedTransaction: 'signed-jws-from-storekit',
    });
    if (!acknowledgement.ok) throw new Error('verification should succeed');

    const finishing = provider.finishTransaction({ acknowledgement: acknowledgement.value });
    await client.finishStarted;
    runtime.fireTimeouts();
    await expect(finishing).resolves.toEqual(
      expect.objectContaining({
        code: 'commerce_finish_failed',
        charged: false,
        retryable: true,
      }),
    );
    expect(client.finished).toEqual([]);
    await expect(
      provider.markServerVerified({
        transactionReference: 'transaction-31d',
        signedTransaction: 'signed-jws-from-storekit',
      }),
    ).resolves.toEqual(acknowledgement);
  });

  it('expires unconsumed acknowledgements when the bounded observation window evicts them', async () => {
    const client = new FakeStoreKitClient();
    const { provider } = createProvider(client);
    let firstAcknowledgement: CommerceServerVerifiedAcknowledgement | undefined;
    let lastAcknowledgement: CommerceServerVerifiedAcknowledgement | undefined;

    // One beyond the 512-entry process-local observation/capability window.
    for (let index = 0; index < 513; index += 1) {
      const transactionReference = `bounded-ack-${index}`;
      const signedTransaction = `bounded-ack-jws-${index}`;
      client.restoredTransactions = [
        purchasedTransaction(undefined, {
          transactionId: transactionReference,
          purchaseToken: signedTransaction,
          transactionDate: NOW + index,
        }),
      ];
      await provider.reconcileTransactions();
      const verification = await provider.markServerVerified({
        transactionReference,
        signedTransaction,
      });
      if (!verification.ok) throw new Error('verification should succeed');
      if (index === 0) firstAcknowledgement = verification.value;
      if (index === 512) lastAcknowledgement = verification.value;
    }
    if (!firstAcknowledgement || !lastAcknowledgement) throw new Error('missing test capability');

    await expect(
      provider.finishTransaction({ acknowledgement: firstAcknowledgement }),
    ).resolves.toEqual(expect.objectContaining({ code: 'commerce_verification_required' }));
    await expect(
      provider.finishTransaction({
        acknowledgement: {
          transactionReference: 'bounded-ack-512',
        } as CommerceServerVerifiedAcknowledgement,
      }),
    ).resolves.toEqual(expect.objectContaining({ code: 'commerce_verification_required' }));
    await expect(
      provider.finishTransaction({ acknowledgement: lastAcknowledgement }),
    ).resolves.toEqual(expect.objectContaining({ ok: true }));
  });

  it('bounds finished-reference idempotency and rejects a capability after its window expires', async () => {
    const client = new FakeStoreKitClient();
    const { provider } = createProvider(client);
    let firstAcknowledgement: CommerceServerVerifiedAcknowledgement | undefined;
    let lastAcknowledgement: CommerceServerVerifiedAcknowledgement | undefined;

    for (let index = 0; index < 513; index += 1) {
      const transactionReference = `bounded-finish-${index}`;
      const signedTransaction = `bounded-finish-jws-${index}`;
      client.restoredTransactions = [
        purchasedTransaction(undefined, {
          transactionId: transactionReference,
          purchaseToken: signedTransaction,
          transactionDate: NOW + index,
        }),
      ];
      await provider.reconcileTransactions();
      const verification = await provider.markServerVerified({
        transactionReference,
        signedTransaction,
      });
      if (!verification.ok) throw new Error('verification should succeed');
      await provider.finishTransaction({ acknowledgement: verification.value });
      if (index === 0) firstAcknowledgement = verification.value;
      if (index === 512) lastAcknowledgement = verification.value;
    }
    if (!firstAcknowledgement || !lastAcknowledgement) throw new Error('missing test capability');

    await expect(
      provider.finishTransaction({ acknowledgement: lastAcknowledgement }),
    ).resolves.toEqual(
      expect.objectContaining({
        ok: true,
        value: expect.objectContaining({ completion: 'already-finished' }),
      }),
    );
    await expect(
      provider.finishTransaction({ acknowledgement: firstAcknowledgement }),
    ).resolves.toEqual(expect.objectContaining({ code: 'commerce_verification_required' }));
  });

  it('disposes pending work, disconnects once, and ignores later native callbacks', async () => {
    const client = new FakeStoreKitClient();
    const { provider } = createProvider(client);
    const purchase = provider.purchase({
      offeringKey: 'membership_31d_v1',
      applicationAccountToken: ACCOUNT_TOKEN,
    });
    await client.requestStarted;

    await provider.dispose();
    await provider.dispose();
    await expect(purchase).resolves.toEqual(
      expect.objectContaining({ code: 'commerce_provider_disposed', charged: 'unknown' }),
    );
    expect(client.disconnectCount).toBe(1);
    await expect(provider.drainTransactionInbox()).resolves.toEqual(
      expect.objectContaining({ code: 'commerce_provider_disposed' }),
    );
  });

  it('bounds a connected disconnect that never resolves and ignores its late callback', async () => {
    const client = new FakeStoreKitClient();
    const { provider, runtime } = createProvider(client);
    await provider.listOfferings();
    const lateHandlers = client.handlers;
    client.disconnectNeverResolves = true;

    const disposal = provider.dispose();
    await client.disconnectStarted;
    runtime.fireTimeouts();
    await expect(disposal).resolves.toBeUndefined();

    lateHandlers?.onPurchaseUpdated(
      purchasedTransaction(undefined, { transactionId: 'after-dispose' }),
    );
    expect(client.finished).toEqual([]);
    await expect(provider.drainTransactionInbox()).resolves.toEqual(
      expect.objectContaining({ code: 'commerce_provider_disposed' }),
    );
  });

  it('returns a retryable unavailable result when StoreKit cannot connect', async () => {
    const client = new FakeStoreKitClient();
    client.connectionError = true;
    const { provider } = createProvider(client);

    await expect(provider.listOfferings()).resolves.toEqual({
      ok: false,
      state: 'unavailable',
      code: 'commerce_store_connection_failed',
      charged: false,
      retryable: true,
    });
  });

  it('offers only the three current business keys', () => {
    expect(
      listMembershipProducts().map((product) => product.key satisfies CommerceOfferingKey),
    ).toEqual([
      'membership_7d_v1',
      'membership_31d_v1',
      'membership_93d_v1',
    ]);
  });
});
