// Exercise the historical implementation explicitly, independently of the formal Web default.
jest.mock('@/config/web-runtime', () => {
  const previous = process.env.EXPO_PUBLIC_ICAO_WEB_RUNTIME;
  process.env.EXPO_PUBLIC_ICAO_WEB_RUNTIME = 'vercel-legacy';
  try {
    return jest.requireActual('@/config/web-runtime');
  } finally {
    if (previous === undefined) delete process.env.EXPO_PUBLIC_ICAO_WEB_RUNTIME;
    else process.env.EXPO_PUBLIC_ICAO_WEB_RUNTIME = previous;
  }
});

// This suite verifies the historical Vercel implementation, independent of Jest's iOS resolver.
jest.mock('../lib/study-review', () => jest.requireActual('../lib/study-review.ts'));
jest.mock('../platform/learning-record-storage', () => jest.requireActual('../platform/learning-record-storage.ts'));
import { Platform } from 'react-native';
import Storage from '@/platform/storage';
import data from '../data/question-bank.json';
import { captureStudyReview, toStudyReviewPackage } from '../lib/study-review';
import { clearLearningRecords, getLearningRecords, loadLearningRecordReview, resetLearningRecordStorageForTests, upsertLearningRecord } from '../platform/learning-record-storage';
import type { LearningRecord, QuestionBankDataset } from '../types';

const dataset = data[0] as QuestionBankDataset;
const category = dataset.categories[0];
const topic = category.topics[0];
const items = topic.cards.slice(0, 2).map((card) => ({ id: card.id, card, dataset, category, topic }));
const record = (id = 'test'): LearningRecord => ({
  id, bankId: dataset.id, bankTitle: dataset.title, categoryTitle: category.name, topicTitle: topic.name,
  completedCount: 0, totalCount: 2, correctCount: 0, durationSeconds: 2, reason: 'abort', createdAt: '2026-09-08',
  vercelStudyReview: captureStudyReview(items, {}, {}, 'web'),
});
const originalPlatform = Platform.OS;
beforeEach(async () => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
  await Storage.clear(); resetLearningRecordStorageForTests(); jest.clearAllMocks();
});
afterEach(() => { Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform }); });

it('loads only a summary for the list and retrieves the immutable detail on demand', async () => {
  const saved = record();
  await upsertLearningRecord(saved);
  jest.mocked(Storage.getItem).mockClear();
  const [summary] = await getLearningRecords();
  expect(summary.vercelStudyReviewSaved).toBe(true);
  expect(summary.vercelStudyReview).toBeUndefined();
  expect(Storage.getItem).toHaveBeenCalledTimes(1);
  expect(await loadLearningRecordReview(summary)).toMatchObject(saved);
  expect(toStudyReviewPackage(await loadLearningRecordReview(summary), 'web')?.items).toHaveLength(2);
  expect(saved.vercelStudyReview?.items[0].dataset.categories).toEqual([]);
  expect(saved.vercelStudyReview?.items[0].topic.cards).toEqual([]);
});

it('does not publish a summary when the detail transaction fails; retries are idempotent', async () => {
  jest.mocked(Storage.multiSet).mockRejectedValueOnce(new Error('quota'));
  await expect(upsertLearningRecord(record())).rejects.toThrow('quota');
  expect(await getLearningRecords()).toEqual([]);
  await upsertLearningRecord(record());
  await upsertLearningRecord(record());
  expect(await getLearningRecords()).toHaveLength(1);
});

it('retains 100 session summaries and removes expired or explicitly cleared details', async () => {
  for (let i = 0; i < 101; i++) await upsertLearningRecord(record(String(i)));
  const records = await getLearningRecords();
  expect(records).toHaveLength(100);
  expect(records.some((item) => item.id === '0')).toBe(false);
  await expect(loadLearningRecordReview({ ...record('0'), vercelStudyReviewSaved: true })).rejects.toThrow('study_review_missing');
  await clearLearningRecords();
  expect(await getLearningRecords()).toEqual([]);
  await expect(loadLearningRecordReview(records[0])).rejects.toThrow('study_review_missing');
});

it.each(['ios', 'android', 'edgeone-production'] as const)('does not enable review capture on %s', (target) => {
  expect(captureStudyReview(items, {}, {}, target === 'edgeone-production' ? 'web' : target,
    target === 'edgeone-production' ? target : 'vercel-legacy')).toBeUndefined();
});

it('keeps a large real topic out of the history list and captures only the selected package', async () => {
  const topics = (data as QuestionBankDataset[]).flatMap(dataset => dataset.categories.flatMap(category => category.topics.map(topic => ({ dataset, category, topic }))));
  const largest = topics.sort((a, b) => b.topic.cards.length - a.topic.cards.length)[0];
  const items = largest.topic.cards.map(card => ({ ...largest, id: card.id, card }));
  const start = performance.now();
  const detail = captureStudyReview(items, {}, {}, 'web')!;
  const captureMs = performance.now() - start;
  const saved = { ...record(), totalCount: items.length, vercelStudyReview: detail };
  await upsertLearningRecord(saved);
  const summary = (await getLearningRecords())[0];
  expect(JSON.stringify(summary).length).toBeLessThan(1000);
  const summaries = JSON.stringify(Array.from({ length: 100 }, (_, index) => ({ ...summary, id: String(index) })));
  const readStart = performance.now();
  const parsed = JSON.parse(summaries);
  const listParseMs = performance.now() - readStart;
  expect(parsed).toHaveLength(100);
  expect(detail.items).toHaveLength(items.length);
  expect(detail.items.every(item => !item.dataset.categories.length && !item.category.topics.length && !item.topic.cards.length)).toBe(true);
  console.info('History size sample', { questions: items.length, detailBytes: encodeURIComponent(JSON.stringify(detail)).replace(/%[A-F\d]{2}/gu, '_').length, hundredSummariesBytes: encodeURIComponent(summaries).replace(/%[A-F\d]{2}/gu, '_').length, captureMs: Math.round(captureMs * 100) / 100, listParseMs: Math.round(listParseMs * 100) / 100 });
});
