/* eslint-disable import/first */
import type { VocabularyBook, VocabularyState } from '../types';

let mockState: VocabularyState;
const mockWriteState = jest.fn(async (state: VocabularyState) => {
  mockState = state;
  return state;
});
const mockEnqueueVocabulary = jest.fn(async (_state: VocabularyState) => undefined);

jest.mock('../persistence', () => ({
  createEmptyVocabularyState: () => ({ schemaVersion: 1, words: {}, updatedAt: new Date(0).toISOString() }),
  readVocabularyState: async () => mockState,
  subscribeVocabularyState: () => jest.fn(),
  writeVocabularyState: (state: VocabularyState) => mockWriteState(state),
}));
jest.mock('@/features/sync/learning-sync', () => ({
  enqueueVocabularyDocument: (state: VocabularyState) => mockEnqueueVocabulary(state),
}));

import { favoriteKeyForWord } from '../favorites';
import {
  migrateLegacyVocabularyFavorites,
  resetVocabularyMutationQueueForTests,
  toggleWordFavorite,
} from '../progress-store';

const book: VocabularyBook = {
  id: 'preview',
  level: 1,
  name: 'ICAO考前预习',
  description: '预习',
  words: [{
    id: 'preview-0001',
    bookId: 'preview',
    level: 1,
    word: 'deviation',
    meaning: 'n. 偏离',
    example: 'Report any deviation.',
    exampleTranslation: '报告任何偏离。',
    source: { name: 'test', rowIndex: 1, sourceNo: 1 },
  }],
};

describe('vocabulary favorite mutation compatibility', () => {
  beforeEach(() => {
    mockWriteState.mockClear();
    mockEnqueueVocabulary.mockClear();
    resetVocabularyMutationQueueForTests();
    mockState = {
      schemaVersion: 1,
      words: {
        'preview-0001': { status: 'known', favorite: true, updatedAt: '2026-07-23T03:00:00.000Z' },
      },
      updatedAt: '2026-07-23T03:00:00.000Z',
    };
  });

  it('migrates a legacy word-id favorite once and keeps the existing schema', async () => {
    await migrateLegacyVocabularyFavorites([book]);
    const key = favoriteKeyForWord('deviation')!;

    expect(mockState.schemaVersion).toBe(1);
    expect(mockState.words[key]).toMatchObject({ status: 'new', favorite: true });
    expect(mockState.updatedAt).not.toBe('2026-07-23T03:00:00.000Z');
    expect(mockEnqueueVocabulary).toHaveBeenCalledWith(expect.objectContaining({ updatedAt: mockState.updatedAt }));
    expect(mockEnqueueVocabulary).toHaveBeenCalledTimes(1);

    await migrateLegacyVocabularyFavorites([book]);
    expect(mockWriteState).toHaveBeenCalledTimes(1);
  });

  it('cancels the canonical and compatibility favorite together', async () => {
    await migrateLegacyVocabularyFavorites([book]);
    await toggleWordFavorite({ word: 'deviation', wordId: 'preview-0001' });
    const key = favoriteKeyForWord('deviation')!;

    expect(mockState.words[key]?.favorite).toBe(false);
    expect(mockState.words['preview-0001']?.favorite).toBe(false);
  });
});
