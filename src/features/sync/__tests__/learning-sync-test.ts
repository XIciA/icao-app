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

import { getEmbeddedQuestionBanks } from '@/features/question-bank/data/repository';
import type { CardLearningState, LearningRecord } from '@/features/question-bank/types';
import { VOCABULARY_STORAGE_KEY } from '@/features/vocabulary/persistence';
import type { VocabularyState } from '@/features/vocabulary/types';

import {
  archiveAndBindEmptyLearningSync,
  bindLearningSync,
  enqueueCardState,
  enqueueLearningRecord,
  enqueueVocabularyDocument,
  getLearningSyncStatus,
  inspectLearningSyncBinding,
  resetLearningSyncForTests,
  runLearningSync,
  setLearningSyncActiveUser,
} from '../learning-sync';

const bank = getEmbeddedQuestionBanks()[0]!;
const topic = bank.categories[0]!.topics[0]!;
const card = topic.cards[0]!;
const state: CardLearningState = {
  visited: true,
  completed: true,
  note: '',
  updatedAt: '2026-07-12T00:00:00.000Z',
};
const vocabularyState: VocabularyState = {
  schemaVersion: 1,
  words: { 'preview-0001': { status: 'known', favorite: false, updatedAt: '2026-07-13T00:00:00.000Z' } },
  updatedAt: '2026-07-13T00:00:00.000Z',
};

function learningRecord(transcript: string, updatedAt: string): LearningRecord {
  return {
    schemaVersion: 3,
    id: 'study-session-card-1',
    sessionId: 'study-session',
    cardId: card.id,
    bankId: bank.id,
    bankTitle: bank.title,
    categoryTitle: bank.categories[0]!.name,
    topicTitle: topic.name,
    completedCount: 1,
    totalCount: 1,
    correctCount: 0,
    durationSeconds: 5,
    reason: 'complete',
    createdAt: '2026-07-15T00:00:00.000Z',
    updatedAt,
    recordType: 'ai_result',
    aiResult: { questionId: card.id, transcript },
  };
}

describe('learning sync', () => {
  beforeEach(() => {
    mockValues.clear();
    mockApiRequest.mockReset();
    resetLearningSyncForTests();
  });

  afterEach(() => resetLearningSyncForTests());

  it('requires confirmation for unowned local data and preserves a pre-bind snapshot', async () => {
    mockValues.set(`icao.learning.v2.topic.${topic.id}`, JSON.stringify({ [card.id]: state }));
    expect(await inspectLearningSyncBinding('user-1')).toMatchObject({ hasLocalData: true, needsConfirmation: true });
    mockApiRequest.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === '/v1/sync/push') {
        const body = JSON.parse(String(init?.body)) as { mutations: { mutationId: string }[] };
        return { cursor: 1, results: body.mutations.map((mutation) => ({ mutationId: mutation.mutationId, status: 'accepted' })) };
      }
      return { changes: [], cursor: 1, hasMore: false };
    });

    const status = await bindLearningSync('user-1', 'upload-local');
    expect(status).toMatchObject({ boundUserId: 'user-1', pendingCount: 0, cursor: 1 });
    expect(Array.from(mockValues.keys()).some((key) => key.startsWith('icao.learning.v3.prebind.user-1.'))).toBe(true);
    expect(mockValues.has(`icao.learning.v2.topic.${topic.id}`)).toBe(true);
  });

  it('retains the outbox and local state when the network fails', async () => {
    mockValues.set('icao.learning.v3.sync.meta', JSON.stringify({ schemaVersion: 3, boundUserId: 'user-1', cursor: 0, versions: {} }));
    mockApiRequest.mockRejectedValue(new Error('network_unavailable'));
    await enqueueCardState(topic.id, card.id, state);

    await expect(runLearningSync('user-1')).rejects.toThrow('network_unavailable');
    expect(await getLearningSyncStatus()).toMatchObject({ pendingCount: 1, lastError: 'network_unavailable' });
  });

  it('treats vocabulary progress as personal data and collapses rapid document updates', async () => {
    mockValues.set(VOCABULARY_STORAGE_KEY, JSON.stringify(vocabularyState));
    expect(await inspectLearningSyncBinding('user-1')).toMatchObject({ hasLocalData: true, needsConfirmation: true });
    mockValues.set('icao.learning.v3.sync.meta', JSON.stringify({ schemaVersion: 3, boundUserId: 'user-1', cursor: 0, versions: {} }));

    await enqueueVocabularyDocument(vocabularyState);
    await enqueueVocabularyDocument({ ...vocabularyState, words: { ...vocabularyState.words, 'preview-0002': { status: 'vague', favorite: true, updatedAt: '2026-07-13T00:01:00.000Z' } }, updatedAt: '2026-07-13T00:01:00.000Z' });

    expect(await getLearningSyncStatus()).toMatchObject({ pendingCount: 1 });
    const outbox = JSON.parse(mockValues.get('icao.learning.v3.sync.outbox') ?? '[]') as { kind: string; payload: { documentKey: string; document: VocabularyState } }[];
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({ kind: 'document', payload: { documentKey: 'vocabulary', document: { words: { 'preview-0002': { status: 'vague', favorite: true } } } } });
  });

  it('collapses rapid answer saves into one latest version', async () => {
    mockValues.set('icao.learning.v3.sync.meta', JSON.stringify({ schemaVersion: 3, boundUserId: 'user-1', cursor: 0, versions: {} }));

    await enqueueLearningRecord(learningRecord('first', '2026-07-15T00:00:01.000Z'));
    await enqueueLearningRecord(learningRecord('latest', '2026-07-15T00:00:02.000Z'));

    expect(await getLearningSyncStatus()).toMatchObject({ pendingCount: 1 });
    const outbox = JSON.parse(mockValues.get('icao.learning.v3.sync.outbox') ?? '[]') as { payload: { record: LearningRecord; version: number } }[];
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({ payload: { version: 2, record: { aiResult: { transcript: 'latest' } } } });
  });

  it('does not lose a newer answer enqueued while an older push is in flight', async () => {
    mockValues.set('icao.learning.v3.sync.meta', JSON.stringify({ schemaVersion: 3, boundUserId: 'user-1', cursor: 0, versions: {} }));
    await enqueueLearningRecord(learningRecord('first', '2026-07-15T00:00:01.000Z'));
    let releaseFirstPush!: () => void;
    let signalFirstPush!: () => void;
    const firstPushStarted = new Promise<void>((resolve) => { signalFirstPush = resolve; });
    const firstPushGate = new Promise<void>((resolve) => { releaseFirstPush = resolve; });
    const pushedTranscripts: string[] = [];
    let pushCount = 0;
    mockApiRequest.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === '/v1/sync/push') {
        pushCount += 1;
        const body = JSON.parse(String(init?.body)) as { mutations: { mutationId: string; payload: { record: LearningRecord } }[] };
        pushedTranscripts.push(body.mutations[0]!.payload.record.aiResult!.transcript);
        if (pushCount === 1) {
          signalFirstPush();
          await firstPushGate;
        }
        return { cursor: pushCount, results: body.mutations.map((mutation) => ({ mutationId: mutation.mutationId, status: 'accepted' })) };
      }
      return { changes: [], cursor: pushCount, hasMore: false };
    });

    const sync = runLearningSync('user-1');
    await firstPushStarted;
    await enqueueLearningRecord(learningRecord('latest', '2026-07-15T00:00:02.000Z'));
    releaseFirstPush();
    await sync;

    expect(pushedTranscripts).toEqual(['first', 'latest']);
    expect(await getLearningSyncStatus()).toMatchObject({ pendingCount: 0, cursor: 2 });
  });

  it('never sends a bound account outbox with a different active account', async () => {
    mockValues.set('icao.learning.v3.sync.meta', JSON.stringify({ schemaVersion: 3, boundUserId: 'user-1', cursor: 0, versions: {} }));
    setLearningSyncActiveUser('user-1');
    await enqueueLearningRecord(learningRecord('private answer', '2026-07-15T00:00:01.000Z'));

    setLearningSyncActiveUser('user-2');
    await runLearningSync();

    expect(mockApiRequest).not.toHaveBeenCalled();
    expect(await getLearningSyncStatus()).toMatchObject({ boundUserId: 'user-1', pendingCount: 1 });
  });

  it('pushes an answer enqueued while pull is in flight before the run completes', async () => {
    mockValues.set('icao.learning.v3.sync.meta', JSON.stringify({ schemaVersion: 3, boundUserId: 'user-1', cursor: 0, versions: {} }));
    setLearningSyncActiveUser('user-1');
    let releaseFirstPull!: () => void;
    let signalFirstPull!: () => void;
    const firstPullStarted = new Promise<void>((resolve) => { signalFirstPull = resolve; });
    const firstPullGate = new Promise<void>((resolve) => { releaseFirstPull = resolve; });
    let pullCount = 0;
    let pushCount = 0;
    mockApiRequest.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === '/v1/sync/push') {
        pushCount += 1;
        const body = JSON.parse(String(init?.body)) as { ownerUserId: string; mutations: { mutationId: string }[] };
        expect(body.ownerUserId).toBe('user-1');
        return { cursor: 1, results: body.mutations.map((mutation) => ({ mutationId: mutation.mutationId, status: 'accepted' })) };
      }
      pullCount += 1;
      if (pullCount === 1) {
        signalFirstPull();
        await firstPullGate;
      }
      return { changes: [], cursor: pushCount, hasMore: false };
    });

    const sync = runLearningSync('user-1');
    await firstPullStarted;
    await enqueueLearningRecord(learningRecord('during pull', '2026-07-15T00:00:01.000Z'));
    releaseFirstPull();
    await sync;

    expect(pushCount).toBe(1);
    expect(pullCount).toBe(2);
    expect(await getLearningSyncStatus()).toMatchObject({ pendingCount: 0, cursor: 1 });
  });

  it('archives unowned data and starts the account from cloud state', async () => {
    mockValues.set(`icao.learning.v2.topic.${topic.id}`, JSON.stringify({ [card.id]: state }));
    mockValues.set('icao.learning.v1.records', JSON.stringify([{ id: 'legacy-record' }]));
    mockApiRequest.mockResolvedValue({ changes: [], cursor: 0, hasMore: false });

    const status = await archiveAndBindEmptyLearningSync('user-2');

    expect(status).toMatchObject({ boundUserId: 'user-2', pendingCount: 0 });
    expect(mockValues.has(`icao.learning.v2.topic.${topic.id}`)).toBe(false);
    expect(mockValues.has('icao.learning.v1.records')).toBe(false);
    expect(Array.from(mockValues.keys()).some((key) => key.startsWith('icao.learning.v3.prebind.archive.'))).toBe(true);
  });
});
