import { Platform } from 'react-native';
import { isVercelLegacyWeb } from '@/config/web-runtime';
import Storage from '@/platform/storage';

import type { LearningRecord } from '../types';

export const LEARNING_RECORDS_KEY = 'icao.learning.v1.records';
export const MAX_SESSION_LEARNING_RECORDS = 100;
export const MAX_AI_RESULT_RECORDS = 100;

function reviewKey(recordId: string) {
  return `${LEARNING_RECORDS_KEY}.review.${recordId}`;
}

// Details share this storage owner, but are read only when the user opens one history entry.
export async function loadLearningRecordReview(record: LearningRecord): Promise<LearningRecord> {
  if (!isVercelLegacyWeb(Platform.OS) || !record.vercelStudyReviewSaved) return record;
  await recordWriteQueue.catch(() => undefined);
  const raw = await Storage.getItem(reviewKey(record.id));
  if (!raw) throw new Error('study_review_missing');
  const detail = JSON.parse(raw) as Pick<LearningRecord, 'vercelStudyReview' | 'vercelListeningReview'>;
  return { ...record, vercelStudyReview: detail.vercelStudyReview, vercelListeningReview: detail.vercelListeningReview };
}

let recordWriteQueue = Promise.resolve();

function parseRecords(value: string | null) {
  if (!value) return [];
  try {
    return JSON.parse(value) as LearningRecord[];
  } catch {
    return [];
  }
}

async function readStoredRecords() {
  return parseRecords(await Storage.getItem(LEARNING_RECORDS_KEY));
}

export async function getLearningRecords() {
  await recordWriteQueue.catch(() => undefined);
  return readStoredRecords();
}

export async function upsertLearningRecord(record: LearningRecord) {
  const write = recordWriteQueue.catch(() => undefined).then(async () => {
    const records = await readStoredRecords();
    let sessionCount = 0;
    let aiResultCount = 0;
    const separateReview = isVercelLegacyWeb(Platform.OS) && Boolean(record.vercelStudyReview);
    const summary = separateReview
      ? { ...record, vercelStudyReview: undefined, vercelListeningReview: undefined, vercelStudyReviewSaved: true }
      : record;
    const next = [summary, ...records.filter((item) => item.id !== record.id)].filter((item) => {
      if (item.recordType === 'ai_result') {
        aiResultCount += 1;
        return aiResultCount <= MAX_AI_RESULT_RECORDS;
      }
      sessionCount += 1;
      return sessionCount <= MAX_SESSION_LEARNING_RECORDS;
    });
    if (separateReview) {
      // One IndexedDB transaction commits the detail and its list entry together.
      await Storage.multiSet([
        [reviewKey(record.id), JSON.stringify({ vercelStudyReview: record.vercelStudyReview, vercelListeningReview: record.vercelListeningReview })],
        [LEARNING_RECORDS_KEY, JSON.stringify(next)],
      ]);
    } else {
      await Storage.setItem(LEARNING_RECORDS_KEY, JSON.stringify(next));
    }
    if (isVercelLegacyWeb(Platform.OS)) {
      const kept = new Set(next.map((item) => item.id));
      const expired = records.filter((item) => item.vercelStudyReviewSaved && !kept.has(item.id));
      if (expired.length) await Storage.multiRemove(expired.map((item) => reviewKey(item.id))).catch(() => undefined);
    }
  });
  recordWriteQueue = write;
  await write;
}

export async function clearLearningRecords() {
  const write = recordWriteQueue.catch(() => undefined).then(async () => {
    if (!isVercelLegacyWeb(Platform.OS)) return Storage.removeItem(LEARNING_RECORDS_KEY);
    const records = await readStoredRecords();
    await Storage.multiRemove([LEARNING_RECORDS_KEY, ...records.filter((item) => item.vercelStudyReviewSaved).map((item) => reviewKey(item.id))]);
  });
  recordWriteQueue = write;
  await write;
}

export async function deleteLearningRecord(recordId: string) {
  const write = recordWriteQueue.catch(() => undefined).then(async () => {
    const records = await readStoredRecords();
    await Storage.setItem(LEARNING_RECORDS_KEY, JSON.stringify(records.filter((record) => record.id !== recordId)));
    if (isVercelLegacyWeb(Platform.OS) && records.some((record) => record.id === recordId && record.vercelStudyReviewSaved)) {
      await Storage.removeItem(reviewKey(recordId)).catch(() => undefined);
    }
  });
  recordWriteQueue = write;
  await write;
}

export async function clearAiResultRecords() {
  const write = recordWriteQueue.catch(() => undefined).then(async () => {
    const records = await readStoredRecords();
    await Storage.setItem(LEARNING_RECORDS_KEY, JSON.stringify(records.filter((record) => record.recordType !== 'ai_result')));
  });
  recordWriteQueue = write;
  await write;
}

export function resetLearningRecordStorageForTests() {
  recordWriteQueue = Promise.resolve();
}
