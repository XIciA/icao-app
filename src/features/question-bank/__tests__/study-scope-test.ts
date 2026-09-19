import { studyScopeCardIds } from '@icao/contracts';
import data from '../data/question-bank.json';
import { EXAM_GOALS } from '@/features/account/profile-model';
import { scopeDataset, scopeTopic } from '../lib/study-scope';
import type { QuestionBankDataset, QuestionBankTopic } from '../types';

const topic: QuestionBankTopic = { id: 'private-topic', name: '测试', declaredCardCount: 3, cards: [
  { id: 'all', taskTitle: '全', audioText: 'full' },
  { id: 'selected', taskTitle: '精', audioText: 'selected', studyTier: 1 },
  { id: 'crash', taskTitle: '冲', audioText: 'crash', studyTier: 2 },
] };

it('enforces nested membership without copying or mutating questions', () => {
  const selected = scopeTopic('listening', topic, 'selected');
  const crash = scopeTopic('listening', topic, 'crash');
  expect(selected.cards.map((card) => card.id)).toEqual(['selected', 'crash']);
  expect(crash.cards).toEqual([topic.cards[2]]);
  expect(crash.cards[0]).toBe(selected.cards[1]);
  expect(topic.cards).toHaveLength(3);
});

it('counts protected selected questions without returning their text in a public catalog', () => {
  const catalog = { ...topic, scopeCardIds: studyScopeCardIds('listening', topic), cards: [], access: { level: 'member' as const, availableCardCount: 0, declaredCardCount: 3 } };
  const selected = scopeTopic('listening', catalog, 'selected');
  expect(selected.declaredCardCount).toBe(2);
  expect(selected.cards).toEqual([]);
  expect(selected.access).toEqual({ level: 'member', availableCardCount: 0, declaredCardCount: 2 });
});

it('keeps a complete scenario and all its ordered cards together', () => {
  const scenario = { ...topic, studyTier: 2 as const };
  expect(scopeTopic('radiotelephony', scenario, 'crash').cards).toEqual(topic.cards);
  expect(studyScopeCardIds('radiotelephony', scenario).selected).toEqual(['all', 'selected', 'crash']);
});

it.each(EXAM_GOALS.flatMap((goal) => ['all', 'selected', 'crash'].map((scope) => [goal.id, scope] as const)))('keeps goal %s independent of scope %s', (target, scope) => {
  for (const bank of data as QuestionBankDataset[]) {
    const projected = scopeDataset(bank, scope as 'all' | 'selected' | 'crash', target);
    const applicable = (EXAM_GOALS.find((goal) => goal.id === target)!.banks as readonly string[]).includes(bank.id);
    if (!applicable) expect(projected.categories).toEqual([]);
    if (bank.id === 'sentences900' && applicable) {
      const expected = bank.categories.filter((category) => target !== 'icao4-first' || category.name !== '5级');
      expect(projected.categories.map((category) => category.id)).toEqual(expected.map((category) => category.id));
      expect(projected.declaredCardCount).toBe(expected.reduce((sum, category) => sum + category.declaredCardCount, 0));
    }
  }
});
