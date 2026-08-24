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
}>;

export type StoreKitPurchaseError = Readonly<{
  code: string;
}>;

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
  restorePurchases(): Promise<readonly StoreKitTransaction[]>;
  finishTransaction(transactionReference: string): Promise<void>;
}
