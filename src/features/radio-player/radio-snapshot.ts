import { clampRadioInterval } from './native-queue';

export function migrateRadioIntervalSeconds(snapshot: unknown) {
  if (!snapshot || typeof snapshot !== 'object' || !('intervalSeconds' in snapshot)) return 0;
  const value = snapshot.intervalSeconds;
  return typeof value === 'number' ? clampRadioInterval(value) : 0;
}
