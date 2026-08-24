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
  | 'error';

export type CommerceActionResult = Readonly<{
  ok: boolean;
  message: string;
}>;

export type CommerceRuntimeValue = Readonly<{
  supported: boolean;
  phase: CommerceRuntimePhase;
  offerings: readonly CommerceRuntimeOffering[];
  entitlement?: CommerceEntitlementSummary;
  entitlementEnvironment?: 'sandbox' | 'production';
  message?: string;
  purchase(productKey: CommerceProductOffering['productKey']): Promise<CommerceActionResult>;
  refresh(): Promise<void>;
  restorePurchases(): Promise<CommerceActionResult>;
}>;
