import Storage from '@/platform/storage';
import type { LearningRecord } from '../types';
import { captureStudyReview, getStudyReview } from '../lib/study-review.native';

export const LEARNING_RECORDS_KEY = 'icao.learning.v1.records';
const aiDetailKey = (id: string) => `${LEARNING_RECORDS_KEY}.ai.${id}`;
const detailKey = (id: string) => `${LEARNING_RECORDS_KEY}.review.${id}`;
const deletedKey = (id: string) => `${LEARNING_RECORDS_KEY}.deleted.${id}`;
const deletedSessionKey = (id: string) => `${LEARNING_RECORDS_KEY}.deleted-session.${id}`;
let writeQueue = Promise.resolve();
const listeners = new Set<() => void>();

export function subscribeLearningRecords(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function queued<T>(operation: () => Promise<T>): Promise<T> {
  const result = writeQueue.catch(() => undefined).then(operation).then((value) => {
    for (const listener of listeners) { try { listener(); } catch { /* Observers cannot prevent a saved record. */ } }
    return value;
  });
  writeQueue = result.then(() => undefined, () => undefined);
  return result;
}

async function readSummaries(): Promise<LearningRecord[]> {
  const raw = await Storage.getItem(LEARNING_RECORDS_KEY);
  if (!raw) return [];
  const records = JSON.parse(raw) as unknown;
  if (!Array.isArray(records)) throw new Error('learning_records_invalid');
  return records as LearningRecord[];
}

async function withDetail(record: LearningRecord): Promise<LearningRecord> {
  let result = record;
  if (record.studyReviewSaved) {
    const raw = await Storage.getItem(detailKey(record.id));
    if (!raw) throw new Error('study_review_missing');
    result = { ...result, studyReview: JSON.parse(raw) } as LearningRecord;
    if (!getStudyReview(result)) throw new Error('study_review_invalid');
  }
  if (record.aiResultSaved) {
    const raw = await Storage.getItem(aiDetailKey(record.id));
    if (!raw) throw new Error('study_feedback_missing');
    result = { ...result, aiResult: JSON.parse(raw) } as LearningRecord;
  }
  return result;
}

export async function getLearningRecords(options: { includeDetails?: boolean } = {}) {
  await writeQueue;
  const records = await readSummaries();
  return options.includeDetails ? Promise.all(records.map(withDetail)) : records;
}

export async function getLearningRecordPage(offset = 0, limit = 20) {
  const records = (await getLearningRecords()).filter((record) => record.recordType !== 'ai_result');
  const start = Math.max(0, offset);
  const count = Math.max(1, Math.floor(limit));
  return { records: records.slice(start, start + count), hasMore: start + count < records.length };
}

export async function loadLearningRecordReview(record: LearningRecord): Promise<LearningRecord> {
  await writeQueue;
  if (await Storage.getItem(deletedKey(record.id))) throw new Error('learning_record_deleted');
  const records = await readSummaries();
  const current = records.find((candidate) => candidate.id === record.id);
  if (!current) throw new Error('learning_record_missing');
  const saved = await withDetail(current);
  const review = getStudyReview(saved);
  if (!review) throw new Error('study_review_missing');
  const studyFeedback: NonNullable<LearningRecord['studyFeedback']> = {};
  for (const result of records) {
    if (result.recordType !== 'ai_result' || result.sessionId !== current.sessionId) continue;
    const { aiResult } = await withDetail(result);
    if (!aiResult) continue;
    const item = review.items.find((entry) => aiResult.itemId
      ? entry.id === aiResult.itemId : entry.card.id === result.cardId);
    if (item) studyFeedback[item.id] = aiResult;
  }
  return { ...saved, studyFeedback };
}

/** Recovery reads only its existing attempt row; a deleted result cannot become a new row. */
export async function loadLearningAiRecord(recordId: string): Promise<LearningRecord | undefined> {
  await writeQueue;
  if (await Storage.getItem(deletedKey(recordId))) return undefined;
  const record = (await readSummaries()).find(item => item.id === recordId && item.recordType === 'ai_result');
  if (!record || (record.sessionId && await Storage.getItem(deletedSessionKey(record.sessionId)))) return undefined;
  return withDetail(record);
}

async function writeLearningRecord(record: LearningRecord, assertCurrent: () => void): Promise<boolean> {
  assertCurrent();
  if (await Storage.getItem(deletedKey(record.id))
    || (record.sessionId && await Storage.getItem(deletedSessionKey(record.sessionId)))) return false;
  const records = await readSummaries();
  if (record.sourceUnavailable) {
    await Storage.multiRemove([detailKey(record.id), aiDetailKey(record.id)]);
    assertCurrent();
  }
  // Feedback is derived from separately owned per-attempt AI data on read.
  const { studyFeedback: _feedback, ...clean } = record;
  const review = clean.studyReview
    ? captureStudyReview(clean.studyReview.items, clean.studyReview.states, clean.studyReview.answers) : undefined;
  if (clean.studyReview && !getStudyReview({ ...clean, studyReview: review })) throw new Error('study_review_invalid');
  const summary: LearningRecord = { ...clean, studyReview: undefined, aiResult: undefined, ...(review ? { studyReviewSaved: true } : {}), ...(clean.aiResult ? { aiResultSaved: true } : {}) };
  const next = [summary, ...records.filter((item) => item.id !== record.id)]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  assertCurrent();
  // expo-sqlite's multiSet commits the detail and index in one transaction.
  await Storage.multiSet([
    ...(review ? [[detailKey(record.id), JSON.stringify(review)] as [string, string]] : []),
    ...(clean.aiResult ? [[aiDetailKey(record.id), JSON.stringify(clean.aiResult)] as [string, string]] : []),
    [LEARNING_RECORDS_KEY, JSON.stringify(next)],
  ]);
  return true;
}

export async function upsertLearningRecord(record: LearningRecord, assertCurrent: () => void = () => undefined) {
  return queued(async () => { await writeLearningRecord(record, assertCurrent); });
}

/** Compare and update the pending operation inside the same history write queue. */
export async function updatePendingLearningAiRecord(
  recordId: string,
  operationId: string,
  update: (record: LearningRecord) => LearningRecord,
  assertCurrent: () => void,
): Promise<LearningRecord | undefined> {
  return queued(async () => {
    assertCurrent();
    const current = (await readSummaries()).find(record => record.id === recordId && record.recordType === 'ai_result');
    if (!current || current.aiOperation?.status !== 'pending' || current.aiOperation.operationId !== operationId) return undefined;
    if (await Storage.getItem(deletedKey(recordId)) || (current.sessionId && await Storage.getItem(deletedSessionKey(current.sessionId)))) return undefined;
    const next = update(await withDetail(current));
    if (next.id !== recordId || next.recordType !== 'ai_result' || next.sessionId !== current.sessionId || next.aiOperation?.operationId !== operationId) throw new Error('ai_recovery_identity_changed');
    return await writeLearningRecord(next, assertCurrent) ? next : undefined;
  });
}

export async function deleteLearningRecord(recordId: string, descriptor?: Pick<LearningRecord, 'recordType' | 'sessionId'>) {
  return queued(async () => {
    const records = await readSummaries();
    const record = records.find((item) => item.id === recordId) ?? descriptor;
    const sessionId = record?.recordType !== 'ai_result' ? record?.sessionId : undefined;
    const removed = records.filter((item) => item.id === recordId || (sessionId && item.sessionId === sessionId));
    const ids = new Set([recordId, ...removed.map((item) => item.id)]);
    await Storage.multiSet([
      [LEARNING_RECORDS_KEY, JSON.stringify(records.filter((item) => !ids.has(item.id)))],
      ...Array.from(ids, (id) => [deletedKey(id), '1'] as [string, string]),
      ...(sessionId ? [[deletedSessionKey(sessionId), '1'] as [string, string]] : []),
    ]);
    await Storage.multiRemove(Array.from(ids).flatMap((id) => [detailKey(id), aiDetailKey(id)]));
  });
}

export async function clearLearningRecords() {
  return queued(async () => {
    const keys = (await Storage.getAllKeys()).filter((key) => key === LEARNING_RECORDS_KEY || key.startsWith(`${LEARNING_RECORDS_KEY}.`));
    if (keys.length) await Storage.multiRemove(keys);
  });
}

export async function clearAiResultRecords() {
  return queued(async () => {
    const records = await readSummaries();
    const removed = records.filter((record) => record.recordType === 'ai_result');
    await Storage.multiSet([
      [LEARNING_RECORDS_KEY, JSON.stringify(records.filter((record) => record.recordType !== 'ai_result'))],
      ...removed.map((record) => [deletedKey(record.id), '1'] as [string, string]),
    ]);
    if (removed.length) await Storage.multiRemove(removed.map((record) => aiDetailKey(record.id)));
  });
}

export function resetLearningRecordStorageForTests() { writeQueue = Promise.resolve(); }
