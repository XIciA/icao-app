import type {
  CommerceOfferingKey,
  CommerceServerVerifiedAcknowledgement,
} from '../commerce-provider.native';
import {
  APPLE_MEMBERSHIP_PRODUCT_IDS,
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

  async connect(handlers: StoreKitEventHandlers): Promise<void> {
    if (this.connectionError) throw new Error('offline');
    this.handlers = handlers;
  }

  async fetchProducts(): Promise<readonly StoreKitProduct[]> {
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
    if (this.requestNeverResolves) await new Promise<void>(() => undefined);
  }

  async restorePurchases(): Promise<readonly StoreKitTransaction[]> {
    return this.restoredTransactions;
  }

  async finishTransaction(transactionReference: string): Promise<StoreKitFinishCompletion> {
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
  }
}

function purchasedTransaction(
  productId = APPLE_MEMBERSHIP_PRODUCT_IDS[2],
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
    }),
    runtime,
  };
}

describe('StoreKit native commerce provider', () => {
  it('returns all five offerings in D4 order using only StoreKit localized prices', async () => {
    const client = new FakeStoreKitClient();
    const { provider } = createProvider(client);

    const result = await provider.listOfferings();

    expect(result).toEqual({
      ok: true,
      state: 'succeeded',
      value: {
        offerings: [
          expect.objectContaining({ key: 'membership_7d_v1', localizedPrice: '本地价格 1' }),
          expect.objectContaining({ key: 'membership_15d_v1', localizedPrice: '本地价格 2' }),
          expect.objectContaining({
            key: 'membership_31d_v1',
            localizedPrice: '本地价格 3',
            recommended: true,
          }),
          expect.objectContaining({ key: 'membership_62d_v1', localizedPrice: '本地价格 4' }),
          expect.objectContaining({ key: 'membership_93d_v1', localizedPrice: '本地价格 5' }),
        ],
      },
    });
    if (result.ok) {
      expect(result.value.offerings.map((offering) => offering.durationDays)).toEqual([
        7, 15, 31, 62, 93,
      ]);
    }
  });

  it('fails closed for incomplete or wrongly typed App Store catalogs', async () => {
    const incompleteClient = new FakeStoreKitClient();
    incompleteClient.products = incompleteClient.products.slice(0, 4);
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
        productId: APPLE_MEMBERSHIP_PRODUCT_IDS[2],
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
        offeringKey: 'membership_15d_v1',
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
        offeringKey: 'membership_15d_v1',
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
    expect(client.finished).toEqual([]);
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

  it('keeps the five business keys exact and stable', () => {
    expect(
      listMembershipProducts().map((product) => product.key satisfies CommerceOfferingKey),
    ).toEqual([
      'membership_7d_v1',
      'membership_15d_v1',
      'membership_31d_v1',
      'membership_62d_v1',
      'membership_93d_v1',
    ]);
  });
});
