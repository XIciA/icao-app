import { vocabularyRetiredFavoriteKeys, vocabularyRetiredIds } from './vocabulary-migration-data';

type Progress = { status: 'new' | 'known' | 'vague' | 'forgot' | 'wrong'; favorite: boolean; updatedAt: string };
type Document = { words: Record<string, Progress>; lastTest?: { answers: unknown[] }; updatedAt: string };
const rank: Record<Progress['status'], number> = { known: 0, new: 1, vague: 2, forgot: 3, wrong: 4 };

/** Only explicitly retired resource IDs/keys are touched. Unrelated lookup favorites survive. */
export function migrateVocabularyDocument<T extends Document>(document: T): T {
  let changed = false;
  const words = { ...document.words };
  for (const mapping of [vocabularyRetiredIds, vocabularyRetiredFavoriteKeys]) {
    const groups = new Map<string, Progress[]>();
    for (const [oldKey, target] of Object.entries(mapping)) {
      const old = words[oldKey];
      if (!old) continue;
      delete words[oldKey]; changed = true;
      if (target) groups.set(target, [...(groups.get(target) ?? []), old]);
    }
    for (const [target, values] of groups) {
      const current = words[target];
      const latest = values.reduce((a,b) => Date.parse(a.updatedAt) > Date.parse(b.updatedAt) ? a : b);
      // Later edits of the surviving card win over stale copies from another device.
      if (current && Date.parse(current.updatedAt) > Date.parse(latest.updatedAt)) continue;
      const combined = current ? [current, ...values] : values;
      const status = combined.reduce((a,b) => rank[a.status] >= rank[b.status] ? a : b).status;
      words[target] = { status, favorite: combined.some(p => p.favorite), updatedAt: latest.updatedAt };
    }
  }
  let lastTest = document.lastTest;
  // A test is an internally consistent snapshot: discard it if it references any changed/retired card.
  // Keep untouched historical tests, scores and dates verbatim.
  if (lastTest?.answers.some(answer => answer && typeof answer === 'object' && 'wordId' in answer && Object.hasOwn(vocabularyRetiredIds, String(answer.wordId)))) {
    lastTest = undefined; changed = true;
  }
  if (!changed) return document;
  const result = { ...document, words };
  if (lastTest) result.lastTest = lastTest;
  else delete result.lastTest;
  return result;
}
