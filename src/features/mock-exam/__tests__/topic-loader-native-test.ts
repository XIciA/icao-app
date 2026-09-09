/* eslint-disable import/first */
import type {
  QuestionBankCategory,
  QuestionBankDataset,
  QuestionBankTopic,
} from '@/features/question-bank/types';

const mockGetTopic = jest.fn();
const mockGetDataset = jest.fn();

jest.mock('@/features/question-bank/data/repository.native', () => ({
  questionBankRepository: {
    getDataset: (...args: unknown[]) => mockGetDataset(...args),
    getTopic: (...args: unknown[]) => mockGetTopic(...args),
  },
}));
jest.mock('@/features/question-bank/data/repository', () => ({
  questionBankRepository: {
    getDataset: (...args: unknown[]) => mockGetDataset(...args),
    getTopic: (...args: unknown[]) => mockGetTopic(...args),
  },
}));

import { buildMockExamSession } from '../build-session';
import { hydrateMockExamTopic, mockExamTopicCardCount } from '../topic-loader.native';

const publicTopic: QuestionBankTopic = {
  id: 'atc-scenario-0004',
  name: '会员套题',
  declaredCardCount: 15,
  cards: [],
  access: { level: 'member', availableCardCount: 0, declaredCardCount: 15 },
};
const category: QuestionBankCategory = {
  id: 'atc-qfa',
  name: 'QFA',
  declaredTopicCount: 1,
  declaredCardCount: 15,
  topics: [publicTopic],
};
const dataset = {
  id: 'radiotelephony',
  title: '陆空通话',
  nameEn: 'Radiotelephony',
  description: '',
  summary: '',
  enabled: true,
  statusLabel: '',
  icon: 'radioTower',
  declaredTopicCount: 1,
  declaredCardCount: 15,
  categoryUnit: '组',
  topicUnit: '套',
  cardUnit: '题',
  study: {
    interaction: 'speaking',
    tools: { recorder: true, choices: false, notes: true, dictionary: true, highlights: true, tags: true },
    copy: { transcriptLabel: '题目', referenceLabel: '参考' },
    audioTitlePattern: 'card-title',
    consoleTabs: ['mine', 'reference', 'notes'],
  },
  categories: [category],
  access: {
    policyVersion: 'content-access-v2',
    environment: 'production',
    membershipActive: true,
    membershipExpiresAt: '2026-09-25T00:00:00.000Z',
  },
} satisfies QuestionBankDataset;

describe('Native mock-exam topic hydration', () => {
  beforeEach(() => {
    mockGetDataset.mockReset();
    mockGetTopic.mockReset();
  });

  it('uses declared member counts for selection and hydrates only the selected topic', async () => {
    const hydrated = {
      ...publicTopic,
      cards: Array.from({ length: 15 }, (_, index) => ({
        id: `atc-member-${index + 1}`,
        taskTitle: `题目 ${index + 1}`,
        audioText: `Member ${index + 1}`,
      })),
    } satisfies QuestionBankTopic;
    mockGetTopic.mockResolvedValue(hydrated);

    expect(mockExamTopicCardCount(dataset, publicTopic)).toBe(15);
    await expect(hydrateMockExamTopic(dataset, category, publicTopic)).resolves.toBe(hydrated);
    expect(mockGetTopic).toHaveBeenCalledTimes(1);
    expect(mockGetTopic).toHaveBeenCalledWith('radiotelephony', 'atc-qfa', 'atc-scenario-0004', undefined);
  });

  it('keeps free users on the public cards without requesting member content', async () => {
    const freeDataset: QuestionBankDataset = {
      ...dataset,
      access: { ...dataset.access!, membershipActive: false, membershipExpiresAt: null },
    };

    expect(mockExamTopicCardCount(freeDataset, publicTopic)).toBe(0);
    await expect(hydrateMockExamTopic(freeDataset, category, publicTopic)).resolves.toBe(publicTopic);
    expect(mockGetTopic).not.toHaveBeenCalled();
  });

  it('hydrates only the member topics selected by the complete mock-exam rules', async () => {
    const opiTopic: QuestionBankTopic = {
      id: 'opi-topic-0004',
      name: '会员 OPI',
      declaredCardCount: 5,
      cards: [],
      access: { level: 'member', availableCardCount: 0, declaredCardCount: 5 },
    };
    const opiDataset: QuestionBankDataset = {
      ...dataset,
      id: 'opi',
      title: 'OPI',
      nameEn: 'OPI',
      icon: 'mic',
      declaredCardCount: 5,
      categories: [{
        id: 'opi-category-01',
        name: '特情',
        declaredTopicCount: 1,
        declaredCardCount: 5,
        topics: [opiTopic],
      }],
    };
    mockGetDataset.mockImplementation(async (bankId: string) => (
      bankId === 'radiotelephony' ? dataset : bankId === 'opi' ? opiDataset : undefined
    ));
    mockGetTopic.mockImplementation(async (bankId: string) => {
      const source = bankId === 'radiotelephony' ? publicTopic : opiTopic;
      return {
        ...source,
        cards: Array.from({ length: source.declaredCardCount }, (_, index) => ({
          id: `${bankId}-member-${index + 1}`,
          taskTitle: `题目 ${index + 1}`,
          audioText: `Member ${index + 1}`,
        })),
      } satisfies QuestionBankTopic;
    });

    const session = await buildMockExamSession({
      examType: 'icao4-recert',
      modules: ['radiotelephony', 'opi'],
    }, 17);

    expect(session.mode).toBe('complete');
    expect(session.sections.map((section) => [section.moduleId, section.items.length])).toEqual([
      ['radiotelephony', 15],
      ['opi', 5],
    ]);
    expect(mockGetTopic.mock.calls).toEqual([
      ['radiotelephony', 'atc-qfa', 'atc-scenario-0004'],
      ['opi', 'opi-category-01', 'opi-topic-0004'],
    ]);
    expect(session.items.every((item) => item.card.id.includes('-member-'))).toBe(true);
  });
});
