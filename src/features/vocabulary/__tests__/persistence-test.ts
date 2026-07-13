import { hasVocabularyData, normalizeVocabularyState } from '../persistence';

describe('vocabulary state persistence', () => {
  it('keeps valid per-word progress and drops malformed records', () => {
    const state = normalizeVocabularyState({
      schemaVersion: 7,
      updatedAt: '2026-07-13T00:00:00.000Z',
      words: {
        valid: { status: 'known', favorite: true, updatedAt: '2026-07-13T00:00:00.000Z' },
        invalid: { status: 'maybe', favorite: true },
      },
    });
    expect(state).toEqual({
      schemaVersion: 1,
      updatedAt: '2026-07-13T00:00:00.000Z',
      words: { valid: { status: 'known', favorite: true, updatedAt: '2026-07-13T00:00:00.000Z' } },
    });
    expect(hasVocabularyData(state)).toBe(true);
  });

  it('returns an empty compatible state for corrupted input', () => {
    const state = normalizeVocabularyState(null);
    expect(state.schemaVersion).toBe(1);
    expect(state.words).toEqual({});
    expect(hasVocabularyData(state)).toBe(false);
  });
});
