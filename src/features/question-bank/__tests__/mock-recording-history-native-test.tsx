import { act, renderHook, waitFor } from '@testing-library/react-native';
import Storage from '@/platform/storage';
import NativeStorage from 'expo-sqlite/kv-store';
import { captureLearningWriteContext, assertLearningWriteContext, resetLearningSyncForTests, switchLearningSyncAccount, switchLearningSyncToGuest, enqueueLearningRecord } from '@/features/sync/learning-sync.native';
import data from '../data/question-bank.json';
import { useStudySession } from '../hooks/useStudySession.native';
import { toStudyReviewPackage } from '../lib/study-review.native';
import { clearLearningRecords, deleteLearningRecord, getLearningRecords, loadLearningRecordRecordings, loadLearningRecordReview, recordingDetailKey, resetLearningRecordStorageForTests, saveLearningRecordRecordings, upsertLearningRecord } from '../platform/learning-record-storage.native';
import { recordingRepository } from '../recording/recording-repository';
import type { RecordingAsset } from '../recording/types';
import type { LearningStore } from '../platform/learning-store.native';
import type { QuestionBankDataset, QuestionBankStudyPackage } from '../types';

const mockFiles = new Set<string>();
jest.mock('../recording/recording-repository', () => ({ recordingRepository: {
  cleanupSession: jest.fn(),
  discard: jest.fn((asset: RecordingAsset) => { mockFiles.delete(asset.uri); }),
  retainForRecord: jest.fn((asset: RecordingAsset, recordId: string) => {
    const persistentPath = `${recordId}/${asset.id}.wav`;
    const saved = { ...asset, persistentPath, uri: `file:///documents/${persistentPath}` };
    mockFiles.add(saved.uri);
    return saved;
  }),
  restoreSaved: jest.fn((asset: RecordingAsset) => {
    const uri = `file:///documents/${asset.persistentPath}`;
    return mockFiles.has(uri) ? { ...asset, uri } : undefined;
  }),
} }));
jest.mock('@/platform/api-client', () => ({ getApiBaseUrl: () => undefined, apiRequest: jest.fn() }));
let mockId = 0;
jest.mock('expo-crypto', () => ({ randomUUID: () => `review-${++mockId}` }));
const dataset = data.find(bank => bank.id === 'opi') as QuestionBankDataset;
const category = dataset.categories[0]; const topic = category.topics[0]; const card = topic.cards[0];
const item = { id: 'paper-opi-1', dataset, category, topic, card };
const paper = (id: string): QuestionBankStudyPackage => ({ id: `session-${id}`, startedAt: new Date().toISOString(), progressMode: 'session-only', items: [item], record: {
  id, recordType: 'mock_exam', bankId: 'mock_exam', bankTitle: '模拟考试', categoryTitle: 'OPI', topicTitle: 'OPI', source: 'mock-exam',
} });
const asset = (id: string): RecordingAsset => ({ id, cardId: card.id, sessionId: 'capture', byteSize: 64044, durationMillis: 2000, createdAt: new Date().toISOString(), format: 'wav', mimeType: 'audio/wav', storageKind: 'native-file', uri: `file:///cache/${id}.wav` });
const store: LearningStore = { getCardState: jest.fn(), getTopicStates: jest.fn(async () => ({})), saveCardState: jest.fn(async () => undefined), getRecords: getLearningRecords, addRecord: record => upsertLearningRecord(record) };
beforeEach(async () => {
  resetLearningSyncForTests(); resetLearningRecordStorageForTests();
  await Storage.clear(); mockFiles.clear(); jest.clearAllMocks();
});
afterEach(() => resetLearningSyncForTests());

async function complete(id: string, recording = asset(id)) {
  const studyPackage = paper(id);
  const hook = await renderHook(() => useStudySession({ studyPackage, store }));
  await waitFor(() => expect(hook.result.current.hydrated).toBe(true));
  await act(async () => { await hook.result.current.recordAnswer(recording); });
  await act(async () => { await hook.result.current.finish('complete'); });
  const report = hook.result.current.report!;
  await hook.unmount();
  return report;
}

it('reopens the final answer through the existing history question card after session cleanup', async () => {
  const report = await complete('first');
  expect(recordingRepository.cleanupSession).toHaveBeenCalledWith('session-first');
  const review = toStudyReviewPackage(await loadLearningRecordReview(report))!;
  const hook = await renderHook(() => useStudySession({ studyPackage: review, store }));
  await waitFor(() => expect(hook.result.current.hydrated).toBe(true));
  expect(hook.result.current.recording).toMatchObject({ id: 'first', persistentPath: 'first/first.wav' });
  expect(hook.result.current.examMode).toBe(false);
  await act(async () => { await hook.result.current.finish('abort'); });
  expect(await getLearningRecords()).toHaveLength(1);
  expect(await Storage.getItem(recordingDetailKey('first'))).not.toContain('file:///');
  expect(JSON.stringify(await getLearningRecords({ includeDetails: true }))).not.toContain('persistentPath');
  await hook.unmount();
});

it('re-records only the selected attempt, preserves old audio on failure and keeps the new copy independent', async () => {
  const first = await complete('first'); await complete('second');
  const studyPackage = toStudyReviewPackage(first)!;
  const hook = await renderHook(() => useStudySession({ studyPackage, store }));
  await waitFor(() => expect(hook.result.current.recording?.id).toBe('first'));
  jest.mocked(NativeStorage.setItem).mockRejectedValueOnce(new Error('disk_full'));
  await act(async () => { await expect(hook.result.current.recordAnswer(asset('failed'))).rejects.toThrow('disk_full'); });
  expect(hook.result.current.recording?.id).toBe('first');
  expect((await loadLearningRecordRecordings('first'))[item.id].id).toBe('first');
  expect(mockFiles.has('file:///documents/first/failed.wav')).toBe(false);
  await act(async () => { await hook.result.current.recordAnswer(asset('replacement')); });
  expect((await loadLearningRecordRecordings('first'))[item.id].id).toBe('replacement');
  expect((await loadLearningRecordRecordings('second'))[item.id].id).toBe('second');
  await act(async () => { await hook.result.current.finish('abort'); });
  const replayId = hook.result.current.report!.id;
  await hook.unmount();
  await deleteLearningRecord('first');
  expect(await loadLearningRecordRecordings('first')).toEqual({});
  expect((await loadLearningRecordRecordings(replayId))[item.id].id).toBe('replacement');
  expect((await loadLearningRecordRecordings('second'))[item.id].id).toBe('second');
  await expect(saveLearningRecordRecordings('first', { [item.id]: asset('late') }, () => undefined, true)).rejects.toThrow('learning_record_deleted');
});

it('does not finish or discard cache recordings when persistence fails; retry saves the same attempt', async () => {
  const studyPackage = paper('retry');
  const hook = await renderHook(() => useStudySession({ studyPackage, store }));
  await waitFor(() => expect(hook.result.current.hydrated).toBe(true));
  await act(async () => { await hook.result.current.recordAnswer(asset('answer')); });
  jest.mocked(NativeStorage.setItem).mockRejectedValueOnce(new Error('disk_full'));
  await act(async () => { await expect(hook.result.current.finish('complete')).rejects.toThrow('disk_full'); });
  expect(hook.result.current.report).toBeUndefined(); expect(recordingRepository.cleanupSession).not.toHaveBeenCalled();
  expect(hook.result.current.recording?.id).toBe('answer');
  await act(async () => { await hook.result.current.finish('complete'); });
  expect(hook.result.current.report?.id).toBe('retry');
  await hook.unmount();
});

it('isolates account references, restores them on return, and never puts paths in the sync outbox', async () => {
  await switchLearningSyncAccount('A');
  const first = await complete('first');
  await enqueueLearningRecord(first);
  const contextA = captureLearningWriteContext();
  await switchLearningSyncAccount('B');
  expect(await loadLearningRecordRecordings('first')).toEqual({});
  await expect(saveLearningRecordRecordings('first', { [item.id]: asset('late') }, () => assertLearningWriteContext(contextA))).rejects.toThrow();
  await complete('second'); await switchLearningSyncAccount('A');
  expect((await loadLearningRecordRecordings('first'))[item.id].id).toBe('first');
  expect(await loadLearningRecordRecordings('second')).toEqual({});
  const outboxKey = (await Storage.getAllKeys()).find(key => key.endsWith('.outbox'))!;
  expect(await Storage.getItem(outboxKey)).not.toContain('persistentPath');
  await clearLearningRecords();
  expect(mockFiles.has('file:///documents/first/first.wav')).toBe(false);
  await switchLearningSyncAccount('B');
  expect((await loadLearningRecordRecordings('second'))[item.id].id).toBe('second');
});

it('keeps guest audio with the claimed record and does not expose it to another account', async () => {
  await complete('guest');
  await switchLearningSyncAccount('A');
  expect((await loadLearningRecordRecordings('guest'))[item.id].id).toBe('guest');
  await switchLearningSyncToGuest();
  expect(await loadLearningRecordRecordings('guest')).toEqual({});
  await switchLearningSyncAccount('B');
  expect(await loadLearningRecordRecordings('guest')).toEqual({});
  await switchLearningSyncAccount('A');
  expect((await loadLearningRecordRecordings('guest'))[item.id].id).toBe('guest');
});
