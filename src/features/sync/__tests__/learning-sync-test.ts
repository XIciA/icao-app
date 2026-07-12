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
import type { CardLearningState } from '@/features/question-bank/types';

import {
  bindLearningSync,
  enqueueCardState,
  getLearningSyncStatus,
  inspectLearningSyncBinding,
  resetLearningSyncForTests,
  runLearningSync,
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
});
