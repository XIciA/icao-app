import type { VocabularyState, VocabularyWord } from './types';

export type VocabularyStudyOrder = 'frequency' | 'random';
export const VOCABULARY_ORDER_KEY = 'icao.vocabulary.v1.study-order';

/** Sort each existing learning-state group; never move learned words ahead of new words. */
export function orderVocabularySession(words: VocabularyWord[], state: VocabularyState, order: VocabularyStudyOrder, random = Math.random) {
  const unique = [...new Map(words.map(word => [word.id, word])).values()];
  const sort = (items: VocabularyWord[]) => {
    if (order === 'frequency') return items.sort((a, b) => (b.frequency?.occurrences ?? 0) - (a.frequency?.occurrences ?? 0));
    for (let i = items.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [items[i], items[j]] = [items[j]!, items[i]!];
    }
    return items;
  };
  return [
    ...sort(unique.filter(word => (state.words[word.id]?.status ?? 'new') === 'new')),
    ...sort(unique.filter(word => (state.words[word.id]?.status ?? 'new') !== 'new')),
  ];
}
