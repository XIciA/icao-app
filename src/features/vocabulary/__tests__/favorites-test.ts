import {
  buildWordFavoriteItems,
  favoriteKeyForWord,
  favoriteWordFromKey,
  isWordFavorite,
  normalizeFavoriteWord,
} from '../favorites';
import type { VocabularyBook, VocabularyState } from '../types';

const updatedAt = '2026-07-23T03:00:00.000Z';

const book: VocabularyBook = {
  id: 'preview',
  level: 1,
  name: 'ICAO考前预习',
  description: '预习',
  words: [{
    id: 'preview-0001',
    bookId: 'preview',
    level: 1,
    word: 'Cross–wind',
    meaning: 'n. 侧风',
    example: 'Expect crosswind on final.',
    exampleTranslation: '预计最后进近有侧风。',
    source: { name: 'test', rowIndex: 1, sourceNo: 1 },
  }],
};

describe('unified word favorites', () => {
  it('normalizes case, spacing, apostrophes, and unicode hyphens into stable keys', () => {
    expect(normalizeFavoriteWord('  Pilotʼs   Cross–Wind ')).toBe("pilot's cross-wind");
    expect(favoriteKeyForWord('Pilot’s Cross–Wind')).toBe(favoriteKeyForWord("pilot's cross-wind"));
    expect(favoriteWordFromKey(favoriteKeyForWord('Deviation')!)).toBe('deviation');
  });

  it('prefers the canonical favorite record while preserving legacy fallback', () => {
    const legacy: VocabularyState = {
      schemaVersion: 1,
      words: { 'preview-0001': { status: 'known', favorite: true, updatedAt } },
      updatedAt,
    };
    expect(isWordFavorite({ word: 'Cross-wind', wordId: 'preview-0001' }, legacy)).toBe(true);

    const canonicalFalse: VocabularyState = {
      ...legacy,
      words: {
        ...legacy.words,
        [favoriteKeyForWord('Cross-wind')!]: { status: 'new', favorite: false, updatedAt: '2026-07-23T04:00:00.000Z' },
      },
    };
    expect(isWordFavorite({ word: 'Cross-wind', wordId: 'preview-0001' }, canonicalFalse)).toBe(false);
  });

  it('merges a word present in vocabulary and lookup into one newest-first item', () => {
    const state: VocabularyState = {
      schemaVersion: 1,
      words: {
        [favoriteKeyForWord('Cross-wind')!]: { status: 'new', favorite: true, updatedAt },
        [favoriteKeyForWord('deviation')!]: { status: 'new', favorite: true, updatedAt: '2026-07-23T05:00:00.000Z' },
      },
      updatedAt: '2026-07-23T05:00:00.000Z',
    };
    const items = buildWordFavoriteItems({
      books: [book],
      lookupEntries: [
        { word: 'cross-wind', ipa: '/ˈkrɔːsˌwɪnd/', aviationMeaning: 'n. 侧风', generalMeaning: 'n. 横风' },
        { word: 'deviation', ipa: '/ˌdiːviˈeɪʃən/', aviationMeaning: 'n. 航向偏离', generalMeaning: 'n. 偏差' },
      ],
      state,
    });

    expect(items.map((item) => item.word)).toEqual(['deviation', 'Cross–wind']);
    expect(items[1]).toMatchObject({
      sources: ['vocabulary', 'lookup'],
      bookNames: ['ICAO考前预习'],
      meaning: 'n. 侧风',
    });
  });
});
