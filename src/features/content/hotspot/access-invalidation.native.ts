import {
  nativeCommerceEnvironmentSnapshot,
  subscribeNativeCommerceEnvironment,
} from '@/features/native-commercial-testflight/commerce-environment';

// Integration seam for verified entitlement-change events. Until the
// commercial workstream lands, environment changes remain the only trigger.
export const hotspotAccessInvalidationSnapshot = nativeCommerceEnvironmentSnapshot;
export const subscribeHotspotAccessInvalidation = subscribeNativeCommerceEnvironment;
