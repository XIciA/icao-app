import type {
  CommerceEntitlementChange,
  CommerceEntitlementChangeReason,
} from './commerce-runtime-types';

export type CommerceEntitlementChangeListener = (
  change: CommerceEntitlementChange,
) => void;

type EntitlementPublication = Omit<CommerceEntitlementChange, 'revision'>;

const listeners = new Set<CommerceEntitlementChangeListener>();
let activeGeneration = 0;
let revision = 0;
let snapshot: CommerceEntitlementChange | undefined;

function commit(change: EntitlementPublication) {
  revision += 1;
  snapshot = Object.freeze({ ...change, revision });
  for (const listener of [...listeners]) {
    try {
      listener(snapshot);
    } catch {
      // A downstream cache must never break the commerce ledger/runtime.
    }
  }
  return snapshot;
}

/**
 * Atomically activates a new entitlement owner. The empty snapshot is
 * replayable immediately, so remounts/account switches cannot expose the
 * previous account's membership while the new refresh is pending.
 */
export function beginCommerceEntitlementGeneration(
  accountId: string,
  environment: CommerceEntitlementChange['environment'] = 'production',
  reason: CommerceEntitlementChangeReason = 'account-change',
) {
  activeGeneration += 1;
  return commit({
    accountId,
    environment,
    generation: activeGeneration,
    reason,
  });
}

/** Replays the current stable external-store snapshot to late subscribers. */
export function getCommerceEntitlementSnapshot() {
  return snapshot;
}

export function commerceEntitlementSnapshotVersion() {
  const current = snapshot;
  return current
    ? `${current.accountId}:${current.environment}:${current.generation}:${current.revision}`
    : `none:${activeGeneration}:${revision}`;
}

/** Reload protected content only when its access changes, not on every balance
 * or heartbeat refresh. Ownership remains part of the identity. */
export function commerceContentAccessSnapshot() {
  const current = snapshot;
  return current ? JSON.stringify([
    current.accountId, current.environment, current.generation,
    current.snapshot?.membership.active ?? null,
    current.snapshot?.membership.expiresAt ?? null,
  ]) : 'none';
}

/** Pending → verified for the same owner must not unmount an active lesson. */
export function canRetainContentOnAccessRefresh(previous: string, next: string) {
  if (previous === next) return true;
  try {
    const a = JSON.parse(previous); const b = JSON.parse(next);
    return Array.isArray(a) && Array.isArray(b) && a.slice(0, 3).every((value, index) => value === b[index])
      && a[3] !== false && b[3] !== false;
  } catch { return false; }
}

export function subscribeCommerceEntitlementChanges(
  listener: CommerceEntitlementChangeListener,
) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Publishes only for the active generation and assigns the process-wide
 * revision here. A stale provider remount can never roll revision back or
 * overwrite a newer account/environment owner.
 */
export function publishCommerceEntitlementChange(change: EntitlementPublication) {
  if (change.generation !== activeGeneration) return snapshot;
  // A response requested before a purchase can finish after server verification.
  // The shared owner must not replace the verified membership with older data.
  if (snapshot?.generation === change.generation && snapshot.environment === change.environment
    && snapshot.snapshot && change.snapshot
    && Date.parse(change.snapshot.serverTime) < Date.parse(snapshot.snapshot.serverTime)) return snapshot;
  return commit(change);
}

export function clearCommerceEntitlementGeneration(
  reason: CommerceEntitlementChangeReason = 'account-change',
) {
  activeGeneration += 1;
  if (!snapshot) return undefined;
  return commit({
    accountId: snapshot.accountId,
    environment: snapshot.environment,
    generation: activeGeneration,
    reason,
  });
}

/** Jest-only reset for deterministic module-level revision assertions. */
export function resetCommerceEntitlementEventsForTests() {
  activeGeneration = 0;
  revision = 0;
  snapshot = undefined;
  listeners.clear();
}
