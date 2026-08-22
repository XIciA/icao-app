export const TESTFLIGHT_COMMERCE_DISABLED_CODE = 'commerce_disabled_testflight' as const;

export type CommerceUnavailableResult = Readonly<{
  ok: false;
  state: 'unavailable';
  code: typeof TESTFLIGHT_COMMERCE_DISABLED_CODE;
  charged: false;
  retryable: false;
}>;

export type CommerceSuccessResult<T> = Readonly<{
  ok: true;
  value: T;
}>;

export type CommerceResult<T> = CommerceSuccessResult<T> | CommerceUnavailableResult;

/**
 * An app-facing key only. Channel-specific product identifiers belong inside a
 * future provider implementation and must not leak into feature consumers.
 */
export type CommerceOfferingKey = string;

export type CommerceOffering = Readonly<{
  key: CommerceOfferingKey;
  title: string;
}>;

export type CommerceCatalog = Readonly<{
  offerings: readonly CommerceOffering[];
}>;

export type CommercePurchaseRequest = Readonly<{
  offeringKey: CommerceOfferingKey;
}>;

export type CommercePurchase = Readonly<{
  entitlementReference: string;
}>;

export type CommerceRestore = Readonly<{
  entitlementReferences: readonly string[];
}>;

/**
 * Stable app-side boundary for a future native commerce channel. The
 * TestFlight implementation intentionally has no channel dependency.
 */
export interface NativeCommerceProvider {
  listOfferings(): Promise<CommerceResult<CommerceCatalog>>;
  purchase(request: CommercePurchaseRequest): Promise<CommerceResult<CommercePurchase>>;
  restorePurchases(): Promise<CommerceResult<CommerceRestore>>;
}

export const TESTFLIGHT_COMMERCE_UNAVAILABLE_RESULT: CommerceUnavailableResult = Object.freeze({
  ok: false,
  state: 'unavailable',
  code: TESTFLIGHT_COMMERCE_DISABLED_CODE,
  charged: false,
  retryable: false,
});
