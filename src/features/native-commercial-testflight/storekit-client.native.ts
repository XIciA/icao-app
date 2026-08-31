import type { CommerceOperationLifecycle } from './commerce-runtime-operation.native';

export type StoreKitProduct = Readonly<{
  productId: string;
  localizedPrice: string;
  currencyCode: string;
  productTypeIOS: string;
}>;

export type StoreKitTransaction = Readonly<{
  productId: string;
  transactionId: string;
  purchaseState: 'pending' | 'purchased' | 'unknown';
  purchaseToken?: string;
  transactionDate: number;
  environmentIOS?: string;
  appAccountToken?: string;
}>;

export type StoreKitPurchaseError = Readonly<{
  code: string;
  productId?: string;
}>;

export type StoreKitFinishCompletion = 'finished' | 'already-finished';

export type StoreKitEventHandlers = Readonly<{
  onPurchaseUpdated(transaction: StoreKitTransaction): void;
  onPurchaseError(error: StoreKitPurchaseError): void;
}>;

export interface StoreKitClient {
  connect(
    handlers: StoreKitEventHandlers,
    options?: StoreKitClientOperationOptions,
  ): Promise<void>;
  fetchProducts(
    productIds: readonly string[],
    options?: StoreKitClientOperationOptions,
  ): Promise<readonly StoreKitProduct[]>;
  requestPurchase(input: {
    productId: string;
    applicationAccountToken: string;
  }, options?: StoreKitClientOperationOptions): Promise<void>;
  /** Reads StoreKit history without presenting an App Store account sync flow. */
  getTransactions(options?: StoreKitClientOperationOptions): Promise<readonly StoreKitTransaction[]>;
  /** Explicit user-initiated Restore Purchases step. This is the only sync path. */
  syncPurchases(options?: StoreKitClientOperationOptions): Promise<void>;
  finishTransaction(
    transactionReference: string,
    options?: StoreKitClientOperationOptions,
  ): Promise<StoreKitFinishCompletion>;
  disconnect(options?: StoreKitClientOperationOptions): Promise<void>;
}
export type StoreKitClientOperationOptions = Readonly<{
  lifecycle?: CommerceOperationLifecycle;
}>;
