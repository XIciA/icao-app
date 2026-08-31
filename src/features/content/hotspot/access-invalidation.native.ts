import {
  nativeCommerceEnvironmentSnapshot,
  subscribeNativeCommerceEnvironment,
} from '@/features/native-commercial-testflight/commerce-environment';
import {
  commerceEntitlementSnapshotVersion,
  subscribeCommerceEntitlementChanges,
} from '@/features/native-commercial-testflight/commerce-entitlement-events';

export function hotspotAccessInvalidationSnapshot() {
  return `${nativeCommerceEnvironmentSnapshot()}|${commerceEntitlementSnapshotVersion()}`;
}

/**
 * Hotspot authorization follows the same verified entitlement external store
 * as membership. Purchase, restore, refund/manual refresh, account and
 * environment changes all invalidate the loader without a page-local bridge.
 */
export function subscribeHotspotAccessInvalidation(listener: () => void) {
  const unsubscribeEnvironment = subscribeNativeCommerceEnvironment(listener);
  const unsubscribeEntitlement = subscribeCommerceEntitlementChanges(() => listener());
  return () => {
    unsubscribeEntitlement();
    unsubscribeEnvironment();
  };
}
