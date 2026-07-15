import Storage from 'expo-sqlite/kv-store';

import type { LearningRecord } from '../types';

export const LEARNING_RECORDS_KEY = 'icao.learning.v1.records';
export const MAX_SESSION_LEARNING_RECORDS = 100;
export const MAX_AI_RESULT_RECORDS = 100;

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
    const next = [record, ...records.filter((item) => item.id !== record.id)].filter((item) => {
      if (item.recordType === 'ai_result') {
        aiResultCount += 1;
        return aiResultCount <= MAX_AI_RESULT_RECORDS;
      }
      sessionCount += 1;
      return sessionCount <= MAX_SESSION_LEARNING_RECORDS;
    });
    await Storage.setItem(LEARNING_RECORDS_KEY, JSON.stringify(next));
  });
  recordWriteQueue = write;
  await write;
}

export async function clearLearningRecords() {
  const write = recordWriteQueue.catch(() => undefined).then(() => Storage.removeItem(LEARNING_RECORDS_KEY));
  recordWriteQueue = write;
  await write;
}

export function resetLearningRecordStorageForTests() {
  recordWriteQueue = Promise.resolve();
}
