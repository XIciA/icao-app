import Storage from '@/platform/storage';

/** A single account-scoped owner for both manual and automatic teaching. */
export type GuideProgress = { version: 3; completed: string[]; skipped: string[] };
export const emptyGuideProgress = (): GuideProgress => ({ version: 3, completed: [], skipped: [] });
export function parseGuideProgress(raw: string | null): GuideProgress {
  try {
    const value = JSON.parse(raw ?? 'null');
    if (value?.version !== 3) return emptyGuideProgress();
    return { version: 3, completed: Array.isArray(value.completed) ? value.completed.filter((id: unknown): id is string => typeof id === 'string') : [], skipped: Array.isArray(value.skipped) ? value.skipped.filter((id: unknown): id is string => typeof id === 'string') : [] };
  } catch { return emptyGuideProgress(); }
}
let writes = Promise.resolve();
export async function readGuideProgress(account: string) {
  await writes;
  return parseGuideProgress(await Storage.getItem(`icao.guide.v3.${account}`));
}
export function writeGuideProgress(account: string, value: GuideProgress) {
  const snapshot = JSON.stringify(value);
  const next = writes.catch(() => undefined).then(() => Storage.setItem(`icao.guide.v3.${account}`, snapshot));
  writes = next.catch(() => undefined);
  return next;
}
// Business-account creation time, never identity creation time or an empty local store.
export const ONBOARDING_COHORT_START = '2026-10-22T08:00:00.000Z';
export function eligibleForAutomaticGuide(createdAt?: string) {
  return !!createdAt && Number.isFinite(Date.parse(createdAt)) && Date.parse(createdAt) >= Date.parse(ONBOARDING_COHORT_START);
}
export function remainingGuideSteps(ids: string[], progress: GuideProgress, module: string) {
  return progress.skipped.includes(module) ? [] : ids.filter(id => !progress.completed.includes(id));
}
