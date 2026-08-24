import type { PurchaseIOS } from 'react-native-iap';
import {
  finishTransaction,
  getAllTransactionsIOS,
  getPendingTransactionsIOS,
  initConnection,
  purchaseErrorListener,
  purchaseUpdatedListener,
  syncIOS,
} from 'react-native-iap';

import { ReactNativeIapStoreKitClient } from '../react-native-iap-storekit-client.native';

jest.mock('react-native-iap', () => ({
  endConnection: jest.fn(async () => true),
  fetchProducts: jest.fn(async () => []),
  finishTransaction: jest.fn(async () => undefined),
  getAllTransactionsIOS: jest.fn(async () => []),
  getPendingTransactionsIOS: jest.fn(async () => []),
  initConnection: jest.fn(async () => true),
  purchaseErrorListener: jest.fn(() => ({ remove: jest.fn() })),
  purchaseUpdatedListener: jest.fn(() => ({ remove: jest.fn() })),
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
};

const handlers = {
  onPurchaseUpdated: jest.fn(),
  onPurchaseError: jest.fn(),
};

describe('react-native-iap StoreKit client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(initConnection).mockResolvedValue(true);
    jest.mocked(purchaseUpdatedListener).mockReturnValue({ remove: jest.fn() });
    jest.mocked(purchaseErrorListener).mockReturnValue({ remove: jest.fn() });
    jest.mocked(getAllTransactionsIOS).mockResolvedValue([]);
    jest.mocked(getPendingTransactionsIOS).mockResolvedValue([]);
    jest.mocked(syncIOS).mockResolvedValue(true);
    jest.mocked(finishTransaction).mockResolvedValue(undefined);
  });

  it('rebuilds an unfinished transaction after app restart before finishing it', async () => {
    const restartedClient = new ReactNativeIapStoreKitClient();
    jest.mocked(getPendingTransactionsIOS).mockResolvedValue([PURCHASE]);

    await restartedClient.connect(handlers);
    await restartedClient.finishTransaction(PURCHASE.transactionId);

    expect(getPendingTransactionsIOS).toHaveBeenCalledTimes(1);
    expect(finishTransaction).toHaveBeenCalledWith({
      purchase: PURCHASE,
      isConsumable: false,
    });
  });

  it('rejects a transaction absent from StoreKit unfinished history', async () => {
    const restartedClient = new ReactNativeIapStoreKitClient();

    await restartedClient.connect(handlers);

    await expect(restartedClient.finishTransaction('unknown-transaction')).rejects.toThrow(
      'storekit_transaction_unknown',
    );
    expect(finishTransaction).not.toHaveBeenCalled();
  });

  it('rejects a false native connection result', async () => {
    const client = new ReactNativeIapStoreKitClient();
    jest.mocked(initConnection).mockResolvedValue(false);

    await expect(client.connect(handlers)).rejects.toThrow('storekit_connection_failed');
    expect(purchaseUpdatedListener).not.toHaveBeenCalled();
    expect(purchaseErrorListener).not.toHaveBeenCalled();
  });

  it('reconciles signed transaction history after restart without granting or finishing locally', async () => {
    const restartedClient = new ReactNativeIapStoreKitClient();
    jest.mocked(getAllTransactionsIOS).mockResolvedValue([PURCHASE]);

    await restartedClient.connect(handlers);
    const restored = await restartedClient.restorePurchases();

    expect(syncIOS).toHaveBeenCalledTimes(1);
    expect(restored).toEqual([
      {
        productId: PURCHASE.productId,
        transactionId: PURCHASE.transactionId,
        purchaseState: 'purchased',
        purchaseToken: PURCHASE.purchaseToken,
        transactionDate: PURCHASE.transactionDate,
        environmentIOS: undefined,
      },
    ]);
    expect(finishTransaction).not.toHaveBeenCalled();
  });
});
