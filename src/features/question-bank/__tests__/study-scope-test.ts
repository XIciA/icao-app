import hotspots from '../../../../content/question-banks/opi-hotspots.json';
import { studyScopeCardIds } from '@icao/contracts';
import data from '../data/question-bank.json';
import publicData from '../data/question-bank-public.json';
import { EXAM_GOALS } from '@/features/account/profile-model';
import { scopeDataset, scopeTopic } from '../lib/study-scope';
import type { QuestionBankDataset, QuestionBankTopic } from '../types';

const topic: QuestionBankTopic = { id: 'private-topic', name: '测试', declaredCardCount: 3, cards: [
  { id: 'all', taskTitle: '全', audioText: 'full' },
  { id: 'selected', taskTitle: '精', audioText: 'selected', studyTier: 1 },
  { id: 'crash', taskTitle: '冲', audioText: 'crash', studyTier: 2 },
] };

it('keeps every shipped scope nested and public directory counts equal to the full bank', () => {
  for (const bank of data as QuestionBankDataset[]) {
    const publicBank = (publicData as QuestionBankDataset[]).find((item) => item.id === bank.id)!;
    for (const goal of EXAM_GOALS) {
      const ids = new Map<string, Set<string>>();
      for (const scope of ['all', 'selected', 'crash'] as const) {
        const projected = scopeDataset(bank, scope, goal.id);
        const projectedPublic = scopeDataset(publicBank, scope, goal.id);
        expect(projectedPublic.declaredCardCount).toBe(projected.declaredCardCount);
        expect(projectedPublic.summary).toBe(projected.summary);
        const cards = projected.categories.flatMap((category) => category.topics.flatMap((item) => item.cards));
        expect(cards).toHaveLength(projected.declaredCardCount);
        ids.set(scope, new Set(cards.map((card) => card.id)));
      }
      for (const id of ids.get('selected')!) expect(ids.get('all')!.has(id)).toBe(true);
      for (const id of ids.get('crash')!) expect(ids.get('selected')!.has(id)).toBe(true);
    }
  }
});

it('ships the agreed crash practice units, counting full radio scenes and spoken OPI questions', () => {
  const banks = data as QuestionBankDataset[];
  const crash = (id: string) => scopeDataset(banks.find((bank) => bank.id === id)!, 'crash', 'icao5-first');
  const listening = crash('listening').categories.flatMap((category) => category.topics);
  expect(listening).toHaveLength(4);
  expect(listening.map((item) => item.cards.length)).toEqual([22, 23, 22, 24]);
  const radio = crash('radiotelephony').categories.flatMap((category) => category.topics);
  expect(crash('radiotelephony').summary).toBe('30 场景＋9 专项 / 614 卡');
  expect(radio.filter((item) => item.practiceKind !== 'scoring-points')).toHaveLength(30);
  expect(radio.filter((item) => item.practiceKind === 'scoring-points').length).toBeGreaterThan(0);
  expect(crash('storytelling').declaredCardCount).toBe(20);
  const opi = crash('opi').categories.flatMap((category) => category.topics.flatMap((item) => item.cards));
  const opiIds = new Set(opi.map((card) => card.id));
  for (const brief of hotspots.briefs) for (const topic of brief.topics) {
    for (const id of topic.cardIds) expect(opiIds.has(id)).toBe(true);
  }
});

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
