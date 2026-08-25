import { getStudyBehavior } from '../lib/study-behavior';
import { completedCards, migrateLegacyCardState } from '../platform/learning-store';
import { getEmbeddedQuestionBanks } from '../data/repository';
import type { QuestionBankDataset, QuestionBankTopic } from '../types';

const datasets: QuestionBankDataset[] = [
  ['listening', 'choices', ['notes']],
  ['sentences900', 'speaking', ['mine', 'notes']],
  ['radiotelephony', 'speaking', ['mine', 'reference', 'notes']],
  ['opi', 'speaking', ['mine', 'reference', 'notes']],
  ['storytelling', 'retell', ['mine', 'notes']],
].map(([id, interaction, consoleTabs]) => ({
  id,
  title: id,
  nameEn: id,
  description: '',
  summary: '',
  enabled: true,
  statusLabel: '',
  icon: id === 'listening' ? 'headphones' : id === 'sentences900' ? 'sentences' : id === 'radiotelephony' ? 'radioTower' : id === 'opi' ? 'mic' : 'story',
  declaredTopicCount: 1,
  declaredCardCount: 1,
  categoryUnit: '类',
  topicUnit: '组',
  cardUnit: '题',
  study: {
    interaction,
    tools: { recorder: interaction !== 'choices', choices: interaction === 'choices', notes: true, dictionary: true, highlights: true, tags: true },
    copy: { transcriptLabel: '音频原文', referenceLabel: '参考答案' },
    audioTitlePattern: 'card-title',
    consoleTabs,
  },
  categories: [],
})) as QuestionBankDataset[];

describe('shared study engine', () => {
  it('derives five bank variants from one behavior registry', () => {
    const behaviors = datasets.map(getStudyBehavior);
    expect(behaviors.map((item) => item.taskKind)).toEqual(['choices', 'recording', 'recording', 'recording', 'recording']);
    expect(behaviors[1].reviewKind).toBe('exact-match');
    expect(behaviors[3].reviewKind).toBe('opi-analysis');
    expect(behaviors[4].recordingMode).toBe('retell');
  });

  it('routes every embedded bank through the shared behavior contract', () => {
    const behaviors = Object.fromEntries(
      getEmbeddedQuestionBanks().map((dataset) => [dataset.id, getStudyBehavior(dataset)]),
    );

    expect(Object.keys(behaviors).sort()).toEqual(['listening', 'opi', 'radiotelephony', 'sentences900', 'storytelling']);
    expect(behaviors.listening.taskKind).toBe('choices');
    expect([
      behaviors.listening.workbenchTabs,
      behaviors.sentences900.workbenchTabs,
      behaviors.radiotelephony.workbenchTabs,
      behaviors.opi.workbenchTabs,
      behaviors.storytelling.workbenchTabs,
    ]).toEqual([
      ['notes'],
      ['mine', 'notes'],
      ['mine', 'reference', 'notes'],
      ['mine', 'reference', 'notes'],
      ['mine', 'notes'],
    ]);
    expect(behaviors.radiotelephony.reviewKind).toBe('grammar');
    expect(behaviors.opi.generatedAudio).toBe(true);
    expect(behaviors.storytelling.recordingMode).toBe('retell');

    const storytelling = getEmbeddedQuestionBanks().find((dataset) => dataset.id === 'storytelling');
    const storytellingCards = storytelling?.categories.flatMap((category) => category.topics).flatMap((topic) => topic.cards) ?? [];
    expect(storytellingCards).toHaveLength(3);
    expect(storytellingCards.every((card) => !Object.hasOwn(card, 'referenceText'))).toBe(true);
  });

  it('never exposes a reference tab for listening, including a remotely misconfigured dataset', () => {
    const listening: QuestionBankDataset = { ...datasets[0], study: { ...datasets[0].study, consoleTabs: ['reference', 'notes'] } };
    expect(getStudyBehavior(listening).workbenchTabs).toEqual(['notes']);
  });

  it('does not migrate visit-only legacy state as completed', () => {
    expect(migrateLegacyCardState({ visited: true, note: '', updatedAt: '2026-07-12T00:00:00.000Z' }).completed).toBe(false);
    expect(migrateLegacyCardState({ visited: true, recorded: true, note: '', updatedAt: '2026-07-12T00:00:00.000Z' }).completed).toBe(true);
    expect(migrateLegacyCardState({ visited: true, tagIds: ['good'], note: '', updatedAt: '2026-07-12T00:00:00.000Z' }).completed).toBe(true);
  });

  it('counts durable completion instead of visits', () => {
    const topic = {
      id: 'topic', name: 'Topic', declaredCardCount: 2,
      cards: [
        { id: 'a', taskTitle: 'A', audioText: 'A' },
        { id: 'b', taskTitle: 'B', audioText: 'B' },
      ],
    } satisfies QuestionBankTopic;
    const states = {
      a: { visited: true, completed: false, note: '', updatedAt: '2026-07-12T00:00:00.000Z' },
      b: { visited: true, completed: true, note: '', updatedAt: '2026-07-12T00:00:00.000Z' },
    };
    expect(completedCards(topic.cards, states)).toBe(1);
  });
});
