import { Platform } from 'react-native';
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
  type EventSubscription,
  type ProductOrSubscription,
  type Purchase,
  type PurchaseIOS,
} from 'react-native-iap';

import type {
  StoreKitClient,
  StoreKitEventHandlers,
  StoreKitProduct,
  StoreKitTransaction,
} from './storekit-client.native';

function toStoreKitProduct(product: ProductOrSubscription): StoreKitProduct | undefined {
  if (product.platform !== 'ios' || product.type !== 'in-app') return undefined;

  return {
    productId: product.id,
    localizedPrice: product.displayPrice,
    currencyCode: product.currency,
    productTypeIOS: product.typeIOS,
  };
}

function toStoreKitTransaction(purchase: Purchase): StoreKitTransaction | undefined {
  if (purchase.store !== 'apple' || !purchase.transactionId) return undefined;
  const iosPurchase = purchase as PurchaseIOS;

  return {
    productId: iosPurchase.productId,
    transactionId: iosPurchase.transactionId,
    purchaseState: iosPurchase.purchaseState,
    purchaseToken: iosPurchase.purchaseToken ?? undefined,
    transactionDate: iosPurchase.transactionDate,
    environmentIOS: iosPurchase.environmentIOS ?? undefined,
  };
}

export class ReactNativeIapStoreKitClient implements StoreKitClient {
  private connected = false;
  private purchaseUpdatedSubscription?: EventSubscription;
  private purchaseErrorSubscription?: EventSubscription;
  private readonly purchasesByTransaction = new Map<string, Purchase>();

  async connect(handlers: StoreKitEventHandlers): Promise<void> {
    if (this.connected) return;
    if (Platform.OS !== 'ios') throw new Error('storekit_platform_unsupported');

    const didConnect = await initConnection();
    if (!didConnect) throw new Error('storekit_connection_failed');

    try {
      this.purchaseUpdatedSubscription = purchaseUpdatedListener((purchase) => {
        const transaction = toStoreKitTransaction(purchase);
        if (!transaction) return;
        this.purchasesByTransaction.set(transaction.transactionId, purchase);
        handlers.onPurchaseUpdated(transaction);
      });
      this.purchaseErrorSubscription = purchaseErrorListener((error) => {
        handlers.onPurchaseError({ code: error.code });
      });
      this.connected = true;
    } catch (error) {
      this.purchaseUpdatedSubscription?.remove();
      this.purchaseErrorSubscription?.remove();
      await endConnection().catch(() => undefined);
      throw error;
    }
  }

  async fetchProducts(productIds: readonly string[]): Promise<readonly StoreKitProduct[]> {
    const products = await fetchProducts({ skus: [...productIds], type: 'in-app' });
    return (products ?? []).flatMap((product) => {
      const storeKitProduct = toStoreKitProduct(product);
      return storeKitProduct ? [storeKitProduct] : [];
    });
  }

  async requestPurchase(input: {
    productId: string;
    applicationAccountToken: string;
  }): Promise<void> {
    await requestPurchase({
      request: {
        apple: {
          sku: input.productId,
          appAccountToken: input.applicationAccountToken,
          andDangerouslyFinishTransactionAutomatically: false,
        },
      },
      type: 'in-app',
    });
  }

  async restorePurchases(): Promise<readonly StoreKitTransaction[]> {
    await syncIOS();
    const purchases = await getAllTransactionsIOS();

    return purchases.flatMap((purchase) => {
      const transaction = toStoreKitTransaction(purchase);
      if (!transaction) return [];
      return [transaction];
    });
  }

  async finishTransaction(transactionReference: string): Promise<void> {
    let purchase = this.purchasesByTransaction.get(transactionReference);
    if (!purchase) {
      const unfinishedPurchases = await getPendingTransactionsIOS();
      purchase = unfinishedPurchases.find(
        (candidate) =>
          candidate.store === 'apple' && candidate.transactionId === transactionReference,
      );
    }
    if (!purchase) throw new Error('storekit_transaction_unknown');

    await finishTransaction({ purchase, isConsumable: false });
    this.purchasesByTransaction.delete(transactionReference);
  }
}

export function createReactNativeIapStoreKitClient(): StoreKitClient {
  return new ReactNativeIapStoreKitClient();
}
