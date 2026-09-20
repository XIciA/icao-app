/* eslint-disable import/first */
import type { QuestionBankDataset, QuestionBankTopic } from '@/features/question-bank/types';

const mockGetTopic = jest.fn();

jest.mock('@/features/question-bank/data/repository.native', () => ({
  questionBankRepository: { getTopic: (...args: unknown[]) => mockGetTopic(...args) },
}));
jest.mock('@/features/question-bank/data/repository', () => ({
  questionBankRepository: { getTopic: (...args: unknown[]) => mockGetTopic(...args) },
}));

import { hydrateRadioCatalogDatasets, hydrateRadioCatalogTopic, nextRadioCatalogTopic } from '../catalog-hydration.native';
import { deriveRadioCatalogs } from '../catalog.native';

const publicTopic: QuestionBankTopic = {
  id: 'listening-topic-01',
  name: '全部题目',
  declaredCardCount: 2,
  cards: [{
    id: 'listening-main-001',
    taskTitle: '公开题目',
    audioText: 'Free',
    audio: '/question-bank-assets/audio/listening/main/001.mp3',
    audioDurationSeconds: 10,
  }],
  access: { level: 'member', availableCardCount: 1, declaredCardCount: 2 },
};
const dataset = {
  id: 'listening',
  title: '听力',
  nameEn: 'Listening',
  description: '',
  summary: '',
  enabled: true,
  statusLabel: '',
  icon: 'headphones',
  declaredTopicCount: 1,
  declaredCardCount: 2,
  categoryUnit: '模块',
  topicUnit: '题组',
  cardUnit: '题',
  study: {
    interaction: 'choices',
    tools: { recorder: false, choices: true, notes: true, dictionary: true, highlights: true, tags: true },
    copy: { transcriptLabel: '题目', referenceLabel: '参考' },
    audioTitlePattern: 'card-title',
    consoleTabs: ['mine', 'reference', 'notes'],
  },
  capabilities: { audioMode: 'file', reviewMode: 'exact-match', radioEligible: true, mockExamEligible: true },
  categories: [{
    id: 'listening-category-01',
    name: '10s航空英语',
    declaredTopicCount: 1,
    declaredCardCount: 2,
    topics: [publicTopic],
  }],
  access: {
    policyVersion: 'content-access-v2',
    environment: 'production',
    membershipActive: true,
    membershipExpiresAt: '2026-09-25T00:00:00.000Z',
  },
} satisfies QuestionBankDataset;

describe('Native radio catalog hydration', () => {
  beforeEach(() => mockGetTopic.mockReset());

  it('uses the same nested scope and examination-goal projection as daily study', () => {
    const full = { ...dataset, categories: [{ ...dataset.categories[0], topics: [{ ...publicTopic, cards: [
      { ...publicTopic.cards[0], id: 'all', studyTier: 0 as const },
      { ...publicTopic.cards[0], id: 'selected', studyTier: 1 as const },
      { ...publicTopic.cards[0], id: 'crash', studyTier: 2 as const },
    ] }] }] };
    expect(deriveRadioCatalogs([full], { scope: 'selected', target: 'icao4-first' })[0].tracks.map((track) => track.id)).toEqual(['selected', 'crash']);
    expect(deriveRadioCatalogs([full], { scope: 'crash', target: 'icao4-first' })[0].tracks.map((track) => track.id)).toEqual(['crash']);
    expect(deriveRadioCatalogs([full], { scope: 'all', target: 'icao4-recert' })).toEqual([]);
  });

  it('adds authorized member tracks through the topic repository', async () => {
    const hydrated = {
      ...publicTopic,
      cards: [
        ...publicTopic.cards,
        {
          id: 'listening-main-999',
          taskTitle: '会员题目',
          audioText: 'Member',
          audio: '/question-bank-assets/audio/listening/main/999.mp3',
          audioDurationSeconds: 12,
        },
      ],
    } satisfies QuestionBankTopic;
    mockGetTopic.mockResolvedValue(hydrated);

    const [hydratedDataset] = await hydrateRadioCatalogTopic(
      [dataset],
      'listening',
      'listening-category-01',
      'listening-topic-01',
    );
    const catalogs = deriveRadioCatalogs([hydratedDataset]);

    expect(catalogs[0]?.tracks.map((track) => track.id)).toEqual([
      'listening-main-001',
      'listening-main-999',
    ]);
    expect(mockGetTopic).toHaveBeenCalledWith('listening', 'listening-category-01', 'listening-topic-01', undefined);
  });

  it('keeps only public tracks for a free user and never requests a member topic', async () => {
    const freeDataset: QuestionBankDataset = {
      ...dataset,
      access: { ...dataset.access!, membershipActive: false, membershipExpiresAt: null },
    };

    const [hydratedDataset] = await hydrateRadioCatalogTopic(
      [freeDataset],
      'listening',
      'listening-category-01',
      'listening-topic-01',
    );
    const catalogs = deriveRadioCatalogs([hydratedDataset]);

    expect(catalogs[0]?.tracks.map((track) => track.id)).toEqual(['listening-main-001']);
    expect(mockGetTopic).not.toHaveBeenCalled();
  });

  it('falls back to the public catalog when a member topic cannot be refreshed', async () => {
    mockGetTopic.mockRejectedValue(new Error('offline'));

    const [hydratedDataset] = await hydrateRadioCatalogTopic(
      [dataset],
      'listening',
      'listening-category-01',
      'listening-topic-01',
    );
    const catalogs = deriveRadioCatalogs([hydratedDataset]);

    expect(catalogs[0]?.tracks.map((track) => track.id)).toEqual(['listening-main-001']);
  });

  it('does not request unrelated member topics while hydrating the selected queue topic', async () => {
    const otherTopic: QuestionBankTopic = {
      ...publicTopic,
      id: 'listening-topic-02',
      cards: [],
    };
    const multipleTopics: QuestionBankDataset = {
      ...dataset,
      categories: [{ ...dataset.categories[0], topics: [publicTopic, otherTopic] }],
    };
    mockGetTopic.mockResolvedValue({
      ...publicTopic,
      cards: [...publicTopic.cards, {
        id: 'listening-main-999',
        taskTitle: '会员题目',
        audioText: 'Member',
        audio: '/question-bank-assets/audio/listening/main/999.mp3',
      }],
    });

    const [hydrated] = await hydrateRadioCatalogTopic(
      [multipleTopics],
      'listening',
      'listening-category-01',
      'listening-topic-01',
    );

    expect(mockGetTopic).toHaveBeenCalledTimes(1);
    expect(mockGetTopic).toHaveBeenCalledWith('listening', 'listening-category-01', 'listening-topic-01', undefined);
    expect(hydrated.categories[0].topics[1]).toEqual(otherTopic);
  });

  it('makes a zero-public-card member topic reachable as the next ordered topic', async () => {
    const lockedTopic: QuestionBankTopic = {
      ...publicTopic,
      id: 'listening-topic-02',
      name: '仅会员题组',
      cards: [],
      declaredCardCount: 1,
      access: { level: 'member', availableCardCount: 0, declaredCardCount: 1 },
    };
    const multipleTopics: QuestionBankDataset = {
      ...dataset,
      categories: [{ ...dataset.categories[0], topics: [publicTopic, lockedTopic] }],
    };
    const nextTopic = nextRadioCatalogTopic([multipleTopics], {
      bankId: 'listening',
      categoryId: 'listening-category-01',
      topicId: 'listening-topic-01',
    });
    mockGetTopic.mockResolvedValue({
      ...lockedTopic,
      cards: [{
        id: 'listening-main-999',
        taskTitle: '会员题目',
        audioText: 'Member',
        audio: '/question-bank-assets/audio/listening/main/999.mp3',
      }],
      access: { level: 'member', availableCardCount: 1, declaredCardCount: 1 },
    });

    expect(nextTopic).toEqual({
      bankId: 'listening',
      categoryId: 'listening-category-01',
      topicId: 'listening-topic-02',
    });
    const [hydrated] = await hydrateRadioCatalogTopic(
      [multipleTopics],
      nextTopic!.bankId,
      nextTopic!.categoryId,
      nextTopic!.topicId,
    );
    expect(deriveRadioCatalogs([hydrated])[0]?.tracks.map((track) => track.id)).toContain('listening-main-999');
    expect(mockGetTopic).toHaveBeenCalledWith('listening', 'listening-category-01', 'listening-topic-02', undefined);
  });

  it('hydrates the selected topic against the exact catalog release already used by the queue', async () => {
    const contentRelease = { bankId: 'listening', version: 2, checksum: 'ab'.repeat(32) };
    mockGetTopic.mockResolvedValue({ ...publicTopic, cards: publicTopic.cards });
    await hydrateRadioCatalogTopic([{ ...dataset, contentRelease } as QuestionBankDataset], 'listening', 'listening-category-01', 'listening-topic-01');
    expect(mockGetTopic).toHaveBeenCalledWith('listening', 'listening-category-01', 'listening-topic-01', contentRelease);
  });
});


describe('complete authorized radio directory', () => {
  beforeEach(() => mockGetTopic.mockReset());
  const topics = Array.from({ length: 6 }, (_, index) => ({ ...publicTopic, id: `topic-${index}`, cards: [] }));
  const bank = { ...dataset, categories: [{ ...dataset.categories[0], topics }] };

  it('hydrates empty protected topics with bounded concurrency without mutating the public input', async () => {
    let active = 0; let maximum = 0;
    mockGetTopic.mockImplementation(async (_bank, _category, id) => {
      active += 1; maximum = Math.max(maximum, active);
      await Promise.resolve(); active -= 1;
      return { ...publicTopic, id, cards: [publicTopic.cards[0], { ...publicTopic.cards[0], id: `${id}-member` }] };
    });
    const full = await hydrateRadioCatalogDatasets([bank]);
    expect(mockGetTopic).toHaveBeenCalledTimes(6);
    expect(maximum).toBeLessThanOrEqual(3);
    expect(deriveRadioCatalogs(full)[0].tracks).toHaveLength(12);
    expect(topics.every(topic => topic.cards.length === 0)).toBe(true);
  });

  it('never expands membership content for free accounts', async () => {
    await hydrateRadioCatalogDatasets([{ ...bank, access: { ...bank.access, membershipActive: false } }]);
    expect(mockGetTopic).not.toHaveBeenCalled();
  });

  it.each([undefined, { ...publicTopic, id: 'wrong-topic' }, { ...publicTopic, id: 'topic-0' }])('rejects missing, wrong or partial topics instead of publishing misleading queue counts', async topic => {
    mockGetTopic.mockResolvedValue(topic);
    await expect(hydrateRadioCatalogDatasets([bank])).rejects.toThrow('radio_topic_unavailable');
    expect(topics.every(item => item.cards.length === 0)).toBe(true);
  });

  it('rejects a result when account ownership changes during the request', async () => {
    let current = true;
    mockGetTopic.mockImplementation(async (_bank, _category, id) => {
      current = false;
      return { ...publicTopic, id, cards: [publicTopic.cards[0], publicTopic.cards[0]] };
    });
    await expect(hydrateRadioCatalogDatasets([bank], () => { if (!current) throw new Error('content_account_changed'); })).rejects.toThrow('content_account_changed');
    expect(topics.every(item => item.cards.length === 0)).toBe(true);
  });
});
