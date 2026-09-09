import type {
  CommerceEntitlementSummary,
  CommerceProductOffering,
} from '@icao/contracts';

export type CommerceRuntimeOffering = Readonly<{
  productKey: CommerceProductOffering['productKey'];
  displayName: string;
  durationDays: CommerceProductOffering['durationDays'];
  recommended: boolean;
  localizedPrice: string;
  currencyCode: string;
}>;

export type CommerceRuntimePhase =
  | 'unavailable'
  | 'loading'
  | 'ready'
  | 'purchasing'
  | 'pending'
  | 'restoring'
  | 'reconciling'
  | 'error';

export type CommerceRuntimeOperation =
  | 'catalog'
  | 'purchase'
  | 'restore'
  | 'refresh'
  | 'reconciliation';

export type CommerceRuntimeErrorCode =
  | 'not-supported'
  | 'catalog-unavailable'
  | 'catalog-invalid'
  | 'operation-busy'
  | 'operation-cancelled'
  | 'purchase-cancelled'
  | 'purchase-pending'
  | 'purchase-unconfirmed'
  | 'purchase-failed'
  | 'restore-failed'
  | 'restore-timed-out'
  | 'refresh-failed'
  | 'account-changed'
  | 'uncertain-purchase';

export type CommerceRuntimeError = Readonly<{
  code: CommerceRuntimeErrorCode;
  operation: CommerceRuntimeOperation;
  userMessage: string;
  retryable: boolean;
  chargeStatus: 'not-started' | 'cancelled' | 'pending' | 'unknown' | 'not-applicable';
}>;

export type CommerceActionResult = Readonly<{
  ok: boolean;
  message: string;
  error?: CommerceRuntimeError;
}>;

export type CommerceEntitlementChangeReason =
  | 'account-change'
  | 'environment-change'
  | 'startup-reconciliation'
  | 'transaction-verification'
  | 'purchase'
  | 'restore'
  | 'manual-refresh'
  | 'foreground-reconciliation'
  | 'pending-reconciliation'
  | 'membership-expired';

export type CommerceEntitlementChange = Readonly<{
  accountId: string;
  environment: 'sandbox' | 'production';
  /** Monotonic owner generation; changes across account/environment runtime activation. */
  generation: number;
  revision: number;
  snapshot?: CommerceEntitlementSummary;
  reason: CommerceEntitlementChangeReason;
}>;

export type CommerceRuntimeValue = Readonly<{
  supported: boolean;
  phase: CommerceRuntimePhase;
  offerings: readonly CommerceRuntimeOffering[];
  entitlement?: CommerceEntitlementSummary;
  entitlementEnvironment?: 'sandbox' | 'production';
  /** Monotonic runtime event for downstream content/cache invalidation. */
  entitlementChange?: CommerceEntitlementChange;
  error?: CommerceRuntimeError;
  message?: string;
  purchase(productKey: CommerceProductOffering['productKey']): Promise<CommerceActionResult>;
  refresh(): Promise<void>;
  restorePurchases(): Promise<CommerceActionResult>;
  canCancelPendingPurchase?: boolean;
  cancelPendingPurchase?(): Promise<CommerceActionResult>;
}>;
