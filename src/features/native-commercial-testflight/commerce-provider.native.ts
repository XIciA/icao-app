export const TESTFLIGHT_COMMERCE_DISABLED_CODE = 'commerce_disabled_testflight' as const;

export const MEMBERSHIP_OFFERING_KEYS = [
  'membership_7d_v1',
  'membership_15d_v1',
  'membership_31d_v1',
  'membership_62d_v1',
  'membership_93d_v1',
] as const;

export type CommerceOfferingKey = (typeof MEMBERSHIP_OFFERING_KEYS)[number];

export type CommerceFailureCode =
  | typeof TESTFLIGHT_COMMERCE_DISABLED_CODE
  | 'commerce_platform_unsupported'
  | 'commerce_store_connection_failed'
  | 'commerce_catalog_query_failed'
  | 'commerce_catalog_incomplete'
  | 'commerce_catalog_invalid'
  | 'commerce_offering_unknown'
  | 'commerce_account_token_invalid'
  | 'commerce_purchase_busy'
  | 'commerce_purchase_cancelled'
  | 'commerce_purchase_pending'
  | 'commerce_purchase_timed_out'
  | 'commerce_purchase_failed'
  | 'commerce_restore_failed'
  | 'commerce_operation_busy'
  | 'commerce_operation_cancelled'
  | 'commerce_reconciliation_timed_out'
  | 'commerce_reconciliation_budget_exceeded'
  | 'commerce_provider_disposed'
  | 'commerce_verification_required'
  | 'commerce_transaction_unknown'
  | 'commerce_finish_failed';

export type CommerceUnavailableResult = Readonly<{
  ok: false;
  state: 'unavailable';
  code:
    | typeof TESTFLIGHT_COMMERCE_DISABLED_CODE
    | 'commerce_platform_unsupported'
    | 'commerce_store_connection_failed';
  charged: false;
  retryable: boolean;
}>;

export type CommerceCancelledResult = Readonly<{
  ok: false;
  state: 'cancelled';
  code: 'commerce_purchase_cancelled';
  charged: false;
  retryable: true;
}>;

export type CommercePendingResult = Readonly<{
  ok: false;
  state: 'pending';
  code: 'commerce_purchase_pending';
  charged: false;
  retryable: false;
}>;

export type CommerceErrorResult = Readonly<{
  ok: false;
  state: 'error';
  code: Exclude<
    CommerceFailureCode,
    | CommerceUnavailableResult['code']
    | CommerceCancelledResult['code']
    | CommercePendingResult['code']
  >;
  /** An error cannot prove whether the App Store completed a charge. */
  charged: false | 'unknown';
  retryable: boolean;
}>;

export type CommerceFailureResult =
  | CommerceUnavailableResult
  | CommerceCancelledResult
  | CommercePendingResult
  | CommerceErrorResult;

export type CommerceSuccessResult<T> = Readonly<{
  ok: true;
  state: 'succeeded';
  value: T;
}>;

export type CommerceResult<T> = CommerceSuccessResult<T> | CommerceFailureResult;

export type CommerceOffering = Readonly<{
  key: CommerceOfferingKey;
  title: string;
  durationDays: 7 | 15 | 31 | 62 | 93;
  recommended: boolean;
  /** StoreKit's localized display price. No client-side price fallback exists. */
  localizedPrice: string;
  currencyCode: string;
}>;

export type CommerceCatalog = Readonly<{
  offerings: readonly CommerceOffering[];
}>;

export type CommercePurchaseRequest = Readonly<{
  offeringKey: CommerceOfferingKey;
  /** The signed-in account UUID passed to StoreKit as appAccountToken. */
  applicationAccountToken: string;
}>;

export type CommerceTransactionEnvironment = 'sandbox' | 'production' | 'xcode' | 'unknown';

/**
 * A StoreKit transaction awaiting server verification. Receiving this value
 * never grants a local entitlement.
 */
export type CommerceTransaction = Readonly<{
  offeringKey: CommerceOfferingKey;
  transactionReference: string;
  purchasedAt: string;
  signedTransaction: string;
  environment: CommerceTransactionEnvironment;
  requiresServerVerification: true;
}>;

/**
 * A StoreKit transaction that cannot be associated with a supported offering.
 * It is observable for reconciliation, but can never be finished by this provider.
 */
export type CommerceQuarantinedTransaction = Readonly<{
  productId: string;
  transactionReference?: string;
  purchasedAt?: string;
  signedTransaction?: string;
  environment: CommerceTransactionEnvironment;
  reason: 'unknown_product' | 'invalid_transaction';
  finishAllowed: false;
}>;

export type CommerceTransactionInbox = Readonly<{
  transactions: readonly CommerceTransaction[];
  quarantinedTransactions: readonly CommerceQuarantinedTransaction[];
  /** If true, StoreKit reconciliation must be run again to recover evicted entries. */
  overflowed: boolean;
  entitlementGranted: false;
}>;

export type CommercePurchase = Readonly<{
  transaction: CommerceTransaction;
  entitlementGranted: false;
  transactionFinished: false;
}>;

export type CommerceRestore = Readonly<{
  transactions: readonly CommerceTransaction[];
  quarantinedTransactions: readonly CommerceQuarantinedTransaction[];
  overflowed: boolean;
  entitlementGranted: false;
}>;

declare const SERVER_VERIFIED_ACKNOWLEDGEMENT_BRAND: unique symbol;

/** Opaque provider-owned capability created only after the integration reports server success. */
export type CommerceServerVerifiedAcknowledgement = Readonly<{
  transactionReference: string;
  [SERVER_VERIFIED_ACKNOWLEDGEMENT_BRAND]: true;
}>;

export type CommerceServerVerificationRequest = Readonly<{
  transactionReference: string;
  /** Must exactly match the JWS submitted to and accepted by the service. */
  signedTransaction: string;
}>;

export type CommerceFinishRequest = Readonly<{
  acknowledgement: CommerceServerVerifiedAcknowledgement;
}>;

export type CommerceFinish = Readonly<{
  transactionReference: string;
  transactionFinished: true;
  completion: 'finished' | 'already-finished';
}>;

/** Stable business boundary. StoreKit and channel product types stay behind it. */
export interface NativeCommerceProvider {
  listOfferings(): Promise<CommerceResult<CommerceCatalog>>;
  purchase(request: CommercePurchaseRequest): Promise<CommerceResult<CommercePurchase>>;
  /** Drains native events already observed by this provider. */
  drainTransactionInbox(): Promise<CommerceResult<CommerceTransactionInbox>>;
  /**
   * Must run on every app start. This is a silent history read and never invokes
   * StoreKit account sync. If overflowed is true, verify this page and call again
   * until false so every StoreKit history entry is delivered boundedly.
   */
  reconcileTransactions(): Promise<CommerceResult<CommerceTransactionInbox>>;
  /** Explicit user action only. This is the sole provider path allowed to sync StoreKit. */
  restorePurchases(): Promise<CommerceResult<CommerceRestore>>;
  /** Call only after the service has verified and durably recorded the exact JWS. */
  markServerVerified(
    request: CommerceServerVerificationRequest,
  ): Promise<CommerceResult<CommerceServerVerifiedAcknowledgement>>;
  finishTransaction(request: CommerceFinishRequest): Promise<CommerceResult<CommerceFinish>>;
  dispose(): Promise<void>;
}

export const TESTFLIGHT_COMMERCE_UNAVAILABLE_RESULT: CommerceUnavailableResult = Object.freeze({
  ok: false,
  state: 'unavailable',
  code: TESTFLIGHT_COMMERCE_DISABLED_CODE,
  charged: false,
  retryable: false,
});
