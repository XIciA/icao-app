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
  StoreKitClientOperationOptions,
} from './storekit-client.native';

const MAX_TRANSACTION_CACHE_ENTRIES = 256;
const APPLE_NON_RENEWING_SUBSCRIPTION_QUERY_TYPE = 'subs' as const;
const APPLE_NON_RENEWING_SUBSCRIPTION_PRODUCT_TYPE =
  'non-renewing-subscription' as const;

const connectionOwners = new Set<symbol>();
let connectionEstablished = false;
let connectionQueue: Promise<void> = Promise.resolve();

function trackNative<T>(
  promise: Promise<T>,
  options: StoreKitClientOperationOptions = {},
): Promise<T> {
  options.lifecycle?.trackRaw(promise);
  return promise;
}

function serializeConnection<T>(operation: () => Promise<T>): Promise<T> {
  const result = connectionQueue.catch(() => undefined).then(operation);
  connectionQueue = result.then(() => undefined, () => undefined);
  return result;
}

function acquireConnection(
  owner: symbol,
  options: StoreKitClientOperationOptions,
): Promise<void> {
  return serializeConnection(async () => {
    if (connectionOwners.has(owner)) return;
    if (!connectionEstablished) {
      const didConnect = await trackNative(Promise.resolve(initConnection()), options);
      if (!didConnect) throw new Error('storekit_connection_failed');
      connectionEstablished = true;
    }
    connectionOwners.add(owner);
  });
}

function releaseConnection(
  owner: symbol,
  options: StoreKitClientOperationOptions,
): Promise<void> {
  return serializeConnection(async () => {
    connectionOwners.delete(owner);
    if (!connectionEstablished || connectionOwners.size > 0) return;
    await trackNative(Promise.resolve(endConnection()), options);
    connectionEstablished = false;
  });
}

/** Test isolation for the process-global react-native-iap connection lease. */
export function resetReactNativeIapConnectionForTests() {
  connectionOwners.clear();
  connectionEstablished = false;
  connectionQueue = Promise.resolve();
}

function toStoreKitProduct(product: ProductOrSubscription): StoreKitProduct | undefined {
  if (
    product.platform !== 'ios'
    || product.type !== APPLE_NON_RENEWING_SUBSCRIPTION_QUERY_TYPE
    || product.typeIOS !== APPLE_NON_RENEWING_SUBSCRIPTION_PRODUCT_TYPE
  ) return undefined;

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
  private readonly connectionOwner = Symbol('storekit-client');

  async connect(
    handlers: StoreKitEventHandlers,
    options: StoreKitClientOperationOptions = {},
  ): Promise<void> {
    if (this.connected) return;
    if (this.closed) throw new Error('storekit_client_disconnected');
    if (Platform.OS !== 'ios') throw new Error('storekit_platform_unsupported');
    if (!this.connectPromise) {
      this.connectPromise = this.performConnect(handlers, options).catch((error: unknown) => {
        this.connectPromise = undefined;
        throw error;
      });
    }
    await this.connectPromise;
  }

  private async performConnect(
    handlers: StoreKitEventHandlers,
    options: StoreKitClientOperationOptions,
  ): Promise<void> {
    await acquireConnection(this.connectionOwner, options);
    if (this.closed) {
      await releaseConnection(this.connectionOwner, options).catch(() => undefined);
      throw new Error('storekit_client_disconnected');
    }

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
      await releaseConnection(this.connectionOwner, options).catch(() => undefined);
      throw error;
    }
  }

  async fetchProducts(
    productIds: readonly string[],
    options: StoreKitClientOperationOptions = {},
  ): Promise<readonly StoreKitProduct[]> {
    const products = await trackNative(Promise.resolve(fetchProducts({
      skus: [...productIds],
      type: APPLE_NON_RENEWING_SUBSCRIPTION_QUERY_TYPE,
    })), options);
    return (products ?? []).flatMap((product) => {
      const storeKitProduct = toStoreKitProduct(product);
      return storeKitProduct ? [storeKitProduct] : [];
    });
  }

  async requestPurchase(input: {
    productId: string;
    applicationAccountToken: string;
  }, options: StoreKitClientOperationOptions = {}): Promise<void> {
    await trackNative(Promise.resolve(requestPurchase({
      request: {
        apple: {
          sku: input.productId,
          appAccountToken: input.applicationAccountToken,
          andDangerouslyFinishTransactionAutomatically: false,
        },
      },
      type: APPLE_NON_RENEWING_SUBSCRIPTION_QUERY_TYPE,
    })), options);
  }

  async getTransactions(
    options: StoreKitClientOperationOptions = {},
  ): Promise<readonly StoreKitTransaction[]> {
    const purchases = await trackNative(Promise.resolve(getAllTransactionsIOS()), options);

    return purchases.flatMap((purchase) => {
      const transaction = toStoreKitTransaction(purchase);
      if (!transaction) return [];
      return [transaction];
    });
  }

  async syncPurchases(options: StoreKitClientOperationOptions = {}): Promise<void> {
    await trackNative(Promise.resolve(syncIOS()), options);
  }

  async finishTransaction(
    transactionReference: string,
    options: StoreKitClientOperationOptions = {},
  ): Promise<StoreKitFinishCompletion> {
    if (this.finishedTransactionReferences.has(transactionReference)) {
      return 'already-finished';
    }

    let purchase = this.purchasesByTransaction.get(transactionReference);
    if (!purchase) {
      const unfinishedPurchases = await trackNative(
        Promise.resolve(getPendingTransactionsIOS()),
        options,
      );
      purchase = unfinishedPurchases.find(
        (candidate) =>
          candidate.store === 'apple' && candidate.transactionId === transactionReference,
      );
    }
    if (!purchase) {
      const transactionHistory = await trackNative(
        Promise.resolve(getAllTransactionsIOS()),
        options,
      );
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

    await trackNative(
      Promise.resolve(finishTransaction({ purchase, isConsumable: false })),
      options,
    );
    this.purchasesByTransaction.delete(transactionReference);
    this.setBoundedFinishedReference(transactionReference);
    return 'finished';
  }

  async disconnect(options: StoreKitClientOperationOptions = {}): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.connected = false;
    this.purchaseUpdatedSubscription?.remove();
    this.purchaseErrorSubscription?.remove();
    this.purchaseUpdatedSubscription = undefined;
    this.purchaseErrorSubscription = undefined;
    this.purchasesByTransaction.clear();
    this.finishedTransactionReferences.clear();
    await releaseConnection(this.connectionOwner, options);
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
