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
  connect(handlers: StoreKitEventHandlers): Promise<void>;
  fetchProducts(productIds: readonly string[]): Promise<readonly StoreKitProduct[]>;
  requestPurchase(input: {
    productId: string;
    applicationAccountToken: string;
  }): Promise<void>;
  /** Reads StoreKit history without presenting an App Store account sync flow. */
  getTransactions(): Promise<readonly StoreKitTransaction[]>;
  /** Explicit user-initiated Restore Purchases flow. This may call StoreKit sync. */
  restorePurchases(): Promise<readonly StoreKitTransaction[]>;
  finishTransaction(transactionReference: string): Promise<StoreKitFinishCompletion>;
  disconnect(): Promise<void>;
}
