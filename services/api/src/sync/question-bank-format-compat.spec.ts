import { describe, expect, it } from 'vitest';
import { rebaseFormattedAnnotations } from './question-bank-format-compat';
import { formatRevisions } from './question-bank-format-revisions';

describe('formatting compatibility', () => {
  it('preserves all notes, tags, highlight counts, contexts and unknown revisions', () => {
    for (const [key, revision] of Object.entries(formatRevisions)) {
      const [bankId, categoryId, topicId, cardId, blockId, contentFingerprint] = key.split(':');
      const run = revision.runs[0];
      if (!run) continue;
      const highlight = { blockId, contentFingerprint, wordIndex: run[0], colorId: 'green', quote: 'original quote', sentence: 'original context' };
      const unknown = { ...highlight, contentFingerprint: 'unknown-revision' };
      const document = { version: 2, entries: { entry: { bankId, categoryId, topicId, cardId, note: 'my notes', tagIds: ['good'], highlights: [highlight, unknown] } } };
      const actual = rebaseFormattedAnnotations(document) as typeof document;
      expect(actual.entries.entry.note).toBe('my notes');
      expect(actual.entries.entry.tagIds).toEqual(['good']);
      expect(actual.entries.entry.highlights).toHaveLength(2);
      expect(actual.entries.entry.highlights[0]).toEqual({ ...highlight, wordIndex: run[1], contentFingerprint: revision.fingerprint });
      expect(actual.entries.entry.highlights[1]).toEqual(unknown);
      expect(rebaseFormattedAnnotations(actual)).toEqual(actual);
      expect(document.entries.entry.highlights[0]).toEqual(highlight);
    }
  });
});
