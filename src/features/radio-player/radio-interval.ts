export const RADIO_INTERVAL_MAX_SECONDS = 30;
export const RADIO_INTERVAL_PRESETS = [0, 3, 5, 10, 15, 30] as const;

export function clampRadioInterval(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(RADIO_INTERVAL_MAX_SECONDS, Math.round(value)));
}
