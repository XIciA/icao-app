import type { CommerceOfferingKey } from '../commerce-provider.native';
import {
  APPLE_MEMBERSHIP_PRODUCT_IDS,
  listMembershipProducts,
} from '../membership-products.native';
import { createStoreKitNativeCommerceProvider } from '../storekit-commerce-provider.native';
import type {
  StoreKitClient,
  StoreKitEventHandlers,
  StoreKitProduct,
  StoreKitTransaction,
} from '../storekit-client.native';

const ACCOUNT_TOKEN = '12345678-1234-1234-1234-123456789abc';

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
  onRequest?: (input: { productId: string; applicationAccountToken: string }) => void;
  requested?: { productId: string; applicationAccountToken: string };
  finished: string[] = [];
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
    this.requested = input;
    this.requestStartedResolve();
    if (this.requestError) throw new Error('request failed');
    this.onRequest?.(input);
  }

  async restorePurchases(): Promise<readonly StoreKitTransaction[]> {
    return this.restoredTransactions;
  }

  async finishTransaction(transactionReference: string): Promise<void> {
    if (transactionReference === 'unknown') throw new Error('storekit_transaction_unknown');
    if (transactionReference === 'finish-fails') throw new Error('finish failed');
    this.finished.push(transactionReference);
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
    transactionDate: Date.UTC(2026, 7, 24, 8),
    environmentIOS: 'Sandbox',
    ...overrides,
  };
}

describe('StoreKit native commerce provider', () => {
  it('returns all five offerings in D4 order using only StoreKit localized prices', async () => {
    const client = new FakeStoreKitClient();
    const provider = createStoreKitNativeCommerceProvider(client);

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
      expect(result.value.offerings.every((offering) => offering.currencyCode === 'CNY')).toBe(
        true,
      );
    }
  });

  it('fails closed for incomplete or wrongly typed App Store catalogs', async () => {
    const incompleteClient = new FakeStoreKitClient();
    incompleteClient.products = incompleteClient.products.slice(0, 4);
    const invalidClient = new FakeStoreKitClient();
    invalidClient.products = invalidClient.products.map((product, index) =>
      index === 0 ? { ...product, productTypeIOS: 'consumable' } : product,
    );

    await expect(
      createStoreKitNativeCommerceProvider(incompleteClient).listOfferings(),
    ).resolves.toEqual(
      expect.objectContaining({ ok: false, code: 'commerce_catalog_incomplete', charged: false }),
    );
    await expect(
      createStoreKitNativeCommerceProvider(invalidClient).listOfferings(),
    ).resolves.toEqual(
      expect.objectContaining({ ok: false, code: 'commerce_catalog_invalid', charged: false }),
    );
  });

  it('returns a signed unfinished transaction without granting local entitlement', async () => {
    const client = new FakeStoreKitClient();
    client.onRequest = (input) => {
      client.handlers?.onPurchaseUpdated(purchasedTransaction(input.productId));
    };
    const provider = createStoreKitNativeCommerceProvider(client);

    const result = await provider.purchase({
      offeringKey: 'membership_31d_v1',
      applicationAccountToken: ACCOUNT_TOKEN,
    });

    expect(client.requested).toEqual({
      productId: APPLE_MEMBERSHIP_PRODUCT_IDS[2],
      applicationAccountToken: ACCOUNT_TOKEN,
    });
    expect(result).toEqual({
      ok: true,
      state: 'succeeded',
      value: {
        transaction: {
          offeringKey: 'membership_31d_v1',
          transactionReference: 'transaction-31d',
          purchasedAt: '2026-08-24T08:00:00.000Z',
          signedTransaction: 'signed-jws-from-storekit',
          environment: 'sandbox',
          requiresServerVerification: true,
        },
        entitlementGranted: false,
        transactionFinished: false,
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
    const provider = createStoreKitNativeCommerceProvider(client);

    const result = await provider.purchase({
      offeringKey: 'membership_7d_v1',
      applicationAccountToken: ACCOUNT_TOKEN,
    });

    expect(result).toEqual(expect.objectContaining({ ok: false, state, code: businessCode }));
  });

  it('maps a StoreKit pending transaction update without finishing it', async () => {
    const client = new FakeStoreKitClient();
    client.onRequest = (input) =>
      client.handlers?.onPurchaseUpdated(
        purchasedTransaction(input.productId, {
          transactionId: 'pending-transaction',
          purchaseState: 'pending',
          purchaseToken: undefined,
        }),
      );
    const provider = createStoreKitNativeCommerceProvider(client);

    await expect(
      provider.purchase({
        offeringKey: 'membership_15d_v1',
        applicationAccountToken: ACCOUNT_TOKEN,
      }),
    ).resolves.toEqual(
      expect.objectContaining({ ok: false, state: 'pending', code: 'commerce_purchase_pending' }),
    );
    expect(client.finished).toEqual([]);
  });

  it('rejects invalid account tokens, duplicate attempts, and request failures safely', async () => {
    const client = new FakeStoreKitClient();
    const provider = createStoreKitNativeCommerceProvider(client);

    await expect(
      provider.purchase({
        offeringKey: 'membership_7d_v1',
        applicationAccountToken: 'not-a-uuid',
      }),
    ).resolves.toEqual(
      expect.objectContaining({ code: 'commerce_account_token_invalid', charged: false }),
    );

    const firstPurchase = provider.purchase({
      offeringKey: 'membership_7d_v1',
      applicationAccountToken: ACCOUNT_TOKEN,
    });
    await client.requestStarted;
    expect(client.requested).toBeDefined();
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
    await expect(
      createStoreKitNativeCommerceProvider(failingClient).purchase({
        offeringKey: 'membership_7d_v1',
        applicationAccountToken: ACCOUNT_TOKEN,
      }),
    ).resolves.toEqual(
      expect.objectContaining({ code: 'commerce_purchase_failed', charged: 'unknown' }),
    );
  });

  it('restores supported signed transactions without treating them as entitlements', async () => {
    const client = new FakeStoreKitClient();
    client.restoredTransactions = [
      purchasedTransaction(),
      purchasedTransaction(APPLE_MEMBERSHIP_PRODUCT_IDS[0], {
        transactionId: 'transaction-7d',
        transactionDate: Date.UTC(2026, 7, 23, 8),
      }),
      purchasedTransaction('unrelated.product', { transactionId: 'unrelated' }),
      purchasedTransaction(APPLE_MEMBERSHIP_PRODUCT_IDS[1], {
        transactionId: 'unsigned',
        purchaseToken: undefined,
      }),
    ];
    const provider = createStoreKitNativeCommerceProvider(client);

    const result = await provider.restorePurchases();

    expect(result).toEqual({
      ok: true,
      state: 'succeeded',
      value: {
        transactions: [
          expect.objectContaining({
            offeringKey: 'membership_7d_v1',
            transactionReference: 'transaction-7d',
          }),
          expect.objectContaining({
            offeringKey: 'membership_31d_v1',
            transactionReference: 'transaction-31d',
          }),
        ],
        entitlementGranted: false,
      },
    });
  });

  it('finishes only a transaction selected by the verified upper layer', async () => {
    const client = new FakeStoreKitClient();
    const provider = createStoreKitNativeCommerceProvider(client);

    await expect(
      provider.finishTransaction({ transactionReference: 'verified-transaction' }),
    ).resolves.toEqual({
      ok: true,
      state: 'succeeded',
      value: {
        transactionReference: 'verified-transaction',
        transactionFinished: true,
      },
    });
    expect(client.finished).toEqual(['verified-transaction']);
    await expect(provider.finishTransaction({ transactionReference: 'unknown' })).resolves.toEqual(
      expect.objectContaining({ code: 'commerce_transaction_unknown' }),
    );
    await expect(
      provider.finishTransaction({ transactionReference: 'finish-fails' }),
    ).resolves.toEqual(expect.objectContaining({ code: 'commerce_finish_failed' }));
  });

  it('returns a retryable unavailable result when StoreKit cannot connect', async () => {
    const client = new FakeStoreKitClient();
    client.connectionError = true;
    const provider = createStoreKitNativeCommerceProvider(client);

    await expect(provider.listOfferings()).resolves.toEqual({
      ok: false,
      state: 'unavailable',
      code: 'commerce_store_connection_failed',
      charged: false,
      retryable: true,
    });
  });

  it('keeps the five business keys exact and stable', () => {
    expect(listMembershipProducts().map((product) => product.key satisfies CommerceOfferingKey)).toEqual(
      [
        'membership_7d_v1',
        'membership_15d_v1',
        'membership_31d_v1',
        'membership_62d_v1',
        'membership_93d_v1',
      ],
    );
  });
});
