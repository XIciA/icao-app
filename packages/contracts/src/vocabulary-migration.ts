import { vocabularyRetiredFavoriteKeys, vocabularyRetiredIds, vocabularyTestWordUpdates, vocabularyLegacyIds, vocabularyLegacyFavorites } from './vocabulary-migration-data.ts';

type Progress = { status: 'new' | 'known' | 'vague' | 'forgot' | 'wrong'; favorite: boolean; updatedAt: string };
type Document = { words: Record<string, Progress>; lastTest?: { answers: unknown[] }; updatedAt: string };
const rank: Record<Progress['status'], number> = { new: -1, known: 0, vague: 2, forgot: 3, wrong: 4 };

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
  // Deleted/split cards invalidate the snapshot. Merged cards retain their historical score and dates.
  if (lastTest?.answers.some(answer => answer && typeof answer === 'object' && 'wordId' in answer && vocabularyRetiredIds[String(answer.wordId)] === null)) {
    lastTest = undefined; changed = true;
  } else if (lastTest) {
    const answers = lastTest.answers.map(answer => {
      if (!answer || typeof answer !== 'object' || !('wordId' in answer)) return answer;
      const target = vocabularyRetiredIds[String(answer.wordId)];
      const text = vocabularyTestWordUpdates[String(answer.wordId)];
      if (!target && (!text || ('word' in answer && answer.word === text.word && 'meaning' in answer && answer.meaning === text.meaning))) return answer;
      changed = true;
      return { ...answer, ...(target ? {wordId:target} : {}), ...text };
    });
    if (changed) lastTest = { ...lastTest, answers };
  }
  if (!changed) return document;
  const result = { ...document, words };
  if (lastTest) result.lastTest = lastTest;
  else delete result.lastTest;
  return result;
}

/** Response adapter only: storage and merges always use the canonical document. */
export function vocabularyDocumentForLegacyClient<T extends Document>(value: T): T {
  const canonical = migrateVocabularyDocument(value);
  const words: Record<string, Progress> = {};
  for (const [key, progress] of Object.entries(canonical.words)) {
    const aliases = key.startsWith('__word_favorite__:v1:') ? vocabularyLegacyFavorites[key] : vocabularyLegacyIds[key];
    if (aliases) {
      for (const alias of aliases) words[alias] = progress;
    } else if (!key.startsWith('v3-')) {
      // Unknown independent lookup favorites and unrelated historical data are not deleted.
      words[key] = progress;
    }
  }
  const legacyTestSupported = !canonical.lastTest?.answers.some(answer => answer && typeof answer === 'object' && 'wordId' in answer && String(answer.wordId).startsWith('v3-') && !vocabularyLegacyIds[String(answer.wordId)]);
  const lastTest = legacyTestSupported && canonical.lastTest ? {
    ...canonical.lastTest,
    answers: canonical.lastTest.answers.map(answer => {
      if (!answer || typeof answer !== 'object' || !('wordId' in answer)) return answer;
      const id=String(answer.wordId), aliases=vocabularyLegacyIds[id];
      return aliases ? { ...answer, wordId:aliases.includes(id) ? id : aliases[0] } : answer;
    }),
  } : undefined;
  const result={ ...canonical, words };
  if (lastTest) result.lastTest=lastTest;
  else delete result.lastTest;
  return result;
}
