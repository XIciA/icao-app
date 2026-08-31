import type { CommerceEntitlementChange } from './commerce-runtime-types';

export type CommerceEntitlementChangeListener = (
  change: CommerceEntitlementChange,
) => void;

const listeners = new Set<CommerceEntitlementChangeListener>();

/**
 * Stable integration contract for content/cache owners. Consumers subscribe
 * once, validate accountId + environment, then apply only increasing revision
 * values. The runtime remains the sole producer and revision owner.
 */
export function subscribeCommerceEntitlementChanges(
  listener: CommerceEntitlementChangeListener,
) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function publishCommerceEntitlementChange(change: CommerceEntitlementChange) {
  for (const listener of [...listeners]) {
    try {
      listener(change);
    } catch {
      // A downstream cache must never break the commerce ledger/runtime.
    }
  }
}
