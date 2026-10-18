import Storage from '@/platform/storage';
import { parseTutorialProgress, tutorialProgressKey, type TutorialProgress } from './tutorial-model';
// Serialize tutorial metadata, without touching any learning data or its owners.
let writes = Promise.resolve();
export async function readTutorialProgress(accountId: string) {
  await writes;
  return parseTutorialProgress(await Storage.getItem(tutorialProgressKey(accountId)));
}
export function writeTutorialProgress(accountId: string, progress: TutorialProgress) {
  const snapshot = JSON.stringify(progress);
  const next = writes.catch(() => undefined).then(() => Storage.setItem(tutorialProgressKey(accountId), snapshot));
  writes = next.catch(() => undefined);
  return next;
}
