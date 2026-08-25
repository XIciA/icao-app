import { questionBankRepository } from '@/features/question-bank/data/repository.native';
import type {
  QuestionBankCard,
  QuestionBankCategory,
  QuestionBankDataset,
  QuestionBankId,
  QuestionBankStudyPackage,
  QuestionBankTopic,
} from '@/features/question-bank/types';

import {
  MOCK_EXAM_MODULE_LABELS,
  MOCK_EXAM_MODULE_ORDER,
  MOCK_EXAM_MODULES,
  MOCK_EXAM_TYPE_LABELS,
} from './rules';
import { hydrateMockExamTopic, mockExamTopicCardCount } from './topic-loader.native';
import type { MockExamConfig, MockExamModuleId, MockExamSection, MockExamSession } from './types';

function random(seed: number) { let state = seed >>> 0; return () => { state += 0x6d2b79f5; let value = state; value = Math.imul(value ^ (value >>> 15), value | 1); value ^= value + Math.imul(value ^ (value >>> 7), value | 61); return ((value ^ (value >>> 14)) >>> 0) / 4294967296; }; }
function sample<T>(items: readonly T[], count: number, next: () => number) {
  if (items.length < count) throw new Error(`题库数量不足：需要 ${count} 题，当前只有 ${items.length} 题。`);
  const pool = [...items];
  for (let index = 0; index < count; index += 1) { const swap = index + Math.floor(next() * (pool.length - index)); [pool[index], pool[swap]] = [pool[swap], pool[index]]; }
  return pool.slice(0, count);
}
function category(dataset: QuestionBankDataset, name: string) { const value = dataset.categories.find((item) => item.name === name); if (!value) throw new Error(`${dataset.title}缺少分类：${name}`); return value; }
function topic(value: QuestionBankCategory) { const next = value.topics[0]; if (!next) throw new Error(`${value.name}没有可用题组。`); return next; }
function section(moduleId: MockExamModuleId, id: string, title: string, dataset: QuestionBankDataset, category: QuestionBankCategory, topic: QuestionBankTopic, cards: QuestionBankCard[]): Omit<MockExamSection, 'items'> & { cards: QuestionBankCard[]; dataset: QuestionBankDataset; category: QuestionBankCategory; topic: QuestionBankTopic } { return { id, moduleId, title, dataset, category, topic, cards }; }

async function buildModule(moduleId: MockExamModuleId, expert: boolean, datasets: Record<QuestionBankId, QuestionBankDataset>, next: () => number) {
  if (moduleId === 'listening') {
    const result = [];
    for (const [index, name] of ['10s航空英语', '10s陆空通话', '20s航空英语', '20s陆空通话'].entries()) {
      const data = datasets.listening;
      const group = category(data, name);
      const groupTopic = await hydrateMockExamTopic(data, group, topic(group));
      result.push(section(moduleId, `listening-${index + 1}`, `听力 · ${name}`, data, group, groupTopic, sample(groupTopic.cards, 5, next)));
    }
    return result;
  }
  if (moduleId === 'sentences900') {
    const data = datasets.sentences900;
    const level3 = category(data, '3级');
    const level4 = category(data, '4级');
    const level5 = category(data, '5级');
    const level3Topic = await hydrateMockExamTopic(data, level3, topic(level3));
    const level4Topic = await hydrateMockExamTopic(data, level4, topic(level4));
    const first = sample(level3Topic.cards, 8, next);
    const result = [
      section(moduleId, 'sentence-1', '900 句 · 第 1 组', data, level3, level3Topic, first.slice(0, 4)),
      section(moduleId, 'sentence-2', '900 句 · 第 2 组', data, level3, level3Topic, first.slice(4)),
      section(moduleId, 'sentence-3', '900 句 · 第 3 组', data, level4, level4Topic, sample(level4Topic.cards, 4, next)),
    ];
    if (expert) {
      const level5Topic = await hydrateMockExamTopic(data, level5, topic(level5));
      const extra = sample(level5Topic.cards, 8, next);
      result.push(
        section(moduleId, 'sentence-4', '900 句 · 第 4 组', data, level5, level5Topic, extra.slice(0, 4)),
        section(moduleId, 'sentence-5', '900 句 · 第 5 组', data, level5, level5Topic, extra.slice(4)),
      );
    }
    return result;
  }
  if (moduleId === 'radiotelephony') {
    const data = datasets.radiotelephony;
    const candidates = data.categories.flatMap((entry) => entry.topics
      .filter((entryTopic) => {
        const count = mockExamTopicCardCount(data, entryTopic);
        return count >= 15 && count <= 20;
      })
      .map((entryTopic) => ({ category: entry, topic: entryTopic })));
    const chosen = sample(candidates, 1, next)[0];
    const chosenTopic = await hydrateMockExamTopic(data, chosen.category, chosen.topic);
    return [section(moduleId, 'radiotelephony', `陆空通话 · ${chosenTopic.name}`, data, chosen.category, chosenTopic, chosenTopic.cards)];
  }
  if (moduleId === 'storytelling') {
    const data = datasets.storytelling;
    const group = category(data, '飞行ICAO');
    const selected = group.topics.find((entry) => entry.name === '必做题库');
    if (!selected) throw new Error('故事复述缺少飞行 ICAO 必做题库。');
    const selectedTopic = await hydrateMockExamTopic(data, group, selected);
    return [section(moduleId, 'storytelling', '故事复述', data, group, selectedTopic, sample(selectedTopic.cards, 1, next))];
  }
  const data = datasets.opi;
  const candidates = data.categories.flatMap((entry) => entry.topics
    .filter((entryTopic) => mockExamTopicCardCount(data, entryTopic) >= 5)
    .map((entryTopic) => ({ category: entry, topic: entryTopic })));
  const chosen = sample(candidates, 1, next)[0];
  const chosenTopic = await hydrateMockExamTopic(data, chosen.category, chosen.topic);
  return [section(moduleId, 'opi', `OPI · ${chosenTopic.name}`, data, chosen.category, chosenTopic, sample(chosenTopic.cards, 5, next))];
}

export async function buildMockExamSession(config: MockExamConfig, providedSeed?: number): Promise<MockExamSession> {
  const allowed = MOCK_EXAM_MODULES[config.examType]; const selected = MOCK_EXAM_MODULE_ORDER.filter((id) => allowed.includes(id) && config.modules.includes(id));
  if (!selected.length) throw new Error('请至少选择一个考试板块。');
  const loaded = await Promise.all(['listening', 'sentences900', 'radiotelephony', 'storytelling', 'opi'].map(async (id) => [id, await questionBankRepository.getDataset(id as QuestionBankId)] as const));
  const datasets = Object.fromEntries(loaded) as Record<QuestionBankId, QuestionBankDataset | undefined>;
  for (const moduleId of selected) if (!datasets[moduleId]) throw new Error(`题库加载失败：${MOCK_EXAM_MODULE_LABELS[moduleId]}`);
  const resolved = datasets as Record<QuestionBankId, QuestionBankDataset>;
  const seed = (providedSeed ?? Math.floor(Math.random() * 0xffffffff)) >>> 0; const next = random(seed);
  const rawSections = [];
  for (const id of selected) rawSections.push(...await buildModule(id, config.examType === 'icao5-first', resolved, next));
  let number = 0;
  const sections: MockExamSection[] = rawSections.map((entry) => ({ id: entry.id, moduleId: entry.moduleId, title: entry.title, items: entry.cards.map((card) => { number += 1; return { id: `exam-${entry.moduleId}-${entry.id}-${number}-${card.id}`, number, moduleId: entry.moduleId, sectionId: entry.id, source: { bankId: entry.dataset.id, categoryId: entry.category.id, topicId: entry.topic.id, cardId: card.id }, dataset: entry.dataset, category: entry.category, topic: entry.topic, card }; }) }));
  return { id: `mock-exam-${seed.toString(16)}-${Date.now().toString(36)}`, seed, startedAt: new Date().toISOString(), config: { examType: config.examType, modules: selected }, mode: selected.length === allowed.length ? 'complete' : 'custom', sections, items: sections.flatMap((entry) => entry.items) };
}

export function toQuestionBankStudyPackage(session: MockExamSession): QuestionBankStudyPackage {
  const sectionTitles = new Map(session.sections.map((entry) => [entry.id, entry.title]));

  return {
    id: session.id,
    startedAt: session.startedAt,
    progressMode: 'session-only',
    items: session.items.map((item) => ({
      id: item.id,
      dataset: item.dataset,
      category: item.category,
      topic: item.topic,
      card: item.card,
      sectionId: item.sectionId,
      sectionTitle: sectionTitles.get(item.sectionId),
    })),
    record: {
      id: `mock-exam-record-${session.id}`,
      bankId: 'mock_exam',
      bankTitle: 'AI 模考',
      categoryTitle: MOCK_EXAM_TYPE_LABELS[session.config.examType],
      topicTitle: session.mode === 'complete'
        ? '按考试规则组卷'
        : `自选模考 · ${session.config.modules.map((id) => MOCK_EXAM_MODULE_LABELS[id]).join('、')}`,
      recordType: 'mock_exam',
      mockExam: {
        examType: session.config.examType,
        mode: session.mode,
        moduleIds: session.config.modules,
        sectionCounts: session.sections.map((entry) => ({
          id: entry.id,
          title: entry.title,
          total: entry.items.length,
        })),
      },
    },
  };
}
