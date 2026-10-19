import type { GuideCheckpoint } from './GuideBindings';
import Storage from '@/platform/storage';
import { GUIDE_FLOWS, type GuideId } from './guide-flows';
export type GuideProgress = { index: number; path: string; checkpoint?: GuideCheckpoint };
let writes = Promise.resolve();
const key = (account: string, id: GuideId) => `icao.guide.v2.${account}.${id}`;
export async function readGuideProgress(account: string, id: GuideId): Promise<GuideProgress | undefined> {
  await writes;
  try { const value = JSON.parse(await Storage.getItem(key(account, id)) ?? 'null');
    if (Number.isInteger(value?.index) && value.index >= 0 && value.index <= (GUIDE_FLOWS[id]?.length ?? 0) && typeof value.path === 'string' && /^\/(content|annotations|learning-records|question-bank|info)\b/u.test(value.path)) return { index: value.index, path: value.path, checkpoint: value.checkpoint && typeof value.checkpoint === 'object' ? {
      ...(Array.isArray(value.checkpoint.vocabBooks) && value.checkpoint.vocabBooks.every((id: unknown) => typeof id === 'string') ? { vocabBooks: value.checkpoint.vocabBooks.slice(0, 20) } : {}),
      ...(typeof value.checkpoint.vocabWord === 'string' ? { vocabWord: value.checkpoint.vocabWord } : {}),
      ...(typeof value.checkpoint.recapEmpty === 'boolean' ? { recapEmpty: value.checkpoint.recapEmpty } : {}),
    } : undefined };
  } catch { /* Invalid metadata never affects learning data. */ }
  return undefined;
}
export function writeGuideProgress(account: string, id: GuideId, value: GuideProgress) {
  const next = writes.catch(() => undefined).then(() => Storage.setItem(key(account, id), JSON.stringify(value)));
  writes = next.catch(() => undefined); return next;
}
