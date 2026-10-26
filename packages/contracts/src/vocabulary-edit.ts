import type { VocabularyWord } from './index.ts';
import { validateVocabularyLiveContent, validateVocabularyPolicyTransition, vocabularyLivePayload, vocabularyFavoriteKey, vocabularyTerms, type VocabularyLiveContent } from './vocabulary-live.ts';

export type VocabularyEdit =
  | { type: 'upsert'; word: VocabularyWord }
  | { type: 'delete'; id: string }
  | { type: 'merge'; sourceIds: string[]; targetId: string }
  | { type: 'split'; id: string; words: VocabularyWord[] };

/** Pure publication planner used by the admin API, imports and deterministic tests. */
export function applyVocabularyEdits(previous: VocabularyLiveContent, edits: VocabularyEdit[], version = previous.version + 1): VocabularyLiveContent {
  const next = JSON.parse(JSON.stringify(vocabularyLivePayload(previous))) as VocabularyLiveContent;
  next.version = version; next.dataset.version = version; next.policy.version = version;
  const words = new Map(next.dataset.books.flatMap(book => book.words.map(word => [word.id, word] as const)));
  const get = (id: string) => { const word = words.get(id); if (!word) throw new Error(`vocabulary_word_missing:${id}`); return word; };
  const alias = (word: VocabularyWord, target: string | null) => {
    for (const key of [word.word, ...vocabularyTerms(word)].map(vocabularyFavoriteKey)) {
      // Tombstones are permanent. A later new word with the same text gets its own ID.
      if (!Object.hasOwn(next.policy.retiredFavoriteKeys, key)) next.policy.retiredFavoriteKeys[key] = target;
    }
  };
  const add = (word: VocabularyWord) => {
    if (Object.hasOwn(next.policy.retiredIds, word.id)) throw new Error('vocabulary_retired_id_cannot_be_reused');
    if (!next.dataset.books.some(book => book.id === word.bookId)) throw new Error('invalid_vocabulary_book');
    const old = words.get(word.id); if (old) alias(old, word.id);
    words.set(word.id, { ...word, ...(word.frequency ? {} : old?.frequency ? {frequency:old.frequency} : {}), level: next.dataset.books.find(book => book.id === word.bookId)!.level });
    alias(word, word.id);
  };
  const remove = (id: string, target: string | null) => {
    const word = get(id); alias(word, target); next.policy.retiredIds[id] = target; words.delete(id);
  };
  for (const edit of edits) {
    if (edit.type === 'upsert') add(edit.word);
    else if (edit.type === 'delete') remove(edit.id, null);
    else if (edit.type === 'merge') {
      get(edit.targetId);
      if (!edit.sourceIds.length) throw new Error('vocabulary_merge_sources_missing');
      for (const id of new Set(edit.sourceIds)) if (id !== edit.targetId) remove(id, edit.targetId);
    } else {
      if (edit.words.length < 2 || edit.words.some(word => words.has(word.id))) throw new Error('invalid_vocabulary_split');
      remove(edit.id, null); for (const word of edit.words) add(word);
    }
  }
  const terminal = (target: string | null): string | null => {
    const visited = new Set<string>();
    while (target !== null && !words.has(target)) {
      if (visited.has(target) || !Object.hasOwn(next.policy.retiredIds, target)) throw new Error('invalid_vocabulary_retirement_chain');
      visited.add(target); target = next.policy.retiredIds[target]!;
    }
    return target;
  };
  for (const [key, target] of Object.entries(next.policy.retiredIds)) next.policy.retiredIds[key] = terminal(target);
  for (const [key, target] of Object.entries(next.policy.retiredFavoriteKeys)) next.policy.retiredFavoriteKeys[key] = terminal(target);
  next.policy.testWords = Object.fromEntries([...words.values()].map(word => [word.id, { word: word.word, meaning: word.meaning }]));
  next.dataset.books = next.dataset.books.map(book => ({ ...book, words: [...words.values()].filter(word => word.bookId === book.id) }));
  next.dataset.source = { ...next.dataset.source, sourceRows: words.size, validRows: words.size, ignoredRows: 0, invalidRows: 0 };
  validateVocabularyLiveContent(next);
  return validateVocabularyPolicyTransition(previous, next);
}
