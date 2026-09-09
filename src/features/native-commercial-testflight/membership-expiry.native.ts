import type { CommerceEntitlementSummary } from '@icao/contracts';

/** One server-derived deadline for the commerce owner, independent of the phone's wall clock. */
export function scheduleMembershipExpiry(snapshot: CommerceEntitlementSummary, expire: () => void) {
  if (!snapshot.membership.active || !snapshot.membership.expiresAt) return () => undefined;
  const remaining = Date.parse(snapshot.membership.expiresAt) - Date.parse(snapshot.serverTime);
  if (!Number.isFinite(remaining)) return () => undefined;
  const started = performance.now();
  let timer: ReturnType<typeof setTimeout>;
  let cancelled = false;
  function schedule() {
    const delay = Math.max(0, remaining - (performance.now() - started));
    // Native timers also have a signed 32-bit delay limit; long packages must not expire early.
    timer = setTimeout(() => {
      if (cancelled) return;
      if (remaining - (performance.now() - started) > 0) schedule();
      else expire();
    }, Math.min(delay, 2_147_483_647));
  }
  schedule();
  return () => { cancelled = true; clearTimeout(timer); };
}
