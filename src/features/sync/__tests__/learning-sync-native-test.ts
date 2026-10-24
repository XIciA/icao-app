/* eslint-disable import/first */
const mockValues = new Map<string, string>();
const mockApiRequest = jest.fn();

jest.mock('expo-sqlite/kv-store', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key: string) => mockValues.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => { mockValues.set(key, value); }),
    removeItem: jest.fn(async (key: string) => { mockValues.delete(key); }),
    getAllKeys: jest.fn(async () => Array.from(mockValues.keys())),
    multiGet: jest.fn(async (keys: string[]) => keys.map((key) => [key, mockValues.get(key) ?? null])),
    multiSet: jest.fn(async (entries: [string, string][]) => entries.forEach(([key, value]) => mockValues.set(key, value))),
    multiRemove: jest.fn(async (keys: string[]) => keys.forEach((key) => mockValues.delete(key))),
  },
}));

jest.mock('@/platform/api-client', () => ({ apiRequest: (...args: unknown[]) => mockApiRequest(...args) }));


import * as repository from '@/features/question-bank/data/repository.native';
import { createEmptyVocabularyState, readVocabularyState, writeVocabularyState } from '@/features/vocabulary/persistence';
import Storage from '@/platform/storage';
import { ANNOTATION_STORAGE_KEY, createEmptyAnnotationEntry, createEmptyAnnotationStore, flushPendingAnnotationSaves, readAnnotationStore, updateAnnotationStore, retryAnnotationStoreWrite, setAnnotationEntry, resetAnnotationStoreCacheForTests } from '@/features/question-bank/annotations/annotation-store.native';
import { questionBankCardTargetKey } from '@/features/question-bank/annotations/card-index';
import { readProfile } from '@/features/account/profile-store.native';
import { readLearningProgressStats } from '@/features/question-bank/platform/learning-store.native';
import { getLearningRecords, loadLearningRecordReview, upsertLearningRecord, resetLearningRecordStorageForTests } from '@/features/question-bank/platform/learning-record-storage.native';
import { captureStudyReview } from '@/features/question-bank/lib/study-review.native';
import data from '@/features/question-bank/data/question-bank.json';
import type { LearningRecord, QuestionBankDataset } from '@/features/question-bank/types';
import { bindLearningSync, mutateVocabularyInCurrentWorkspace, applyPrivacyAiResultReset, deleteLocalAiResult, applyPrivacyLearningDataReset, captureLearningWriteContext, assertLearningWriteContext, clearPersonalLearningData, deleteLearningHistory, enqueueAnnotationStore, enqueueAccountProfile, enqueueLearningRecord, getLearningSyncStatus, resetLearningSyncForTests, runLearningSync, setLearningSyncActiveUser, switchLearningSyncAccount, switchLearningSyncToGuest } from '../learning-sync.native';
const bank = data[0] as QuestionBankDataset;
const category = bank.categories[0]; const topic = category.topics[0]; const card = topic.cards[0];
const history = (): LearningRecord => ({ id: 'history-one', sessionId: 'session-one', recordType: 'session', bankId: bank.id, bankTitle: bank.title, categoryTitle: category.name, topicTitle: topic.name, createdAt: '2026-09-09T00:00:00.000Z', durationSeconds: 1, reason: 'abort', completedCount: 0, totalCount: 1, correctCount: 0, studyReview: captureStudyReview([{ id: card.id, card, topic, category, dataset: bank }], {}, {}) });
beforeEach(() => { jest.useFakeTimers(); mockValues.clear(); mockApiRequest.mockReset(); resetLearningRecordStorageForTests(); resetLearningSyncForTests(); resetAnnotationStoreCacheForTests(); });
afterEach(() => { resetLearningSyncForTests(); jest.useRealTimers(); });
it('restores each account workspace including details, tombstones and pending outbox without merging', async () => {
  await switchLearningSyncAccount('A');
  await upsertLearningRecord(history()); await enqueueLearningRecord(history());
  await switchLearningSyncAccount('B');
  expect(await getLearningRecords()).toEqual([]); expect((await getLearningSyncStatus()).pendingCount).toBe(0);
  await switchLearningSyncAccount('A');
  expect(await getLearningRecords()).toHaveLength(1); expect((await getLearningSyncStatus()).pendingCount).toBe(1);
  expect((await loadLearningRecordReview(history())).studyReview?.items).toHaveLength(1);
  await deleteLearningHistory(history().id);
  await switchLearningSyncAccount('B'); await switchLearningSyncAccount('A');
  await upsertLearningRecord(history());
  expect(await getLearningRecords()).toEqual([]);
  expect((await getLearningSyncStatus()).pendingCount).toBe(1);
});
it('deleting one account clears only its workspace and snapshot, not another account', async () => {
  await switchLearningSyncAccount('A'); await upsertLearningRecord(history()); await enqueueLearningRecord(history());
  await switchLearningSyncAccount('B'); await upsertLearningRecord({ ...history(), id: 'history-b', sessionId: 'session-b' });
  await clearPersonalLearningData('A');
  expect((await getLearningRecords())[0].id).toBe('history-b');
  await switchLearningSyncAccount('A'); expect(await getLearningRecords()).toEqual([]);
  await switchLearningSyncAccount('B'); expect((await getLearningRecords())[0].id).toBe('history-b');
});
it('serializes a superseded mid-swap and never overwrites A with a half-cleared snapshot', async () => {
  await switchLearningSyncAccount('A'); await upsertLearningRecord(history()); await enqueueLearningRecord(history());
  let release!: () => void; let entered!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; }); const started = new Promise<void>(resolve => { entered = resolve; });
  jest.mocked(Storage.multiRemove).mockImplementationOnce(async (keys) => { entered(); await gate; keys.forEach(key => mockValues.delete(key)); });
  const toB = switchLearningSyncAccount('B'); const caughtB = toB.catch(error => error);
  await started;
  const toC = switchLearningSyncAccount('C'); release();
  expect(await caughtB).toBeInstanceOf(Error); await toC;
  expect((await getLearningSyncStatus()).boundUserId).toBe('C');
  await switchLearningSyncAccount('A');
  expect(await getLearningRecords()).toHaveLength(1); expect((await getLearningSyncStatus()).pendingCount).toBe(1);
});
it('logout while a switch waits for sync invalidates that queued switch', async () => {
  await switchLearningSyncAccount('A');
  let respond!: (value: unknown) => void;
  mockApiRequest.mockImplementation(() => new Promise(resolve => { respond = resolve; }));
  const running = runLearningSync('A');
  for (let index = 0; index < 30 && !respond; index++) await Promise.resolve();
  const switching = switchLearningSyncAccount('B').catch(error => error);
  setLearningSyncActiveUser(undefined);
  respond({ changes: [], cursor: 0, hasMore: false }); await running;
  expect(await switching).toBeInstanceOf(Error);
  expect((await getLearningSyncStatus()).boundUserId).toBe('A');
});
it('learning reset preserves queued profile and applies its cloud document while blocking old writes', async () => {
  await switchLearningSyncAccount('A');
  await enqueueAccountProfile({ displayName: '机长', avatarUri: null, target: 'icao5-recert' });
  await upsertLearningRecord(history()); await enqueueLearningRecord(history());
  const old = captureLearningWriteContext();
  await applyPrivacyLearningDataReset({ dataGeneration: 1, aiResultGeneration: 1 });
  expect(() => assertLearningWriteContext(old)).toThrow('learning_owner_or_generation_changed');
  expect(await getLearningRecords()).toEqual([]);
  expect(JSON.parse(mockValues.get('icao.learning.v3.sync.outbox')!)).toHaveLength(1);
  mockApiRequest.mockImplementation(async (path: string, init?: RequestInit) => {
    if (path === '/v1/sync/push') {
      const body = JSON.parse(String(init?.body));
      expect(body.dataGeneration).toBe(1); expect(body.mutations[0].payload.documentKey).toBe('account_profile');
      return { cursor: 1, dataGeneration: 1, aiResultGeneration: 1, results: body.mutations.map((entry: { mutationId: string }) => ({ mutationId: entry.mutationId, status: 'accepted' })) };
    }
    return { cursor: 2, dataGeneration: 1, aiResultGeneration: 1, hasMore: false, changes: [{ kind: 'document', entityKey: 'account_profile', cursor: 2, version: 2, changedAt: history().createdAt, payload: { documentKey: 'account_profile', document: { displayName: '云端资料', avatarUri: null, target: 'icao5-recert' }, version: 2, updatedAt: history().createdAt } }] };
  });
  await runLearningSync('A'); expect((await readProfile()).displayName).toBe('云端资料');
});
it('deleting history leaves cumulative card progress untouched', async () => {
  await switchLearningSyncAccount('A');
  mockValues.set(`icao.learning.v2.topic.${topic.id}`, JSON.stringify({ [card.id]: { visited: true, completed: true, note: '', updatedAt: history().createdAt } }));
  await upsertLearningRecord(history()); const before = await readLearningProgressStats();
  await deleteLearningHistory(history().id);
  expect(before).toEqual({ learnedCards: 1, completedCards: 1 }); expect(await readLearningProgressStats()).toEqual(before);
});

it.each(['learning', 'ai', 'single'] as const)('rejects a late %s privacy response after changing accounts', async (kind) => {
  await switchLearningSyncAccount('A');
  const context = captureLearningWriteContext('A');
  await switchLearningSyncAccount('B');
  await upsertLearningRecord(history());
  const response = { dataGeneration: 1, aiResultGeneration: 1 };
  await expect(kind === 'learning' ? applyPrivacyLearningDataReset(response, context)
    : kind === 'ai' ? applyPrivacyAiResultReset(response, context) : deleteLocalAiResult(history().id, context))
    .rejects.toThrow('learning_owner_or_generation_changed');
  expect((await getLearningRecords())[0].id).toBe(history().id);
  expect((await getLearningSyncStatus()).boundUserId).toBe('B');
});
it('finishes an accepted privacy reset before restoring another account workspace', async () => {
  await switchLearningSyncAccount('B'); await upsertLearningRecord({ ...history(), id: 'history-b', sessionId: 'session-b' });
  await switchLearningSyncAccount('A'); await upsertLearningRecord(history());
  let release!: () => void; let entered!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { entered = resolve; });
  jest.mocked(Storage.multiRemove).mockImplementationOnce(async keys => { entered(); await gate; keys.forEach(key => mockValues.delete(key)); });
  const reset = applyPrivacyLearningDataReset({ dataGeneration: 1, aiResultGeneration: 1 });
  await started;
  const switching = switchLearningSyncAccount('B'); release();
  await reset; await switching;
  expect((await getLearningRecords())[0].id).toBe('history-b');
  await switchLearningSyncAccount('A'); expect(await getLearningRecords()).toEqual([]);
});


const annotationTarget = { bankId: bank.id, categoryId: category.id, topicId: topic.id, cardId: card.id };
const annotationKey = questionBankCardTargetKey(annotationTarget);
function noteStore(note: string) {
  return setAnnotationEntry(createEmptyAnnotationStore(), annotationTarget, { ...createEmptyAnnotationEntry(annotationTarget), note });
}
function saveNote(note: string) {
  return updateAnnotationStore(store => setAnnotationEntry(store, annotationTarget, { ...createEmptyAnnotationEntry(annotationTarget), note }));
}
function deferred() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}
it('archives an accepted annotation write and its outbox before restoring the next account', async () => {
  await switchLearningSyncAccount('A');
  const started = deferred(); const gate = deferred();
  const original = jest.mocked(Storage.setItem).getMockImplementation()!;
  jest.mocked(Storage.setItem).mockImplementationOnce(async (key, value) => {
    expect(key).toBe(ANNOTATION_STORAGE_KEY); started.release(); await gate.promise; await original(key, value);
  });
  const saving = saveNote('A 的最后一条笔记');
  await started.promise;
  const switching = switchLearningSyncAccount('B');
  gate.release(); await saving; await switching;
  expect((await readAnnotationStore()).entries).toEqual({});
  expect((await getLearningSyncStatus()).pendingCount).toBe(0);
  await switchLearningSyncAccount('A');
  expect((await readAnnotationStore()).entries[annotationKey].note).toBe('A 的最后一条笔记');
  const outbox = JSON.parse(mockValues.get('icao.learning.v3.sync.outbox')!);
  expect(outbox).toHaveLength(1); expect(outbox[0].payload.document.entries[annotationKey].note).toBe('A 的最后一条笔记');
  jest.mocked(Storage.setItem).mockImplementation(original);
});
it('keeps annotation reads and clear-learning in one workspace order without reviving the old cache', async () => {
  await switchLearningSyncAccount('A');
  mockValues.set(ANNOTATION_STORAGE_KEY, JSON.stringify(noteStore('待清除')));
  const started = deferred(); const gate = deferred();
  const original = jest.mocked(Storage.getItem).getMockImplementation()!;
  jest.mocked(Storage.getItem).mockImplementation(async key => {
    if (key !== ANNOTATION_STORAGE_KEY) return original(key);
    const previous = mockValues.get(key) ?? null; started.release(); await gate.promise; return previous;
  });
  const reading = readAnnotationStore({ force: true }); await started.promise;
  let resetFinished = false;
  const reset = applyPrivacyLearningDataReset({ dataGeneration: 1, aiResultGeneration: 1 }).then(() => { resetFinished = true; });
  await Promise.resolve(); expect(resetFinished).toBe(false);
  gate.release(); await reading; await reset;
  jest.mocked(Storage.getItem).mockImplementation(original);
  expect((await readAnnotationStore()).entries).toEqual({});
  expect(JSON.parse(mockValues.get(ANNOTATION_STORAGE_KEY)!).entries).toEqual({});
});
it('rejects queued old-owner annotation edits and old-generation outbox writes', async () => {
  await switchLearningSyncAccount('A'); const old = captureLearningWriteContext();
  const started = deferred(); const gate = deferred();
  const original = jest.mocked(Storage.getItem).getMockImplementation()!;
  jest.mocked(Storage.getItem).mockImplementation(async key => {
    if (key !== ANNOTATION_STORAGE_KEY) return original(key);
    started.release(); await gate.promise; return mockValues.get(key) ?? null;
  });
  const reading = readAnnotationStore({ force: true }); await started.promise;
  const edit = saveNote('不能写到 B').catch(error => error);
  const switching = switchLearningSyncAccount('B'); gate.release();
  await reading; expect(await edit).toBeInstanceOf(Error); await switching;
  jest.mocked(Storage.getItem).mockImplementation(original);
  await expect(enqueueAnnotationStore(noteStore('旧账号'), old)).rejects.toThrow('learning_owner_or_generation_changed');
  expect((await readAnnotationStore()).entries).toEqual({});
  const beforeReset = captureLearningWriteContext();
  await applyPrivacyLearningDataReset({ dataGeneration: 1, aiResultGeneration: 1 });
  await expect(enqueueAnnotationStore(noteStore('旧代际'), beforeReset)).rejects.toThrow('learning_owner_or_generation_changed');
  expect((await getLearningSyncStatus()).pendingCount).toBe(0);
});
it('preserves rapid annotation updates and retries only the current owner cache', async () => {
  await switchLearningSyncAccount('A');
  const first = saveNote('正在学习');
  const second = updateAnnotationStore(store => setAnnotationEntry(store, annotationTarget, { ...store.entries[annotationKey], tagIds: ['good'] }));
  await Promise.all([first, second]);
  expect((await readAnnotationStore()).entries[annotationKey]).toMatchObject({ note: '正在学习', tagIds: ['good'] });
  jest.mocked(Storage.setItem).mockRejectedValueOnce(new Error('disk_busy'));
  await expect(saveNote('重试保存')).rejects.toThrow('disk_busy');
  await retryAnnotationStoreWrite();
  expect(JSON.parse(mockValues.get(ANNOTATION_STORAGE_KEY)!).entries[annotationKey].note).toBe('重试保存');
  await switchLearningSyncAccount('B'); await retryAnnotationStoreWrite();
  expect((await readAnnotationStore()).entries).toEqual({});
});
it('flushing a browsing-only annotation session does not create a document or outbox mutation', async () => {
  await switchLearningSyncAccount('A');
  const before = new Map(mockValues);
  await expect(flushPendingAnnotationSaves()).resolves.toBe(true);
  expect(mockValues).toEqual(before);
  expect((await getLearningSyncStatus()).pendingCount).toBe(0);
});
it('waits for every in-flight annotation edit in the existing workspace queue', async () => {
  await switchLearningSyncAccount('A');
  const firstStarted = deferred(); const firstGate = deferred();
  const secondStarted = deferred(); const secondGate = deferred();
  const original = jest.mocked(Storage.setItem).getMockImplementation()!;
  let documentWrites = 0;
  jest.mocked(Storage.setItem).mockImplementation(async (key, value) => {
    if (key === ANNOTATION_STORAGE_KEY && ++documentWrites === 1) { firstStarted.release(); await firstGate.promise; }
    else if (key === ANNOTATION_STORAGE_KEY && documentWrites === 2) { secondStarted.release(); await secondGate.promise; }
    await original(key, value);
  });
  const first = saveNote('保留本次笔记');
  await firstStarted.promise;
  let flushed = false;
  const flushing = flushPendingAnnotationSaves().then(saved => { flushed = true; return saved; });
  const second = updateAnnotationStore(store => setAnnotationEntry(store, annotationTarget, { ...store.entries[annotationKey], tagIds: ['good'] }));
  firstGate.release(); await first; await secondStarted.promise;
  expect(flushed).toBe(false);
  secondGate.release(); await second;
  expect(await flushing).toBe(true);
  expect(JSON.parse(mockValues.get(ANNOTATION_STORAGE_KEY)!).entries[annotationKey]).toMatchObject({ note: '保留本次笔记', tagIds: ['good'] });
  const outbox = JSON.parse(mockValues.get('icao.learning.v3.sync.outbox')!);
  expect(outbox.at(-1).payload.document.entries[annotationKey]).toMatchObject({ note: '保留本次笔记', tagIds: ['good'] });
  jest.mocked(Storage.setItem).mockImplementation(original);
});
it('reports a failed annotation save until the existing retry persists its retained edits', async () => {
  await switchLearningSyncAccount('A');
  jest.mocked(Storage.setItem).mockRejectedValueOnce(new Error('disk_busy'));
  await expect(saveNote('尚未落盘')).rejects.toThrow('disk_busy');
  await expect(flushPendingAnnotationSaves()).resolves.toBe(false);
  expect((await readAnnotationStore()).entries[annotationKey].note).toBe('尚未落盘');
  await retryAnnotationStoreWrite();
  await expect(flushPendingAnnotationSaves()).resolves.toBe(true);
  expect(JSON.parse(mockValues.get(ANNOTATION_STORAGE_KEY)!).entries[annotationKey].note).toBe('尚未落盘');
});
it('does not claim success when the annotation document saved but its sync outbox failed', async () => {
  await switchLearningSyncAccount('A');
  const original = jest.mocked(Storage.setItem).getMockImplementation()!;
  let failOutbox = true;
  jest.mocked(Storage.setItem).mockImplementation(async (key, value) => {
    if (key === 'icao.learning.v3.sync.outbox' && failOutbox) { failOutbox = false; throw new Error('outbox_busy'); }
    await original(key, value);
  });
  await expect(saveNote('等待同步入队')).rejects.toThrow('outbox_busy');
  expect(JSON.parse(mockValues.get(ANNOTATION_STORAGE_KEY)!).entries[annotationKey].note).toBe('等待同步入队');
  await expect(flushPendingAnnotationSaves()).resolves.toBe(false);
  await retryAnnotationStoreWrite();
  await expect(flushPendingAnnotationSaves()).resolves.toBe(true);
  expect((await getLearningSyncStatus()).pendingCount).toBe(1);
  jest.mocked(Storage.setItem).mockImplementation(original);
});
it('does not let a completed old-owner save authorize departure for a changed account', async () => {
  await switchLearningSyncAccount('A');
  const context = captureLearningWriteContext();
  const started = deferred(); const gate = deferred();
  const original = jest.mocked(Storage.setItem).getMockImplementation()!;
  jest.mocked(Storage.setItem).mockImplementationOnce(async (key, value) => { started.release(); await gate.promise; await original(key, value); });
  const saving = saveNote('留在 A');
  await started.promise;
  const flushing = flushPendingAnnotationSaves(context);
  const switching = switchLearningSyncAccount('B');
  gate.release(); await saving; await switching;
  expect(await flushing).toBe(false);
  await expect(flushPendingAnnotationSaves()).resolves.toBe(true);
  expect((await readAnnotationStore()).entries).toEqual({});
});
it('does not carry a failed annotation-save result across a learning-data reset', async () => {
  await switchLearningSyncAccount('A');
  const context = captureLearningWriteContext();
  jest.mocked(Storage.setItem).mockRejectedValueOnce(new Error('disk_busy'));
  await expect(saveNote('已放弃的数据')).rejects.toThrow('disk_busy');
  await applyPrivacyLearningDataReset({ dataGeneration: 1, aiResultGeneration: 1 });
  await expect(flushPendingAnnotationSaves(context)).resolves.toBe(false);
  await expect(flushPendingAnnotationSaves()).resolves.toBe(true);
  expect((await readAnnotationStore()).entries).toEqual({});
});
it('applies a pulled annotation document without waiting on its own running sync', async () => {
  await switchLearningSyncAccount('A');
  mockApiRequest.mockResolvedValue({ cursor: 1, hasMore: false, changes: [{ kind: 'document', entityKey: 'annotations', cursor: 1, version: 1, changedAt: history().createdAt, payload: { documentKey: 'annotations', document: noteStore('云端笔记'), version: 1, updatedAt: history().createdAt } }] });
  await runLearningSync('A');
  expect((await readAnnotationStore()).entries[annotationKey].note).toBe('云端笔记');
});

it('archives an accepted vocabulary write and outbox together before switching accounts', async () => {
  await switchLearningSyncAccount('A');
  const context = captureLearningWriteContext();
  let release!: () => void, entered!: () => void;
  const gate = new Promise<void>(done => { release = done; });
  const started = new Promise<void>(done => { entered = done; });
  const write = mutateVocabularyInCurrentWorkspace(context, async () => {
    entered(); await gate;
    return writeVocabularyState({ ...createEmptyVocabularyState(), words: { pilot: { status: 'known', favorite: true, updatedAt: '2026-10-16T00:00:00.000Z' } } });
  });
  await started;
  const swap = switchLearningSyncAccount('B');
  release(); await write; await swap;
  expect((await readVocabularyState()).words).toEqual({});
  expect((await getLearningSyncStatus()).pendingCount).toBe(0);
  await switchLearningSyncAccount('A');
  expect((await readVocabularyState()).words.pilot.favorite).toBe(true);
  expect((await getLearningSyncStatus()).pendingCount).toBe(1);
  await expect(mutateVocabularyInCurrentWorkspace(context, async () => createEmptyVocabularyState())).rejects.toThrow();
});

it('binds progress for a member identity without requiring its embedded text', async () => {
  const banks = repository.getEmbeddedQuestionBanks();
  const bank = banks[0], topic = bank.categories[0].topics[0];
  const cardId = topic.scopeCardIds!.all.find(id => !topic.cards.some(card => card.id === id))!;
  const load = jest.spyOn(repository, 'loadQuestionBank').mockImplementation(async id => ({ dataset: banks.find(bank => bank.id === id)!, source: 'embedded' }));
  const state = { completed: true, favorite: true, updatedAt: '2026-10-16T00:00:00.000Z' };
  mockValues.set(`icao.learning.v2.topic.${topic.id}`, JSON.stringify({ [cardId]: state }));
  mockApiRequest.mockImplementation(async (path: string, init?: RequestInit) => {
    if (path === '/v1/sync/push') {
      const body = JSON.parse(String(init?.body));
      return { cursor: 1, results: body.mutations.map((mutation: { mutationId: string }) => ({ mutationId: mutation.mutationId, status: 'accepted' })) };
    }
    return { changes: [], cursor: 1, hasMore: false };
  });
  try {
    await bindLearningSync('A', 'upload-local');
    const push = mockApiRequest.mock.calls.find(call => call[0] === '/v1/sync/push')!;
    expect(JSON.parse(push[1].body).mutations).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'card_state', payload: expect.objectContaining({ cardId, bankId: bank.id }) })]));
  } finally { load.mockRestore(); }
});

it('keeps the prior account isolated, claims guest records once, including complete review details', async () => {
  await switchLearningSyncAccount('A');
  await upsertLearningRecord(history()); await enqueueLearningRecord(history());
  await switchLearningSyncToGuest();
  expect(await getLearningRecords()).toEqual([]);
  const guest = { ...history(), id: 'guest-record', sessionId: 'guest-session' };
  await upsertLearningRecord(guest); await enqueueLearningRecord(guest);
  expect((await getLearningSyncStatus()).pendingCount).toBe(0);
  await switchLearningSyncAccount('B');
  expect((await getLearningRecords()).map(record => record.id)).toEqual(['guest-record']);
  expect((await loadLearningRecordReview(guest)).studyReview?.items).toHaveLength(1);
  await switchLearningSyncToGuest();
  expect(await getLearningRecords()).toEqual([]);
  await switchLearningSyncAccount('A');
  expect((await getLearningRecords()).map(record => record.id)).toEqual(['history-one']);
  await switchLearningSyncAccount('B');
  expect((await getLearningRecords()).map(record => record.id)).toEqual(['guest-record']);
  expect((await getLearningSyncStatus()).pendingCount).toBe(1);
});
it('retries an interrupted guest claim after the account workspace has already been restored', async () => {
  await switchLearningSyncToGuest();
  const stateKey = `icao.learning.v2.topic.${topic.id}`;
  const snapshot = { [stateKey]: JSON.stringify({ [card.id]: { visited: true, completed: false, note: '', updatedAt: '2026-10-25T00:00:00.000Z' } }) };
  await switchLearningSyncAccount('A');
  mockValues.set('icao.learning.v3.prebind.guest-claim.A', JSON.stringify(snapshot));
  await switchLearningSyncAccount('A');
  expect(JSON.parse(mockValues.get(stateKey)!)[card.id].visited).toBe(true);
  expect(mockValues.has('icao.learning.v3.prebind.guest-claim.A')).toBe(true);
  const count = (await getLearningSyncStatus()).pendingCount;
  await switchLearningSyncAccount('A');
  expect((await getLearningSyncStatus()).pendingCount).toBe(count);
});
it('merges guest vocabulary with the account by word timestamp and queues it once', async () => {
  await switchLearningSyncAccount('A');
  await writeVocabularyState({ ...createEmptyVocabularyState(), words: {
    pilot: { status: 'known', favorite: false, updatedAt: '2026-10-25T02:00:00.000Z' },
  } });
  await switchLearningSyncToGuest();
  await writeVocabularyState({ ...createEmptyVocabularyState(), words: {
    pilot: { status: 'wrong', favorite: true, updatedAt: '2026-10-25T01:00:00.000Z' },
    runway: { status: 'known', favorite: true, updatedAt: '2026-10-25T01:00:00.000Z' },
  } });
  await switchLearningSyncAccount('A');
  expect((await readVocabularyState()).words).toEqual({
    pilot: { status: 'known', favorite: false, updatedAt: '2026-10-25T02:00:00.000Z' },
    runway: { status: 'known', favorite: true, updatedAt: '2026-10-25T01:00:00.000Z' },
  });
  const count = (await getLearningSyncStatus()).pendingCount;
  expect(count).toBe(1);
  await switchLearningSyncAccount('A');
  expect((await getLearningSyncStatus()).pendingCount).toBe(count);
});
