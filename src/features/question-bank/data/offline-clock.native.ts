import * as SecureStore from 'expo-secure-store';

// A persisted high-water mark detects clock rollback across cold starts. It is
// scoped to the same account/environment as the signed offline credential.
const clocks = new Map<string, Promise<number>>();
const persisted = new Map<string, number>();
export async function clearOfflineClock(accountId: string) {
  for (const environment of ['production', 'sandbox']) {
    const key = `icao.offline-clock.v1.${accountId}.${environment}`;
    await clocks.get(key)?.catch(() => undefined);
    await SecureStore.deleteItemAsync(key);
    clocks.delete(key);
    persisted.delete(key);
  }
}
export async function offlineClockIsValid(accountId: string, environment: string, now = Date.now()) {
  if (!Number.isFinite(now) || now <= 0) return false;
  const key = `icao.offline-clock.v1.${accountId}.${environment}`;
  let pending = clocks.get(key);
  if (!pending) {
    pending = SecureStore.getItemAsync(key).then(raw => {
      const time = raw === null ? 0 : Number(raw);
      if (!Number.isFinite(time) || time < 0) throw new Error('invalid_offline_clock');
      persisted.set(key, time);
      return time;
    });
    clocks.set(key, pending);
  }
  const previous = pending;
  const operation = previous.then(async time => {
    if (now + 5 * 60_000 < time) throw new Error('offline_clock_rollback');
    const next = Math.max(time, now);
    if (next - (persisted.get(key) ?? 0) >= 60_000) {
      await SecureStore.setItemAsync(key, String(next));
      persisted.set(key, next);
    }
    return next;
  });
  // Install before yielding: concurrent callers are serialized and never regress
  // secure storage. Failed checks keep the previous authoritative watermark.
  clocks.set(key, operation.catch(() => previous));
  return operation.then(() => true, () => false);
}

/** Called only after signature validation on a newly issued API response, never
 * during cache reads/rebases. A fresh server time allows recovery after the user
 * corrects a mistakenly advanced system clock. */
export async function acceptOnlineCredentialClock(accountId: string, environment: string, issuedAt: number) {
  const now = Date.now();
  if (!Number.isFinite(issuedAt) || Math.abs(now - issuedAt) > 5 * 60_000) return;
  const key = 'icao.offline-clock.v1.' + accountId + '.' + environment;
  const operation = (clocks.get(key) ?? Promise.resolve(0)).catch(() => 0).then(async () => {
    await SecureStore.setItemAsync(key, String(now)); persisted.set(key, now); return now;
  });
  clocks.set(key, operation); await operation;
}
