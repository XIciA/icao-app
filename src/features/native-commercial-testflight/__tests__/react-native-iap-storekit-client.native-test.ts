import type { ProductOrSubscription, PurchaseError, PurchaseIOS } from 'react-native-iap';
import {
  endConnection,
  fetchProducts,
  finishTransaction,
  getAllTransactionsIOS,
  getPendingTransactionsIOS,
  initConnection,
  purchaseErrorListener,
  purchaseUpdatedListener,
  requestPurchase,
  syncIOS,
} from 'react-native-iap';

import {
  ReactNativeIapStoreKitClient,
  resetReactNativeIapConnectionForTests,
} from '../react-native-iap-storekit-client.native';
import type { CommerceOperationLifecycle } from '../commerce-runtime-operation.native';

type ActiveListener<T> = {
  active: boolean;
  callback(value: T): void;
};

const mockPurchaseUpdatedListeners: ActiveListener<PurchaseIOS>[] = [];
const mockPurchaseErrorListeners: ActiveListener<PurchaseError>[] = [];

jest.mock('react-native-iap', () => ({
  endConnection: jest.fn(async () => true),
  fetchProducts: jest.fn(async () => []),
  finishTransaction: jest.fn(async () => undefined),
  getAllTransactionsIOS: jest.fn(async () => []),
  getPendingTransactionsIOS: jest.fn(async () => []),
  initConnection: jest.fn(async () => true),
  purchaseErrorListener: jest.fn((callback: (error: PurchaseError) => void) => {
    const listener = { active: true, callback };
    mockPurchaseErrorListeners.push(listener);
    return { remove: jest.fn(() => (listener.active = false)) };
  }),
  purchaseUpdatedListener: jest.fn((callback: (purchase: PurchaseIOS) => void) => {
    const listener = { active: true, callback };
    mockPurchaseUpdatedListeners.push(listener);
    return { remove: jest.fn(() => (listener.active = false)) };
  }),
  requestPurchase: jest.fn(async () => undefined),
  syncIOS: jest.fn(async () => true),
}));

const PURCHASE: PurchaseIOS = {
  id: 'unfinished-transaction',
  isAutoRenewing: false,
  productId: 'com.readyoufife.ios.membership.31d.v1',
  purchaseState: 'purchased',
  purchaseToken: 'signed-storekit-jws',
  quantity: 1,
  store: 'apple',
  transactionDate: Date.UTC(2026, 7, 24, 8),
  transactionId: 'unfinished-transaction',
  environmentIOS: 'Sandbox',
  appAccountToken: '12345678-1234-4234-8234-123456789abc',
};

function emitPurchase(purchase: PurchaseIOS): void {
  mockPurchaseUpdatedListeners
    .filter((listener) => listener.active)
    .forEach((listener) => listener.callback(purchase));
}

function emitPurchaseError(error: PurchaseError): void {
  mockPurchaseErrorListeners
    .filter((listener) => listener.active)
    .forEach((listener) => listener.callback(error));
}

function createHandlers() {
  return {
    onPurchaseUpdated: jest.fn(),
    onPurchaseError: jest.fn(),
  };
}

describe('react-native-iap StoreKit client', () => {
  beforeEach(() => {
    resetReactNativeIapConnectionForTests();
    jest.clearAllMocks();
    mockPurchaseUpdatedListeners.length = 0;
    mockPurchaseErrorListeners.length = 0;
    jest.mocked(initConnection).mockResolvedValue(true);
    jest.mocked(endConnection).mockResolvedValue(true);
    jest.mocked(getAllTransactionsIOS).mockResolvedValue([]);
    jest.mocked(getPendingTransactionsIOS).mockResolvedValue([]);
    jest.mocked(syncIOS).mockResolvedValue(true);
    jest.mocked(finishTransaction).mockResolvedValue(undefined);
    jest.mocked(fetchProducts).mockResolvedValue([]);
    jest.mocked(requestPurchase).mockResolvedValue(null);
  });

  it('queries and accepts only iOS non-renewing subscriptions', async () => {
    const client = new ReactNativeIapStoreKitClient();
    const valid = {
      platform: 'ios',
      type: 'subs',
      typeIOS: 'non-renewing-subscription',
      id: PURCHASE.productId,
      displayPrice: '¥168.00',
      currency: 'CNY',
    } as ProductOrSubscription;
    const wrongOpenIapType = {
      ...valid,
      id: 'wrong.openiap.type',
      type: 'in-app',
    } as ProductOrSubscription;
    const wrongIosType = {
      ...valid,
      id: 'wrong.ios.type',
      typeIOS: 'auto-renewable-subscription',
    } as ProductOrSubscription;
    jest.mocked(fetchProducts).mockResolvedValue([
      valid,
      wrongOpenIapType,
      wrongIosType,
    ]);

    await client.connect(createHandlers());
    await expect(client.fetchProducts([PURCHASE.productId])).resolves.toEqual([{
      productId: PURCHASE.productId,
      localizedPrice: '¥168.00',
      currencyCode: 'CNY',
      productTypeIOS: 'non-renewing-subscription',
    }]);

    expect(fetchProducts).toHaveBeenCalledWith({
      skus: [PURCHASE.productId],
      type: 'subs',
    });
  });

  it('rebuilds an unfinished transaction after app restart before finishing it', async () => {
    const restartedClient = new ReactNativeIapStoreKitClient();
    jest.mocked(getPendingTransactionsIOS).mockResolvedValue([PURCHASE]);

    await restartedClient.connect(createHandlers());
    await expect(restartedClient.finishTransaction(PURCHASE.transactionId)).resolves.toBe(
      'finished',
    );

    expect(getPendingTransactionsIOS).toHaveBeenCalledTimes(1);
    expect(finishTransaction).toHaveBeenCalledWith({
      purchase: PURCHASE,
      isConsumable: false,
    });
  });

  it('returns already-finished for a transaction in history and remains idempotent', async () => {
    const restartedClient = new ReactNativeIapStoreKitClient();
    jest.mocked(getAllTransactionsIOS).mockResolvedValue([PURCHASE]);

    await restartedClient.connect(createHandlers());
    await expect(restartedClient.finishTransaction(PURCHASE.transactionId)).resolves.toBe(
      'already-finished',
    );
    await expect(restartedClient.finishTransaction(PURCHASE.transactionId)).resolves.toBe(
      'already-finished',
    );

    expect(getAllTransactionsIOS).toHaveBeenCalledTimes(1);
    expect(finishTransaction).not.toHaveBeenCalled();
  });

  it('rejects a transaction absent from both unfinished and complete StoreKit history', async () => {
    const restartedClient = new ReactNativeIapStoreKitClient();

    await restartedClient.connect(createHandlers());

    await expect(restartedClient.finishTransaction('unknown-transaction')).rejects.toThrow(
      'storekit_transaction_unknown',
    );
    expect(getPendingTransactionsIOS).toHaveBeenCalledTimes(1);
    expect(getAllTransactionsIOS).toHaveBeenCalledTimes(1);
    expect(finishTransaction).not.toHaveBeenCalled();
  });

  it('rejects a false native connection result', async () => {
    const client = new ReactNativeIapStoreKitClient();
    jest.mocked(initConnection).mockResolvedValue(false);

    await expect(client.connect(createHandlers())).rejects.toThrow('storekit_connection_failed');
    expect(purchaseUpdatedListener).not.toHaveBeenCalled();
    expect(purchaseErrorListener).not.toHaveBeenCalled();
  });

  it('reconciles signed transaction history with server idempotency fields and no local finish', async () => {
    const restartedClient = new ReactNativeIapStoreKitClient();
    jest.mocked(getAllTransactionsIOS).mockResolvedValue([PURCHASE]);

    await restartedClient.connect(createHandlers());
    await restartedClient.syncPurchases();
    expect(syncIOS).toHaveBeenCalledTimes(1);
    expect(getAllTransactionsIOS).not.toHaveBeenCalled();
    const restored = await restartedClient.getTransactions();

    expect(restored).toEqual([
      {
        productId: PURCHASE.productId,
        transactionId: PURCHASE.transactionId,
        purchaseState: 'purchased',
        purchaseToken: PURCHASE.purchaseToken,
        transactionDate: PURCHASE.transactionDate,
        environmentIOS: 'Sandbox',
        appAccountToken: PURCHASE.appAccountToken,
      },
    ]);
    expect(finishTransaction).not.toHaveBeenCalled();
  });

  it('reads startup history without synchronizing the App Store account', async () => {
    const client = new ReactNativeIapStoreKitClient();
    jest.mocked(getAllTransactionsIOS).mockResolvedValue([PURCHASE]);

    await client.connect(createHandlers());
    await expect(client.getTransactions()).resolves.toHaveLength(1);

    expect(getAllTransactionsIOS).toHaveBeenCalledTimes(1);
    expect(syncIOS).not.toHaveBeenCalled();
  });

  it('forwards the UUID to StoreKit and explicitly disables automatic finish', async () => {
    const client = new ReactNativeIapStoreKitClient();
    await client.connect(createHandlers());

    await client.requestPurchase({
      productId: PURCHASE.productId,
      applicationAccountToken: PURCHASE.appAccountToken as string,
    });

    expect(requestPurchase).toHaveBeenCalledWith({
      request: {
        apple: {
          sku: PURCHASE.productId,
          appAccountToken: PURCHASE.appAccountToken,
          andDangerouslyFinishTransactionAutomatically: false,
        },
      },
      type: 'subs',
    });
  });

  it('registers the original native requestPurchase promise with the runtime lifecycle', async () => {
    const client = new ReactNativeIapStoreKitClient();
    await client.connect(createHandlers());
    let settleRequest!: () => void;
    const rawRequest = new Promise<null>((resolve) => {
      settleRequest = () => resolve(null);
    });
    jest.mocked(requestPurchase).mockReturnValue(rawRequest);
    const trackedRaw: Promise<unknown>[] = [];
    const lifecycle: CommerceOperationLifecycle = {
      signal: new AbortController().signal,
      trackRaw<T>(promise: Promise<T>) {
        trackedRaw.push(promise);
        return promise;
      },
      drain: jest.fn(),
    };

    const request = client.requestPurchase({
      productId: PURCHASE.productId,
      applicationAccountToken: PURCHASE.appAccountToken as string,
    }, { lifecycle });

    expect(trackedRaw).toContain(rawRequest);
    settleRequest();
    await request;
  });

  it('registers every original react-native-iap promise with the shared runtime lifecycle', async () => {
    const rawInit = Promise.resolve(true);
    const rawProducts = Promise.resolve([] as ProductOrSubscription[]);
    const rawPurchase = Promise.resolve(null);
    const rawHistory = Promise.resolve([] as PurchaseIOS[]);
    const rawSync = Promise.resolve(true);
    const rawPending = Promise.resolve([] as PurchaseIOS[]);
    const rawFinish = Promise.resolve(undefined);
    const rawEnd = Promise.resolve(true);
    jest.mocked(initConnection).mockReturnValue(rawInit);
    jest.mocked(fetchProducts).mockReturnValue(rawProducts);
    jest.mocked(requestPurchase).mockReturnValue(rawPurchase);
    jest.mocked(getAllTransactionsIOS).mockReturnValue(rawHistory);
    jest.mocked(syncIOS).mockReturnValue(rawSync);
    jest.mocked(getPendingTransactionsIOS).mockReturnValue(rawPending);
    jest.mocked(finishTransaction).mockReturnValue(rawFinish);
    jest.mocked(endConnection).mockReturnValue(rawEnd);
    const trackedRaw: Promise<unknown>[] = [];
    const lifecycle: CommerceOperationLifecycle = {
      signal: new AbortController().signal,
      trackRaw<T>(promise: Promise<T>) {
        trackedRaw.push(promise);
        return promise;
      },
      drain: jest.fn(),
    };
    const client = new ReactNativeIapStoreKitClient();

    await client.connect(createHandlers(), { lifecycle });
    await client.fetchProducts([PURCHASE.productId], { lifecycle });
    await client.requestPurchase({
      productId: PURCHASE.productId,
      applicationAccountToken: PURCHASE.appAccountToken as string,
    }, { lifecycle });
    await client.getTransactions({ lifecycle });
    await client.syncPurchases({ lifecycle });
    emitPurchase(PURCHASE);
    await client.finishTransaction(PURCHASE.transactionId, { lifecycle });
    await expect(client.finishTransaction('unknown-transaction', { lifecycle })).rejects.toThrow(
      'storekit_transaction_unknown',
    );
    await client.disconnect({ lifecycle });

    expect(trackedRaw).toEqual(expect.arrayContaining([
      rawInit,
      rawProducts,
      rawPurchase,
      rawHistory,
      rawSync,
      rawPending,
      rawFinish,
      rawEnd,
    ]));
    expect(trackedRaw.filter((promise) => promise === rawHistory)).toHaveLength(2);
  });

  it('keeps the global connection open while a replacement owner is attached', async () => {
    const oldClient = new ReactNativeIapStoreKitClient();
    const newClient = new ReactNativeIapStoreKitClient();
    await oldClient.connect(createHandlers());
    await newClient.connect(createHandlers());

    await oldClient.disconnect();

    expect(initConnection).toHaveBeenCalledTimes(1);
    expect(endConnection).not.toHaveBeenCalled();
    await newClient.disconnect();
    expect(endConnection).toHaveBeenCalledTimes(1);
  });

  it('serializes a replacement connect behind a late native endConnection', async () => {
    const oldClient = new ReactNativeIapStoreKitClient();
    await oldClient.connect(createHandlers());
    let settleEnd!: () => void;
    const rawEnd = new Promise<boolean>((resolve) => { settleEnd = () => resolve(true); });
    jest.mocked(endConnection).mockReturnValue(rawEnd);
    const disconnecting = oldClient.disconnect();
    await Promise.resolve();

    const newClient = new ReactNativeIapStoreKitClient();
    const connecting = newClient.connect(createHandlers());
    await Promise.resolve();
    expect(initConnection).toHaveBeenCalledTimes(1);

    settleEnd();
    await disconnecting;
    await connecting;
    expect(initConnection).toHaveBeenCalledTimes(2);
    expect(jest.mocked(endConnection).mock.invocationCallOrder[0]).toBeLessThan(
      jest.mocked(initConnection).mock.invocationCallOrder[1]!,
    );
    jest.mocked(endConnection).mockResolvedValue(true);
    await newClient.disconnect();
  });

  it('reconnects after a late native endConnection rejection without leaking an unhandled rejection', async () => {
    const oldClient = new ReactNativeIapStoreKitClient();
    await oldClient.connect(createHandlers());
    let rejectEnd!: (error: Error) => void;
    const rawEnd = new Promise<boolean>((_resolve, reject) => { rejectEnd = reject; });
    jest.mocked(endConnection).mockReturnValue(rawEnd);
    const unhandledRejection = jest.fn();
    process.on('unhandledRejection', unhandledRejection);

    try {
      const disconnectResult = oldClient.disconnect().catch((error: unknown) => error);
      await Promise.resolve();

      const newClient = new ReactNativeIapStoreKitClient();
      const connecting = newClient.connect(createHandlers());
      await Promise.resolve();
      expect(initConnection).toHaveBeenCalledTimes(1);

      rejectEnd(new Error('native_end_connection_failed'));
      await expect(disconnectResult).resolves.toEqual(
        expect.objectContaining({ message: 'native_end_connection_failed' }),
      );
      await expect(connecting).resolves.toBeUndefined();
      await new Promise<void>((resolve) => setImmediate(resolve));

      expect(unhandledRejection).not.toHaveBeenCalled();
      expect(initConnection).toHaveBeenCalledTimes(2);
      expect(jest.mocked(endConnection).mock.invocationCallOrder[0]).toBeLessThan(
        jest.mocked(initConnection).mock.invocationCallOrder[1]!,
      );

      jest.mocked(endConnection).mockResolvedValue(true);
      await newClient.disconnect();
    } finally {
      process.off('unhandledRejection', unhandledRejection);
    }
  });

  it('removes both listeners, ends the native connection once, and never duplicates callbacks', async () => {
    const firstHandlers = createHandlers();
    const firstClient = new ReactNativeIapStoreKitClient();
    await firstClient.connect(firstHandlers);
    emitPurchase(PURCHASE);
    emitPurchaseError({
      code: 'user-cancelled' as PurchaseError['code'],
      message: 'cancelled',
      productId: PURCHASE.productId,
    });

    await firstClient.disconnect();
    await firstClient.disconnect();
    const secondHandlers = createHandlers();
    const secondClient = new ReactNativeIapStoreKitClient();
    await secondClient.connect(secondHandlers);
    emitPurchase({ ...PURCHASE, transactionId: 'second-transaction' });
    emitPurchaseError({
      code: 'pending' as PurchaseError['code'],
      message: 'pending',
      productId: PURCHASE.productId,
    });
    await secondClient.disconnect();

    expect(firstHandlers.onPurchaseUpdated).toHaveBeenCalledTimes(1);
    expect(firstHandlers.onPurchaseError).toHaveBeenCalledWith({
      code: 'user-cancelled',
      productId: PURCHASE.productId,
    });
    expect(secondHandlers.onPurchaseUpdated).toHaveBeenCalledTimes(1);
    expect(secondHandlers.onPurchaseError).toHaveBeenCalledWith({
      code: 'pending',
      productId: PURCHASE.productId,
    });
    expect(mockPurchaseUpdatedListeners.every((listener) => !listener.active)).toBe(true);
    expect(mockPurchaseErrorListeners.every((listener) => !listener.active)).toBe(true);
    expect(endConnection).toHaveBeenCalledTimes(2);
  });

  it('disconnects promptly while native connect is pending and closes a late connection', async () => {
    let resolveConnection!: (connected: boolean) => void;
    jest.mocked(initConnection).mockImplementation(
      () => new Promise<boolean>((resolve) => (resolveConnection = resolve)),
    );
    const client = new ReactNativeIapStoreKitClient();
    const connection = client.connect(createHandlers());
    const connectionResult = connection.catch((error: unknown) => error);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const disconnection = client.disconnect();

    resolveConnection(true);
    await expect(connectionResult).resolves.toEqual(
      expect.objectContaining({ message: 'storekit_client_disconnected' }),
    );
    await expect(disconnection).resolves.toBeUndefined();

    expect(purchaseUpdatedListener).not.toHaveBeenCalled();
    expect(purchaseErrorListener).not.toHaveBeenCalled();
    expect(endConnection).toHaveBeenCalledTimes(1);
  });
});
