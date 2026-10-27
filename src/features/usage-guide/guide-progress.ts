import type { GuideCheckpoint } from './GuideBindings';
import { GUIDE_FLOWS, type GuideId } from './guide-flows';
import Storage from '@/platform/storage';

/** A single account-scoped owner for both manual and automatic teaching. */
export type GuideResume = { module: GuideId; remaining: string[]; done: string[]; checkpoint?: GuideCheckpoint };
export type GuideProgress = { version: 3; testNewUser?: boolean; completed: string[]; skipped: string[]; skippedSteps?: string[]; definition?: 1; resumes?: Record<string, GuideResume> };
export const emptyGuideProgress = (): GuideProgress => ({ version: 3, completed: [], skipped: [] });
function parseResume(candidate: unknown): GuideResume | undefined {
  if (!candidate || typeof candidate !== 'object') return;
  const legacy = candidate as GuideResume & { records?: boolean };
  const value: GuideResume = { ...legacy, module: legacy.module === 'recap' && legacy.records ? 'records' : legacy.module };
  if (!Object.prototype.hasOwnProperty.call(GUIDE_FLOWS, value.module)) return;
  const ids = new Set((GUIDE_FLOWS[value.module] ?? []).map(step => step.id));
  if (value.module === 'study') ids.add('study-open');
  if (!Array.isArray(value.remaining) || !value.remaining.length || !value.remaining.every(id => typeof id === 'string' && ids.has(id)) || !Array.isArray(value.done) || !value.done.every(id => typeof id === 'string' && ids.has(id))) return;
  const raw = value.checkpoint;
  const checkpoint: GuideCheckpoint | undefined = raw && typeof raw === 'object' ? {
    ...(Array.isArray(raw.vocabBooks) && raw.vocabBooks.every(id => typeof id === 'string') ? { vocabBooks: raw.vocabBooks.slice(0, 20) } : {}),
    ...(typeof raw.vocabWord === 'string' ? { vocabWord: raw.vocabWord } : {}),
  } : undefined;
  return { module: value.module, remaining: [...new Set(value.remaining)], done: [...new Set(value.done)], checkpoint };
}
export function parseGuideProgress(raw: string | null): GuideProgress {
  try {
    const value = JSON.parse(raw ?? 'null');
    if (value?.version !== 3) return emptyGuideProgress();
    const resumes: Record<string, GuideResume> = {};
    if (value.definition === 1 && value.resumes && typeof value.resumes === 'object') {
      for (const [key, candidate] of Object.entries(value.resumes)) {
        const parsed = parseResume(candidate);
        if (parsed && key === parsed.module) resumes[key] = parsed;
      }
    }
    const strings = (items: unknown): string[] => Array.isArray(items) ? [...new Set(items.filter((id): id is string => typeof id === 'string'))] : [];
    if (Array.isArray(value.completed) && value.completed.some((id: unknown) => typeof id === 'string' && id.startsWith('export-')) && !value.completed.includes('export-open')) value.completed.push('export-open');
    return { version: 3, ...(value.testNewUser === true ? { testNewUser: true } : {}), ...(Object.keys(resumes).length ? { definition: 1, resumes } : {}), completed: strings(value.completed), skippedSteps: strings(value.skippedSteps), skipped: strings(value.skipped) };
  } catch { return emptyGuideProgress(); }
}
let writes = Promise.resolve();
export async function readGuideProgress(account: string) {
  await writes;
  return parseGuideProgress(await Storage.getItem(`icao.guide.v3.${account}`));
}
export function writeGuideProgress(account: string, value: GuideProgress) {
  const snapshot = JSON.stringify({ ...value, definition: 1 });
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
  return progress.skipped.includes(module) ? [] : ids.filter(id => !progress.completed.includes(id) && !progress.skippedSteps?.includes(id));
}
