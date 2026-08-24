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
  StoreKitFinishCompletion,
  StoreKitProduct,
  StoreKitTransaction,
} from './storekit-client.native';

const MAX_TRANSACTION_CACHE_ENTRIES = 256;

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
    appAccountToken: iosPurchase.appAccountToken ?? undefined,
  };
}

export class ReactNativeIapStoreKitClient implements StoreKitClient {
  private connected = false;
  private closed = false;
  private connectPromise?: Promise<void>;
  private purchaseUpdatedSubscription?: EventSubscription;
  private purchaseErrorSubscription?: EventSubscription;
  private readonly purchasesByTransaction = new Map<string, Purchase>();
  private readonly finishedTransactionReferences = new Set<string>();

  async connect(handlers: StoreKitEventHandlers): Promise<void> {
    if (this.connected) return;
    if (this.closed) throw new Error('storekit_client_disconnected');
    if (Platform.OS !== 'ios') throw new Error('storekit_platform_unsupported');
    if (!this.connectPromise) {
      this.connectPromise = this.performConnect(handlers).catch((error: unknown) => {
        this.connectPromise = undefined;
        throw error;
      });
    }
    await this.connectPromise;
  }

  private async performConnect(handlers: StoreKitEventHandlers): Promise<void> {
    const didConnect = await initConnection();
    if (this.closed) {
      if (didConnect) await endConnection().catch(() => undefined);
      throw new Error('storekit_client_disconnected');
    }

    if (!didConnect) throw new Error('storekit_connection_failed');

    try {
      this.purchaseUpdatedSubscription = purchaseUpdatedListener((purchase) => {
        const transaction = toStoreKitTransaction(purchase);
        if (!transaction) return;
        this.setBoundedPurchase(transaction.transactionId, purchase);
        handlers.onPurchaseUpdated(transaction);
      });
      this.purchaseErrorSubscription = purchaseErrorListener((error) => {
        handlers.onPurchaseError({
          code: error.code,
          ...(error.productId ? { productId: error.productId } : {}),
        });
      });
      this.connected = true;
    } catch (error) {
      this.purchaseUpdatedSubscription?.remove();
      this.purchaseErrorSubscription?.remove();
      this.purchaseUpdatedSubscription = undefined;
      this.purchaseErrorSubscription = undefined;
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

  async getTransactions(): Promise<readonly StoreKitTransaction[]> {
    const purchases = await getAllTransactionsIOS();

    return purchases.flatMap((purchase) => {
      const transaction = toStoreKitTransaction(purchase);
      if (!transaction) return [];
      return [transaction];
    });
  }

  async syncPurchases(): Promise<void> {
    await syncIOS();
  }

  async finishTransaction(
    transactionReference: string,
  ): Promise<StoreKitFinishCompletion> {
    if (this.finishedTransactionReferences.has(transactionReference)) {
      return 'already-finished';
    }

    let purchase = this.purchasesByTransaction.get(transactionReference);
    if (!purchase) {
      const unfinishedPurchases = await getPendingTransactionsIOS();
      purchase = unfinishedPurchases.find(
        (candidate) =>
          candidate.store === 'apple' && candidate.transactionId === transactionReference,
      );
    }
    if (!purchase) {
      const transactionHistory = await getAllTransactionsIOS();
      const alreadyFinished = transactionHistory.some(
        (candidate) =>
          candidate.store === 'apple' && candidate.transactionId === transactionReference,
      );
      if (alreadyFinished) {
        this.setBoundedFinishedReference(transactionReference);
        return 'already-finished';
      }
      throw new Error('storekit_transaction_unknown');
    }

    await finishTransaction({ purchase, isConsumable: false });
    this.purchasesByTransaction.delete(transactionReference);
    this.setBoundedFinishedReference(transactionReference);
    return 'finished';
  }

  async disconnect(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    const wasConnected = this.connected;
    this.connected = false;
    this.purchaseUpdatedSubscription?.remove();
    this.purchaseErrorSubscription?.remove();
    this.purchaseUpdatedSubscription = undefined;
    this.purchaseErrorSubscription = undefined;
    this.purchasesByTransaction.clear();
    this.finishedTransactionReferences.clear();
    if (wasConnected) await endConnection();
  }

  private setBoundedPurchase(transactionReference: string, purchase: Purchase): void {
    this.purchasesByTransaction.delete(transactionReference);
    this.purchasesByTransaction.set(transactionReference, purchase);
    while (this.purchasesByTransaction.size > MAX_TRANSACTION_CACHE_ENTRIES) {
      const oldestReference = this.purchasesByTransaction.keys().next().value as
        | string
        | undefined;
      if (!oldestReference) break;
      this.purchasesByTransaction.delete(oldestReference);
    }
  }

  private setBoundedFinishedReference(transactionReference: string): void {
    this.finishedTransactionReferences.delete(transactionReference);
    this.finishedTransactionReferences.add(transactionReference);
    while (this.finishedTransactionReferences.size > MAX_TRANSACTION_CACHE_ENTRIES) {
      const oldestReference = this.finishedTransactionReferences.values().next().value as
        | string
        | undefined;
      if (!oldestReference) break;
      this.finishedTransactionReferences.delete(oldestReference);
    }
  }
}

export function createReactNativeIapStoreKitClient(): StoreKitClient {
  return new ReactNativeIapStoreKitClient();
}
