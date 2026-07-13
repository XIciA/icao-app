import { describe, expect, it } from 'vitest';

import { mergeVocabularyDocuments, vocabularyDocumentSchema } from './vocabulary-document';

describe('vocabulary document merge', () => {
  it('keeps the newest state per word and newest test result', () => {
    const merged = mergeVocabularyDocuments(
      {
        schemaVersion: 1,
        words: {
          one: { status: 'known', favorite: false, updatedAt: '2026-07-13T01:00:00.000Z' },
          two: { status: 'vague', favorite: true, updatedAt: '2026-07-13T03:00:00.000Z' },
        },
        lastTest: { schemaVersion: 1, completedAt: '2026-07-13T02:00:00.000Z', total: 30, correct: 20, answers: [] },
        updatedAt: '2026-07-13T03:00:00.000Z',
      },
      {
        schemaVersion: 1,
        words: {
          one: { status: 'wrong', favorite: true, updatedAt: '2026-07-13T04:00:00.000Z' },
          two: { status: 'forgot', favorite: false, updatedAt: '2026-07-13T02:00:00.000Z' },
        },
        lastTest: { schemaVersion: 1, completedAt: '2026-07-13T05:00:00.000Z', total: 30, correct: 25, answers: [] },
        updatedAt: '2026-07-13T05:00:00.000Z',
      },
    );
    expect(merged.words.one).toMatchObject({ status: 'wrong', favorite: true });
    expect(merged.words.two).toMatchObject({ status: 'vague', favorite: true });
    expect(merged.lastTest?.correct).toBe(25);
    expect(merged.updatedAt).toBe('2026-07-13T05:00:00.000Z');
  });

  it('rejects malformed vocabulary documents', () => {
    expect(vocabularyDocumentSchema.safeParse({ schemaVersion: 1, words: {}, updatedAt: 'invalid' }).success).toBe(false);
  });
});
