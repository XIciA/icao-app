import { expect, it } from 'vitest';
import { emptyRetiredState, isRetiredCard, sanitizeRetiredAnnotations, sanitizeRetiredLearningRecord, sanitizeRetiredSyncPayload } from './retired-learning';
const gone = { id: 'gone', dataset: { id: 'listening' }, card: { id: 'listening-main-1010', correctChoiceIndex: 0 } };
const kept = { id: 'kept', dataset: { id: 'listening' }, card: { id: 'listening-main-187', correctChoiceIndex: 3 } };
const review = { items: [gone, kept], states: { gone: { selectedChoiceIndex: 0, completed: true, visited: true }, kept: { selectedChoiceIndex: 3, completed: true, visited: true } }, answers: { gone: 'private', kept: 'good' } };
it('retirement is scoped to the bank and never removes the representative', () => {
  expect(isRetiredCard('listening', 'listening-main-1010')).toBe(true);
  expect(isRetiredCard('opi', 'listening-main-1010')).toBe(false);
  expect(isRetiredCard('listening', 'listening-main-187')).toBe(false);
});
it('cleans mixed study snapshots and recomputes counts without changing originals', () => {
  const clean = sanitizeRetiredLearningRecord({ recordType: 'session', studyReview: review, totalCount: 2, durationSeconds: 99, noteCount: 1 });
  expect(clean).toMatchObject({ totalCount: 1, completedCount: 1, answeredCount: 1, correctCount: 1, durationSeconds: 99, studyReview: { items: [kept], states: { kept: review.states.kept }, answers: { kept: 'good' } } });
  expect(clean.noteCount).toBeUndefined(); expect(review.items).toHaveLength(2);
  expect(sanitizeRetiredLearningRecord(clean)).toEqual(clean);
});
it('retains history metadata without retired question snapshots', () => {
  expect(sanitizeRetiredLearningRecord({ recordType: 'mock_exam', sessionId: 'x', studyReview: review, mockExam: { score: 100 } })).toEqual({ sourceUnavailable: true, recordType: 'mock_exam', sessionId: 'x' });
  expect(sanitizeRetiredLearningRecord({ recordType: 'session', studyReview: { ...review, items: [gone] } }).sourceUnavailable).toBe(true);
});
it('keeps unrelated exam and old history with no evidence of a removed card', () => {
  const value = { recordType: 'mock_exam', studyReview: { ...review, items: [kept] } };
  expect(sanitizeRetiredLearningRecord(value)).toBe(value);
  expect(sanitizeRetiredLearningRecord({ bankId: 'listening', totalCount: 20 })).toEqual({ bankId: 'listening', totalCount: 20 });
});
it('cleans annotations and old mutation responses without deleting shared tag definitions', () => {
  const doc = { tagDefinitions: [{ id: 't' }], entries: { gone: { bankId: 'listening', cardId: 'listening-main-1010', note: 'secret' }, kept: { bankId: 'listening', cardId: 'listening-main-187', note: 'keep' } } };
  expect(sanitizeRetiredAnnotations(doc)).toMatchObject({ entries: { kept: doc.entries.kept }, recoveredNotes: [{ note: 'secret', reason: 'retired' }] });
  expect(Object.keys(sanitizeRetiredAnnotations(doc).entries as object)).toEqual(['kept']);
  expect(sanitizeRetiredAnnotations(sanitizeRetiredAnnotations(doc))).toEqual(sanitizeRetiredAnnotations(doc));
  expect(sanitizeRetiredSyncPayload('card_state', { bankId: 'listening', cardId: 'listening-main-1010', state: { completed: true, note: 'secret' }, updatedAt: 'date', version: 999 })).toMatchObject({ version: 999, state: emptyRetiredState('date') });
  expect(sanitizeRetiredSyncPayload('learning_record', { recordId: 'exam', record: { recordType: 'mock_exam', studyReview: review } })).toMatchObject({ record: { sourceUnavailable: true } });
});
it('leaves existing unrelated deletion markers unchanged', () => {
  const value = { deleted: true, recordType: 'session', sessionId: 'unrelated', reason: 'user_deleted' };
  expect(sanitizeRetiredLearningRecord(value)).toBe(value);
});
