import Storage from '@/platform/storage';
import data from '../data/question-bank.json';
import { captureStudyReview, toStudyReviewPackage } from '../lib/study-review.native';
import { clearAiResultRecords, clearLearningRecords, deleteLearningRecord, getLearningRecordPage, getLearningRecords, loadLearningAiRecord, loadLearningRecordReview, resetLearningRecordStorageForTests, updatePendingLearningAiRecord, upsertLearningRecord } from '../platform/learning-record-storage.native';
import type { LearningRecord, QuestionBankDataset } from '../types';
const dataset = data[0] as QuestionBankDataset;
const category = dataset.categories[0];
const topic = category.topics[0];
const items = topic.cards.slice(0, 2).map((card) => ({ id: card.id, card, dataset, category, topic }));
const record = (id = 'history'): LearningRecord => ({
  id, sessionId: `session-${id}`, schemaVersion: 5, recordType: 'session', source: 'question-bank', bankId: dataset.id, bankTitle: dataset.title,
  categoryTitle: category.name, topicTitle: topic.name, completedCount: 1, totalCount: 2, correctCount: 0, durationSeconds: 2,
  reason: 'abort', createdAt: '2026-09-09T00:00:00.000Z', studyReview: captureStudyReview(items, {}, {}),
});
beforeEach(async () => { await Storage.clear(); resetLearningRecordStorageForTests(); jest.clearAllMocks(); });
it('stores summaries separately and loads only the selected snapshot without nested banks or recording URIs', async () => {
  const saved = record();
  saved.studyReview = captureStudyReview(items, { [items[0].id]: { visited: true, completed: true, recorded: true, note: 'not a note snapshot', updatedAt: saved.createdAt, recording: { uri: 'file:///secret.wav' } } } as never, { [items[0].id]: 'answer' });
  await upsertLearningRecord(saved);
  jest.mocked(Storage.getItem).mockClear();
  const [summary] = await getLearningRecords();
  expect(summary.studyReviewSaved).toBe(true);
  expect(summary.studyReview).toBeUndefined();
  expect(Storage.getItem).toHaveBeenCalledTimes(1);
  const loaded = await loadLearningRecordReview(summary);
  expect(loaded.studyReview?.answers[items[0].id]).toBe('answer');
  expect(JSON.stringify(loaded.studyReview)).not.toContain('file:///');
  expect(loaded.studyReview?.items[0].dataset.categories).toEqual([]);
  expect(loaded.studyReview?.items[0].topic.cards).toEqual([]);
  expect(toStudyReviewPackage(loaded)?.progressMode).toBe('persistent');
});
it('has no retention cap and pages session summaries without surfacing AI-only records', async () => {
  for (let index = 0; index < 120; index++) await upsertLearningRecord(record(String(index)));
  await upsertLearningRecord({ ...record('ai'), recordType: 'ai_result', studyReview: undefined });
  const first = await getLearningRecordPage();
  const last = await getLearningRecordPage(100);
  expect(first.records).toHaveLength(20); expect(first.hasMore).toBe(true);
  expect(last.records).toHaveLength(20); expect(last.hasMore).toBe(false);
  expect((await getLearningRecords()).filter((entry) => entry.recordType !== 'ai_result')).toHaveLength(120);
});
it('joins AI only from the same attempt and deletion blocks late session/AI resurrection', async () => {
  const saved = record(); const other = record('other');
  const ai: LearningRecord = { ...saved, id: 'ai-one', recordType: 'ai_result', studyReview: undefined,
    cardId: items[0].card.id, aiResult: { itemId: items[0].id, questionId: items[0].card.id, transcript: 'mine', analyzedTranscript: 'mine', polishedText: 'polished' } };
  await upsertLearningRecord(saved); await upsertLearningRecord(other); await upsertLearningRecord(ai);
  expect((await loadLearningRecordReview(saved)).studyFeedback?.[items[0].id]?.transcript).toBe('mine');
  expect((await loadLearningRecordReview(other)).studyFeedback).toEqual({});
  await deleteLearningRecord(saved.id);
  await upsertLearningRecord(saved); await upsertLearningRecord({ ...ai, id: 'late-ai' });
  expect((await getLearningRecords()).map((entry) => entry.id)).toEqual([other.id]);
  await expect(loadLearningRecordReview(saved)).rejects.toThrow('learning_record_deleted');
});
it('remote deletion creates a session tombstone even before the local summary arrives', async () => {
  const saved = record();
  await deleteLearningRecord(saved.id, { sessionId: saved.sessionId, recordType: 'session' });
  await upsertLearningRecord({ ...saved, id: 'late-child', recordType: 'ai_result' });
  expect(await getLearningRecords()).toEqual([]);
});
it('clearing AI keeps question snapshots and final answers, and failed atomic saves can retry', async () => {
  const saved = record(); saved.studyReview!.answers[items[0].id] = 'final answer';
  jest.mocked(Storage.multiSet).mockRejectedValueOnce(new Error('disk_full'));
  await expect(upsertLearningRecord(saved)).rejects.toThrow('disk_full');
  expect(await getLearningRecords()).toEqual([]);
  await upsertLearningRecord(saved); await upsertLearningRecord(saved);
  await upsertLearningRecord({ ...saved, id: 'ai', recordType: 'ai_result', studyReview: undefined });
  await clearAiResultRecords();
  expect(await getLearningRecords()).toHaveLength(1);
  expect((await loadLearningRecordReview(saved)).studyReview?.answers[items[0].id]).toBe('final answer');
  await clearLearningRecords(); expect(await getLearningRecords()).toEqual([]);
});

it('reads only an existing pending AI attempt and cannot recover a deleted result', async () => {
  const saved = record();
  const ai: LearningRecord = { ...saved, id: 'pending-ai', recordType: 'ai_result', studyReview: undefined,
    aiOperation: { operationId: 'op-one', environment: 'sandbox', status: 'pending' },
    aiResult: { itemId: items[0].id, questionId: items[0].card.id, transcript: 'baseline' } };
  await upsertLearningRecord(saved); await upsertLearningRecord(ai);
  expect((await getLearningRecords()).find(item => item.id === ai.id)?.aiOperation?.operationId).toBe('op-one');
  expect((await loadLearningAiRecord(ai.id))?.aiResult?.transcript).toBe('baseline');
  await deleteLearningRecord(saved.id);
  expect(await loadLearningAiRecord(ai.id)).toBeUndefined();
});

it('compares pending AI operation under the write queue so an older reply cannot overwrite a new request', async () => {
  const ai: LearningRecord = { ...record(), id: 'pending-ai', recordType: 'ai_result', studyReview: undefined,
    aiOperation: { operationId: 'old', environment: 'sandbox', status: 'pending' },
    aiResult: { itemId: items[0].id, questionId: items[0].card.id, transcript: 'baseline' } };
  await upsertLearningRecord(ai);
  const next = upsertLearningRecord({ ...ai, aiOperation: { ...ai.aiOperation!, operationId: 'new' } });
  const stale = updatePendingLearningAiRecord(ai.id, 'old', row => ({ ...row, aiResult: { ...row.aiResult!, transcript: 'stale reply' } }), () => {});
  await next;
  expect(await stale).toBeUndefined();
  const fresh = await updatePendingLearningAiRecord(ai.id, 'new', row => ({ ...row, aiOperation: { ...row.aiOperation!, status: 'complete' }, aiResult: { ...row.aiResult!, transcript: 'fresh reply' } }), () => {});
  expect(fresh?.aiResult?.transcript).toBe('fresh reply');
  expect(await updatePendingLearningAiRecord(ai.id, 'new', row => row, () => {})).toBeUndefined();
});
