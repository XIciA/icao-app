import type { PurchaseError, PurchaseIOS } from 'react-native-iap';
import {
  endConnection,
  finishTransaction,
  getAllTransactionsIOS,
  getPendingTransactionsIOS,
  initConnection,
  purchaseErrorListener,
  purchaseUpdatedListener,
  requestPurchase,
  syncIOS,
} from 'react-native-iap';

import { ReactNativeIapStoreKitClient } from '../react-native-iap-storekit-client.native';

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
    jest.clearAllMocks();
    mockPurchaseUpdatedListeners.length = 0;
    mockPurchaseErrorListeners.length = 0;
    jest.mocked(initConnection).mockResolvedValue(true);
    jest.mocked(getAllTransactionsIOS).mockResolvedValue([]);
    jest.mocked(getPendingTransactionsIOS).mockResolvedValue([]);
    jest.mocked(syncIOS).mockResolvedValue(true);
    jest.mocked(finishTransaction).mockResolvedValue(undefined);
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
    const restored = await restartedClient.restorePurchases();

    expect(syncIOS).toHaveBeenCalledTimes(1);
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
      type: 'in-app',
    });
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

    await expect(client.disconnect()).resolves.toBeUndefined();
    resolveConnection(true);
    await expect(connection).rejects.toThrow('storekit_client_disconnected');

    expect(purchaseUpdatedListener).not.toHaveBeenCalled();
    expect(purchaseErrorListener).not.toHaveBeenCalled();
    expect(endConnection).toHaveBeenCalledTimes(1);
  });
});
