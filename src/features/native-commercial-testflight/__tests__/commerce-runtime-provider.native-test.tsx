/* eslint-disable import/first */
import { act, render, waitFor } from '@testing-library/react-native';
import { AppState, type AppStateStatus, Text } from 'react-native';
import { getIcaoDistributionEnvironment } from '@icao/distribution-environment';

import type {
  CommerceEntitlementsResponse,
  CommerceProductCatalogResponse,
  CommerceProductOffering,
  VerifyAppleTransactionResponse,
} from '@icao/contracts';
import type {
  CommerceServerVerifiedAcknowledgement,
  CommerceTransaction,
  NativeCommerceProvider,
} from '../commerce-provider.native';

const firstAccountId = '10000000-0000-4000-8000-000000000101';
let mockAccountId = firstAccountId;
const mockApiRequest = jest.fn();
const mockCreateProvider = jest.fn();
const mockUncertainPurchaseStore = new Map<string, unknown>();
const mockLoadUncertainPurchase = jest.fn(async (accountId: string) => (
  mockUncertainPurchaseStore.has(accountId)
    ? { state: 'pending', purchase: mockUncertainPurchaseStore.get(accountId) }
    : { state: 'none' }
));
const mockClearUncertainPurchase = jest.fn(async (accountId: string) => {
  mockUncertainPurchaseStore.delete(accountId);
});
const mockDistributionEnvironment = jest.mocked(getIcaoDistributionEnvironment);
let mockAppStateHandler: ((state: AppStateStatus) => void) | undefined;

jest.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({
    account: { accountId: mockAccountId },
    accountReady: true,
  }),
}));

jest.mock('@/platform/api-client', () => ({
  apiRequest: (...args: unknown[]) => mockApiRequest(...args),
}));

jest.mock('../apple-storekit-commerce-provider.native', () => ({
  createAppleStoreKitCommerceProvider: () => mockCreateProvider(),
}));

jest.mock('../commerce-uncertain-purchase.native', () => ({
  loadUncertainPurchase: (...args: unknown[]) => mockLoadUncertainPurchase(...args as [string]),
  persistUncertainPurchase: jest.fn(async (purchase: { accountId: string }) => {
    mockUncertainPurchaseStore.set(purchase.accountId, purchase);
  }),
  clearUncertainPurchase: (...args: unknown[]) => mockClearUncertainPurchase(...args as [string]),
}));

import {
  CommerceRuntimeProvider,
  useCommerceRuntime,
} from '../CommerceRuntimeProvider.native';

const PRODUCTS: CommerceProductOffering[] = [
  ['membership_7d_v1', '7d', '7天会员', 7, false],
  ['membership_15d_v1', '15d', '15天会员', 15, false],
  ['membership_31d_v1', '31d', '31天会员', 31, true],
  ['membership_62d_v1', '62d', '62天会员', 62, false],
  ['membership_93d_v1', '93d', '93天会员', 93, false],
].map(([productKey, suffix, displayName, durationDays, recommended]) => ({
  productKey: productKey as CommerceProductOffering['productKey'],
  storeProductId: `com.readyoufife.ios.membership.${suffix}.v1`,
  displayName: displayName as string,
  durationDays: durationDays as CommerceProductOffering['durationDays'],
  autoRenews: false,
  recommended: recommended as boolean,
}));

const CATALOG: CommerceProductCatalogResponse = { priceSource: 'storekit', products: PRODUCTS };

function entitlement(environment: 'sandbox' | 'production', active = false) {
  return {
    environment,
    serverTime: '2026-08-24T08:00:00.000Z',
    membership: { active, expiresAt: active ? '2026-09-24T08:00:00.000Z' : null },
    aiPoints: { available: active ? 100 : 0, nextGrantAt: null },
  } as const;
}

const ENTITLEMENTS: CommerceEntitlementsResponse = {
  production: entitlement('production'),
  sandbox: entitlement('sandbox'),
};

function storeOfferings() {
  return PRODUCTS.map((product) => ({
    key: product.productKey,
    title: product.displayName,
    durationDays: product.durationDays,
    recommended: product.recommended,
    localizedPrice: `¥${product.durationDays}`,
    currencyCode: 'CNY',
  }));
}

function inbox(transactions: readonly CommerceTransaction[] = []) {
  return Promise.resolve({
    ok: true,
    state: 'succeeded',
    value: {
      transactions,
      quarantinedTransactions: [],
      overflowed: false,
      entitlementGranted: false,
    },
  } as const);
}

function transaction(
  environment: 'sandbox' | 'production' = 'production',
  reference = `${environment}-transaction`,
): CommerceTransaction {
  return {
    offeringKey: 'membership_31d_v1',
    transactionReference: reference,
    purchasedAt: '2026-08-24T08:00:00.000Z',
    signedTransaction: `${environment}.signed.transaction`,
    environment,
    requiresServerVerification: true,
  };
}

function provider(overrides: Partial<NativeCommerceProvider> = {}) {
  const created: NativeCommerceProvider = {
    listOfferings: jest.fn(async () => ({ ok: true, state: 'succeeded', value: { offerings: storeOfferings() } } as const)),
    purchase: jest.fn(),
    drainTransactionInbox: jest.fn(() => inbox()),
    reconcileTransactions: jest.fn(() => inbox()),
    restorePurchases: jest.fn(() => inbox()),
    markServerVerified: jest.fn(async (request) => ({
      ok: true,
      state: 'succeeded',
      value: { transactionReference: request.transactionReference } as CommerceServerVerifiedAcknowledgement,
    } as const)),
    finishTransaction: jest.fn(async (request) => ({
      ok: true,
      state: 'succeeded',
      value: {
        transactionReference: request.acknowledgement.transactionReference,
        transactionFinished: true,
        completion: 'finished',
      },
    } as const)),
    dispose: jest.fn(async () => undefined),
    ...overrides,
  };
  return created;
}

let currentCommerce: ReturnType<typeof useCommerceRuntime>;

function Probe() {
  currentCommerce = useCommerceRuntime();
  return <Text testID="phase">{currentCommerce.phase}</Text>;
}

describe('<CommerceRuntimeProvider />', () => {
  beforeEach(() => {
    mockAppStateHandler = undefined;
    jest.mocked(AppState.addEventListener).mockImplementation((type, listener) => {
      if (type === 'change') mockAppStateHandler = listener;
      return { remove: jest.fn() };
    });
    mockDistributionEnvironment.mockReturnValue('production');
    mockAccountId = firstAccountId;
    mockUncertainPurchaseStore.clear();
    mockLoadUncertainPurchase.mockClear().mockImplementation(async (accountId: string) => (
      mockUncertainPurchaseStore.has(accountId)
        ? { state: 'pending', purchase: mockUncertainPurchaseStore.get(accountId) }
        : { state: 'none' }
    ));
    mockClearUncertainPurchase.mockClear().mockImplementation(async (accountId: string) => {
      mockUncertainPurchaseStore.delete(accountId);
    });
    mockApiRequest.mockReset().mockImplementation((path: string) => {
      if (path === '/v1/commerce/catalog') return Promise.resolve(CATALOG);
      if (path === '/v1/commerce/entitlements/current') return Promise.resolve(ENTITLEMENTS);
      throw new Error(`unexpected_api:${path}`);
    });
    mockCreateProvider.mockReset().mockReturnValue(provider());
  });

  it('cross-checks all five products and defaults to production entitlements without StoreKit sandbox history', async () => {
    const screen = await render(<CommerceRuntimeProvider><Probe /></CommerceRuntimeProvider>);
    await waitFor(() => expect(screen.getByTestId('phase').props.children).toBe('ready'));

    expect(currentCommerce.offerings).toHaveLength(5);
    expect(currentCommerce.offerings[2]).toMatchObject({
      productKey: 'membership_31d_v1',
      localizedPrice: '¥31',
      recommended: true,
    });
    expect(currentCommerce.entitlementEnvironment).toBe('production');
    expect(currentCommerce.entitlement).toEqual(ENTITLEMENTS.production);
  });

  it('verifies and finishes a purchase before presenting the server entitlement', async () => {
    const purchased = transaction('production');
    const fakeProvider = provider({
      purchase: jest.fn(async () => ({
        ok: true,
        state: 'succeeded',
        value: { transaction: purchased, entitlementGranted: false, transactionFinished: false },
      } as const)),
      drainTransactionInbox: jest.fn(() => inbox([purchased])),
    });
    mockCreateProvider.mockReturnValue(fakeProvider);
    mockApiRequest.mockImplementation((path: string) => {
      if (path === '/v1/commerce/catalog') return Promise.resolve(CATALOG);
      if (path === '/v1/commerce/entitlements/current') return Promise.resolve({
        ...ENTITLEMENTS,
        production: entitlement('production', true),
      });
      if (path === '/v1/commerce/apple/transactions/verify') {
        return Promise.resolve({
          created: true,
          transactionId: purchased.transactionReference,
          entitlement: entitlement('production', true),
        } satisfies VerifyAppleTransactionResponse);
      }
      throw new Error(`unexpected_api:${path}`);
    });
    await render(<CommerceRuntimeProvider><Probe /></CommerceRuntimeProvider>);
    await waitFor(() => expect(currentCommerce.phase).toBe('ready'));

    let result: Awaited<ReturnType<typeof currentCommerce.purchase>> | undefined;
    await act(async () => { result = await currentCommerce.purchase('membership_31d_v1'); });

    expect(result).toEqual({ ok: true, message: '购买成功，会员权益已到账。' });
    expect(fakeProvider.purchase).toHaveBeenCalledWith({
      offeringKey: 'membership_31d_v1',
      applicationAccountToken: mockAccountId,
    });
    expect(mockApiRequest).toHaveBeenCalledWith('/v1/commerce/apple/transactions/verify', expect.objectContaining({
      body: JSON.stringify({ signedTransaction: purchased.signedTransaction }),
    }));
    expect(fakeProvider.markServerVerified).toHaveBeenCalledWith({
      transactionReference: purchased.transactionReference,
      signedTransaction: purchased.signedTransaction,
    });
    expect(fakeProvider.finishTransaction).toHaveBeenCalledTimes(1);
    expect(currentCommerce.entitlement?.membership.active).toBe(true);
    expect(currentCommerce.entitlementChange).toMatchObject({
      accountId: firstAccountId,
      environment: 'production',
      reason: 'purchase',
      snapshot: expect.objectContaining({ membership: expect.objectContaining({ active: true }) }),
    });
  });

  it('selects sandbox entitlement only after StoreKit supplies verified sandbox history', async () => {
    mockDistributionEnvironment.mockReturnValue('sandbox');
    const sandboxTransaction = transaction('sandbox');
    mockCreateProvider.mockReturnValue(provider({
      reconcileTransactions: jest.fn(() => inbox([sandboxTransaction])),
    }));
    mockApiRequest.mockImplementation((path: string) => {
      if (path === '/v1/commerce/catalog') return Promise.resolve(CATALOG);
      if (path === '/v1/commerce/entitlements/current') return Promise.resolve({
        ...ENTITLEMENTS,
        sandbox: entitlement('sandbox', true),
      });
      if (path === '/v1/commerce/apple/transactions/verify') {
        return Promise.resolve({
          created: false,
          transactionId: sandboxTransaction.transactionReference,
          entitlement: entitlement('sandbox', true),
        } satisfies VerifyAppleTransactionResponse);
      }
      throw new Error(`unexpected_api:${path}`);
    });
    await render(<CommerceRuntimeProvider><Probe /></CommerceRuntimeProvider>);
    await waitFor(() => expect(currentCommerce.phase).toBe('ready'));

    expect(currentCommerce.entitlementEnvironment).toBe('sandbox');
    expect(currentCommerce.entitlement?.membership.active).toBe(true);
    expect(currentCommerce.entitlementChange).toMatchObject({
      accountId: firstAccountId,
      environment: 'sandbox',
      snapshot: expect.objectContaining({ membership: expect.objectContaining({ active: true }) }),
    });
  });

  it('fails closed when the server and StoreKit catalogs diverge', async () => {
    mockApiRequest.mockImplementation((path: string) => {
      if (path === '/v1/commerce/catalog') return Promise.resolve({
        ...CATALOG,
        products: CATALOG.products.slice(0, 4),
      });
      if (path === '/v1/commerce/entitlements/current') return Promise.resolve(ENTITLEMENTS);
      throw new Error(`unexpected_api:${path}`);
    });
    await render(<CommerceRuntimeProvider><Probe /></CommerceRuntimeProvider>);
    await waitFor(() => expect(currentCommerce.phase).toBe('error'));

    expect(currentCommerce.offerings).toEqual([]);
    expect(currentCommerce.error).toMatchObject({
      code: 'catalog-invalid',
      operation: 'catalog',
      retryable: false,
    });
    expect(currentCommerce.message).toContain('商品信息尚未完全同步');
  });

  it('keeps every purchase entry locked while App Store reports a pending purchase', async () => {
    const fakeProvider = provider({
      purchase: jest.fn(async () => ({
        ok: false,
        state: 'pending',
        code: 'commerce_purchase_pending',
        charged: false,
        retryable: false,
      } as const)),
    });
    mockCreateProvider.mockReturnValue(fakeProvider);
    await render(<CommerceRuntimeProvider><Probe /></CommerceRuntimeProvider>);
    await waitFor(() => expect(currentCommerce.phase).toBe('ready'));

    let firstResult: Awaited<ReturnType<typeof currentCommerce.purchase>> | undefined;
    let secondResult: Awaited<ReturnType<typeof currentCommerce.purchase>> | undefined;
    await act(async () => { firstResult = await currentCommerce.purchase('membership_31d_v1'); });
    await act(async () => { secondResult = await currentCommerce.purchase('membership_7d_v1'); });

    expect(firstResult?.message).toContain('等待 App Store 确认');
    expect(secondResult?.message).toContain('上一笔购买仍在核对');
    expect(currentCommerce.phase).toBe('pending');
    expect(fakeProvider.purchase).toHaveBeenCalledTimes(1);
    expect(mockUncertainPurchaseStore.get(firstAccountId)).toMatchObject({
      accountId: firstAccountId,
      offeringKey: 'membership_31d_v1',
    });
  });

  it('keeps an unresolved purchase locked after the runtime restarts', async () => {
    mockUncertainPurchaseStore.set(firstAccountId, {
      accountId: firstAccountId,
      offeringKey: 'membership_31d_v1',
      startedAt: '2026-08-24T08:30:00.000Z',
      baselineTransactionReferences: [],
    });
    const restartedProvider = provider();
    mockCreateProvider.mockReturnValue(restartedProvider);

    await render(<CommerceRuntimeProvider><Probe /></CommerceRuntimeProvider>);
    await waitFor(() => expect(currentCommerce.phase).toBe('pending'));
    let retryResult: Awaited<ReturnType<typeof currentCommerce.purchase>> | undefined;
    await act(async () => { retryResult = await currentCommerce.purchase('membership_31d_v1'); });

    expect(retryResult?.message).toContain('上一笔购买仍在核对');
    expect(restartedProvider.purchase).not.toHaveBeenCalled();
  });

  it('fails closed when the persisted purchase lock is malformed', async () => {
    const fakeProvider = provider();
    mockCreateProvider.mockReturnValue(fakeProvider);
    mockLoadUncertainPurchase.mockResolvedValue({ state: 'invalid' });

    await render(<CommerceRuntimeProvider><Probe /></CommerceRuntimeProvider>);
    await waitFor(() => expect(currentCommerce.phase).toBe('pending'));
    let purchaseResult: Awaited<ReturnType<typeof currentCommerce.purchase>> | undefined;
    await act(async () => { purchaseResult = await currentCommerce.purchase('membership_31d_v1'); });
    await act(async () => { await currentCommerce.refresh(); });

    expect(purchaseResult?.message).toContain('上一笔购买仍在核对');
    expect(currentCommerce.phase).toBe('pending');
    expect(currentCommerce.message).toContain('无法安全核对');
    expect(fakeProvider.purchase).not.toHaveBeenCalled();
  });

  it('does not unlock an unresolved purchase from an older same-product transaction', async () => {
    const older = {
      ...transaction('production', 'older-same-product'),
      purchasedAt: new Date(Date.now() + 60_000).toISOString(),
    };
    const fakeProvider = provider({
      purchase: jest.fn(async () => ({
        ok: false,
        state: 'pending',
        code: 'commerce_purchase_pending',
        charged: false,
        retryable: false,
      } as const)),
      reconcileTransactions: jest.fn()
        .mockImplementationOnce(() => inbox())
        .mockImplementation(() => inbox([older])),
    });
    mockCreateProvider.mockReturnValue(fakeProvider);
    mockApiRequest.mockImplementation((path: string) => {
      if (path === '/v1/commerce/catalog') return Promise.resolve(CATALOG);
      if (path === '/v1/commerce/entitlements/current') return Promise.resolve(ENTITLEMENTS);
      if (path === '/v1/commerce/apple/transactions/verify') {
        return Promise.resolve({
          created: false,
          transactionId: older.transactionReference,
          entitlement: entitlement('production', true),
        } satisfies VerifyAppleTransactionResponse);
      }
      throw new Error(`unexpected_api:${path}`);
    });
    await render(<CommerceRuntimeProvider><Probe /></CommerceRuntimeProvider>);
    await waitFor(() => expect(currentCommerce.phase).toBe('ready'));

    await act(async () => { await currentCommerce.purchase('membership_31d_v1'); });
    expect(currentCommerce.phase).toBe('pending');
    await act(async () => { await currentCommerce.refresh(); });

    expect(currentCommerce.phase).toBe('pending');
    expect(currentCommerce.message).toContain('仍在等待');
    expect(fakeProvider.purchase).toHaveBeenCalledTimes(1);
  });

  it('unlocks a reference-less pending purchase only for a new same-product transaction', async () => {
    const newlyObserved = {
      ...transaction('production', 'new-after-purchase'),
      purchasedAt: new Date(Date.now() + 60_000).toISOString(),
    };
    const fakeProvider = provider({
      purchase: jest.fn(async () => ({
        ok: false,
        state: 'pending',
        code: 'commerce_purchase_pending',
        charged: false,
        retryable: false,
      } as const)),
      reconcileTransactions: jest.fn()
        .mockImplementationOnce(() => inbox())
        .mockImplementationOnce(() => inbox())
        .mockImplementation(() => inbox([newlyObserved])),
    });
    mockCreateProvider.mockReturnValue(fakeProvider);
    mockApiRequest.mockImplementation((path: string) => {
      if (path === '/v1/commerce/catalog') return Promise.resolve(CATALOG);
      if (path === '/v1/commerce/entitlements/current') return Promise.resolve(ENTITLEMENTS);
      if (path === '/v1/commerce/apple/transactions/verify') {
        return Promise.resolve({
          created: true,
          transactionId: newlyObserved.transactionReference,
          entitlement: entitlement('production', true),
        } satisfies VerifyAppleTransactionResponse);
      }
      throw new Error(`unexpected_api:${path}`);
    });
    await render(<CommerceRuntimeProvider><Probe /></CommerceRuntimeProvider>);
    await waitFor(() => expect(currentCommerce.phase).toBe('ready'));

    await act(async () => { await currentCommerce.purchase('membership_31d_v1'); });
    expect(currentCommerce.phase).toBe('pending');
    await act(async () => { await currentCommerce.refresh(); });

    expect(currentCommerce.phase).toBe('ready');
    expect(mockUncertainPurchaseStore.has(firstAccountId)).toBe(false);
  });

  it('keeps the purchase locked if persistent clear fails after server verification', async () => {
    const purchased = transaction('production', 'clear-failure');
    const fakeProvider = provider({
      purchase: jest.fn(async () => ({
        ok: true,
        state: 'succeeded',
        value: { transaction: purchased, entitlementGranted: false, transactionFinished: false },
      } as const)),
      drainTransactionInbox: jest.fn(() => inbox([purchased])),
    });
    mockCreateProvider.mockReturnValue(fakeProvider);
    mockClearUncertainPurchase.mockRejectedValue(new Error('sqlite_clear_failed'));
    mockApiRequest.mockImplementation((path: string) => {
      if (path === '/v1/commerce/catalog') return Promise.resolve(CATALOG);
      if (path === '/v1/commerce/entitlements/current') return Promise.resolve(ENTITLEMENTS);
      if (path === '/v1/commerce/apple/transactions/verify') {
        return Promise.resolve({
          created: true,
          transactionId: purchased.transactionReference,
          entitlement: entitlement('production', true),
        } satisfies VerifyAppleTransactionResponse);
      }
      throw new Error(`unexpected_api:${path}`);
    });
    await render(<CommerceRuntimeProvider><Probe /></CommerceRuntimeProvider>);
    await waitFor(() => expect(currentCommerce.phase).toBe('ready'));

    await act(async () => { await currentCommerce.purchase('membership_31d_v1'); });
    let retryResult: Awaited<ReturnType<typeof currentCommerce.purchase>> | undefined;
    await act(async () => { retryResult = await currentCommerce.purchase('membership_31d_v1'); });

    expect(currentCommerce.phase).toBe('pending');
    expect(retryResult?.message).toContain('上一笔购买仍在核对');
    expect(fakeProvider.purchase).toHaveBeenCalledTimes(1);
  });

  it('uses explicit Restore Purchases to clear a matching sandbox lock', async () => {
    mockDistributionEnvironment.mockReturnValue('sandbox');
    const sandboxPurchase = transaction('sandbox', 'sandbox-pending');
    mockUncertainPurchaseStore.set(firstAccountId, {
      accountId: firstAccountId,
      offeringKey: sandboxPurchase.offeringKey,
      startedAt: '2026-08-24T07:00:00.000Z',
      baselineTransactionReferences: [],
      transactionReference: sandboxPurchase.transactionReference,
      environment: 'sandbox',
    });
    const fakeProvider = provider({
      restorePurchases: jest.fn(() => inbox([sandboxPurchase])),
    });
    mockCreateProvider.mockReturnValue(fakeProvider);
    mockApiRequest.mockImplementation((path: string) => {
      if (path === '/v1/commerce/catalog') return Promise.resolve(CATALOG);
      if (path === '/v1/commerce/entitlements/current') return Promise.resolve(ENTITLEMENTS);
      if (path === '/v1/commerce/apple/transactions/verify') {
        return Promise.resolve({
          created: false,
          transactionId: sandboxPurchase.transactionReference,
          entitlement: entitlement('sandbox', true),
        } satisfies VerifyAppleTransactionResponse);
      }
      throw new Error(`unexpected_api:${path}`);
    });
    await render(<CommerceRuntimeProvider><Probe /></CommerceRuntimeProvider>);
    await waitFor(() => expect(currentCommerce.phase).toBe('pending'));

    let result: Awaited<ReturnType<typeof currentCommerce.restorePurchases>> | undefined;
    await act(async () => { result = await currentCommerce.restorePurchases(); });

    expect(result?.ok).toBe(true);
    expect(currentCommerce.phase).toBe('ready');
    expect(currentCommerce.entitlementEnvironment).toBe('sandbox');
    expect(fakeProvider.restorePurchases).toHaveBeenCalledTimes(1);
    expect(currentCommerce.entitlementChange).toMatchObject({
      accountId: firstAccountId,
      environment: 'sandbox',
      reason: 'restore',
    });
  });

  it('does not clear an exact sandbox lock from a production transaction collision', async () => {
    const transactionReference = 'environment-collision';
    const productionPurchase = transaction('production', transactionReference);
    mockUncertainPurchaseStore.set(firstAccountId, {
      accountId: firstAccountId,
      offeringKey: productionPurchase.offeringKey,
      startedAt: '2026-08-24T07:00:00.000Z',
      baselineTransactionReferences: [],
      transactionReference,
      environment: 'sandbox',
    });
    const fakeProvider = provider({
      restorePurchases: jest.fn(() => inbox([productionPurchase])),
    });
    mockCreateProvider.mockReturnValue(fakeProvider);
    mockApiRequest.mockImplementation((path: string) => {
      if (path === '/v1/commerce/catalog') return Promise.resolve(CATALOG);
      if (path === '/v1/commerce/entitlements/current') return Promise.resolve(ENTITLEMENTS);
      if (path === '/v1/commerce/apple/transactions/verify') {
        return Promise.resolve({
          created: false,
          transactionId: productionPurchase.transactionReference,
          entitlement: entitlement('production', true),
        } satisfies VerifyAppleTransactionResponse);
      }
      throw new Error(`unexpected_api:${path}`);
    });
    await render(<CommerceRuntimeProvider><Probe /></CommerceRuntimeProvider>);
    await waitFor(() => expect(currentCommerce.phase).toBe('pending'));

    let result: Awaited<ReturnType<typeof currentCommerce.restorePurchases>> | undefined;
    await act(async () => { result = await currentCommerce.restorePurchases(); });

    expect(result?.ok).toBe(false);
    expect(currentCommerce.phase).toBe('pending');
    expect(mockUncertainPurchaseStore.has(firstAccountId)).toBe(true);
  });

  it('does not report the current purchase successful when only an older inbox transaction verifies', async () => {
    const older = transaction('production', 'older-transaction');
    const current = transaction('production', 'current-transaction');
    const fakeProvider = provider({
      purchase: jest.fn(async () => ({
        ok: true,
        state: 'succeeded',
        value: { transaction: current, entitlementGranted: false, transactionFinished: false },
      } as const)),
      drainTransactionInbox: jest.fn(() => inbox([older, current])),
    });
    mockCreateProvider.mockReturnValue(fakeProvider);
    mockApiRequest.mockImplementation((path: string, options?: { body?: string }) => {
      if (path === '/v1/commerce/catalog') return Promise.resolve(CATALOG);
      if (path === '/v1/commerce/entitlements/current') return Promise.resolve(ENTITLEMENTS);
      if (path === '/v1/commerce/apple/transactions/verify') {
        if (options?.body === JSON.stringify({ signedTransaction: older.signedTransaction })) {
          return Promise.resolve({
            created: true,
            transactionId: older.transactionReference,
            entitlement: entitlement('production', true),
          } satisfies VerifyAppleTransactionResponse);
        }
        return Promise.reject(new Error('current_verification_deferred'));
      }
      throw new Error(`unexpected_api:${path}`);
    });
    await render(<CommerceRuntimeProvider><Probe /></CommerceRuntimeProvider>);
    await waitFor(() => expect(currentCommerce.phase).toBe('ready'));

    let result: Awaited<ReturnType<typeof currentCommerce.purchase>> | undefined;
    await act(async () => { result = await currentCommerce.purchase('membership_31d_v1'); });

    expect(result?.ok).toBe(false);
    expect(result?.message).toContain('本次交易正在继续核对');
    expect(currentCommerce.phase).toBe('pending');
    expect(fakeProvider.markServerVerified).toHaveBeenCalledTimes(1);
    expect(fakeProvider.markServerVerified).toHaveBeenCalledWith(expect.objectContaining({
      transactionReference: older.transactionReference,
    }));
  });

  it('does not let a purchase from the previous account overwrite the new account state', async () => {
    const purchased = transaction('production');
    let resolvePurchase!: (value: Awaited<ReturnType<NativeCommerceProvider['purchase']>>) => void;
    const oldProvider = provider({
      purchase: jest.fn(() => new Promise((resolve) => { resolvePurchase = resolve; })),
      drainTransactionInbox: jest.fn(() => inbox([purchased])),
    });
    const newProvider = provider();
    mockCreateProvider.mockReturnValueOnce(oldProvider).mockReturnValue(newProvider);

    const screen = await render(<CommerceRuntimeProvider><Probe /></CommerceRuntimeProvider>);
    await waitFor(() => expect(currentCommerce.phase).toBe('ready'));
    const previousAccountPurchase = currentCommerce.purchase;
    let pendingPurchase!: ReturnType<typeof previousAccountPurchase>;
    await act(async () => {
      pendingPurchase = previousAccountPurchase('membership_31d_v1');
      await Promise.resolve();
    });

    mockAccountId = '10000000-0000-4000-8000-000000000202';
    await act(async () => {
      screen.rerender(<CommerceRuntimeProvider><Probe /></CommerceRuntimeProvider>);
    });
    await waitFor(() => expect(currentCommerce.phase).toBe('ready'));
    await act(async () => {
      resolvePurchase({
        ok: true,
        state: 'succeeded',
        value: { transaction: purchased, entitlementGranted: false, transactionFinished: false },
      });
    });

    await expect(pendingPurchase).resolves.toMatchObject(ACCOUNT_CHANGED_RESULT_FOR_TEST);
    expect(currentCommerce.phase).toBe('ready');
    expect(currentCommerce.entitlement).toEqual(ENTITLEMENTS.production);
    expect(oldProvider.drainTransactionInbox).not.toHaveBeenCalled();

    mockAccountId = firstAccountId;
    await act(async () => {
      screen.rerender(<CommerceRuntimeProvider><Probe /></CommerceRuntimeProvider>);
    });
    await waitFor(() => expect(currentCommerce.phase).toBe('pending'));
    await act(async () => { await currentCommerce.purchase('membership_31d_v1'); });
    expect(oldProvider.purchase).toHaveBeenCalledTimes(1);
    expect(newProvider.purchase).not.toHaveBeenCalled();
  });

  it('publishes a monotonic entitlement snapshot after manual refresh detects expiry or refund', async () => {
    let active = true;
    mockApiRequest.mockImplementation((path: string) => {
      if (path === '/v1/commerce/catalog') return Promise.resolve(CATALOG);
      if (path === '/v1/commerce/entitlements/current') return Promise.resolve({
        ...ENTITLEMENTS,
        production: entitlement('production', active),
      });
      throw new Error(`unexpected_api:${path}`);
    });
    await render(<CommerceRuntimeProvider><Probe /></CommerceRuntimeProvider>);
    await waitFor(() => expect(currentCommerce.phase).toBe('ready'));
    const initialChange = currentCommerce.entitlementChange;

    expect(initialChange).toMatchObject({
      accountId: firstAccountId,
      environment: 'production',
      reason: 'startup-reconciliation',
      snapshot: expect.objectContaining({ membership: expect.objectContaining({ active: true }) }),
    });
    active = false;
    await act(async () => { await currentCommerce.refresh(); });

    expect(currentCommerce.entitlementChange).toMatchObject({
      accountId: firstAccountId,
      environment: 'production',
      reason: 'manual-refresh',
      snapshot: expect.objectContaining({ membership: expect.objectContaining({ active: false }) }),
    });
    expect(currentCommerce.entitlementChange?.revision).toBeGreaterThan(
      initialChange?.revision ?? 0,
    );
  });

  it('publishes the new account generation and never reuses the previous snapshot', async () => {
    const screen = await render(<CommerceRuntimeProvider><Probe /></CommerceRuntimeProvider>);
    await waitFor(() => expect(currentCommerce.phase).toBe('ready'));
    const oldRevision = currentCommerce.entitlementChange?.revision ?? 0;

    mockAccountId = '10000000-0000-4000-8000-000000000202';
    await act(async () => {
      screen.rerender(<CommerceRuntimeProvider><Probe /></CommerceRuntimeProvider>);
    });
    await waitFor(() => expect(currentCommerce.phase).toBe('ready'));

    expect(currentCommerce.entitlementChange).toMatchObject({
      accountId: mockAccountId,
      environment: 'production',
      snapshot: ENTITLEMENTS.production,
    });
    expect(currentCommerce.entitlementChange?.revision).toBeGreaterThan(oldRevision);
  });

  it('publishes foreground reconciliation so downstream content can invalidate immediately', async () => {
    await render(<CommerceRuntimeProvider><Probe /></CommerceRuntimeProvider>);
    await waitFor(() => expect(currentCommerce.phase).toBe('ready'));
    const initialRevision = currentCommerce.entitlementChange?.revision ?? 0;

    await act(async () => {
      mockAppStateHandler?.('active');
    });
    await waitFor(() => expect(currentCommerce.phase).toBe('ready'));

    expect(currentCommerce.entitlementChange).toMatchObject({
      accountId: firstAccountId,
      environment: 'production',
      reason: 'foreground-reconciliation',
    });
    expect(currentCommerce.entitlementChange?.revision).toBeGreaterThan(initialRevision);
  });

  it('does not queue a user restore while startup reconciliation is active', async () => {
    let resolveStartup!: () => void;
    const fakeProvider = provider({
      reconcileTransactions: jest.fn(() => new Promise((resolve) => {
        resolveStartup = () => resolve({
          ok: true,
          state: 'succeeded',
          value: {
            transactions: [],
            quarantinedTransactions: [],
            overflowed: false,
            entitlementGranted: false,
          },
        });
      })),
    });
    mockCreateProvider.mockReturnValue(fakeProvider);
    await render(<CommerceRuntimeProvider><Probe /></CommerceRuntimeProvider>);
    await waitFor(() => expect(currentCommerce.phase).toBe('loading'));

    await expect(currentCommerce.restorePurchases()).resolves.toMatchObject({
      ok: false,
      error: { code: 'operation-busy' },
    });
    expect(fakeProvider.restorePurchases).not.toHaveBeenCalled();

    resolveStartup();
    await waitFor(() => expect(currentCommerce.phase).toBe('ready'));
  });

  it('cancels an in-flight restore when the signed-in account changes', async () => {
    const oldProvider = provider({
      restorePurchases: jest.fn(() => new Promise(() => undefined)),
    });
    const newProvider = provider();
    mockCreateProvider.mockReturnValueOnce(oldProvider).mockReturnValue(newProvider);
    const screen = await render(<CommerceRuntimeProvider><Probe /></CommerceRuntimeProvider>);
    await waitFor(() => expect(currentCommerce.phase).toBe('ready'));
    let oldRestore!: ReturnType<typeof currentCommerce.restorePurchases>;
    await act(async () => {
      oldRestore = currentCommerce.restorePurchases();
      await Promise.resolve();
    });
    await waitFor(() => expect(currentCommerce.phase).toBe('restoring'));

    mockAccountId = '10000000-0000-4000-8000-000000000202';
    await act(async () => {
      screen.rerender(<CommerceRuntimeProvider><Probe /></CommerceRuntimeProvider>);
    });

    await expect(oldRestore).resolves.toMatchObject(ACCOUNT_CHANGED_RESULT_FOR_TEST);
    await waitFor(() => expect(currentCommerce.phase).toBe('ready'));
    expect(newProvider.restorePurchases).not.toHaveBeenCalled();
  });

  it('applies one full-operation deadline when entitlement refresh hangs after restore', async () => {
    const fakeProvider = provider();
    mockCreateProvider.mockReturnValue(fakeProvider);
    let entitlementReads = 0;
    mockApiRequest.mockImplementation((path: string) => {
      if (path === '/v1/commerce/catalog') return Promise.resolve(CATALOG);
      if (path === '/v1/commerce/entitlements/current') {
        entitlementReads += 1;
        return entitlementReads === 1
          ? Promise.resolve(ENTITLEMENTS)
          : new Promise(() => undefined);
      }
      throw new Error(`unexpected_api:${path}`);
    });
    await render(<CommerceRuntimeProvider><Probe /></CommerceRuntimeProvider>);
    await waitFor(() => expect(currentCommerce.phase).toBe('ready'));

    jest.useFakeTimers();
    try {
      let restore!: ReturnType<typeof currentCommerce.restorePurchases>;
      await act(async () => {
        restore = currentCommerce.restorePurchases();
        await Promise.resolve();
      });
      await act(async () => {
        await jest.advanceTimersByTimeAsync(60_000);
      });

      await expect(restore).resolves.toMatchObject({
        ok: false,
        error: { code: 'restore-timed-out', operation: 'restore' },
      });
      expect(currentCommerce.phase).toBe('error');
    } finally {
      jest.useRealTimers();
    }
  });
});

const ACCOUNT_CHANGED_RESULT_FOR_TEST = {
  ok: false,
  message: '账号已切换，请在当前账号重新查看会员状态。',
};
