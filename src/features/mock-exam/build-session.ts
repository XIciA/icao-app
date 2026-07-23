import { questionBankRepository } from '@/features/question-bank/data/repository';
import type { QuestionBankCard, QuestionBankCategory, QuestionBankDataset, QuestionBankId, QuestionBankTopic } from '@/features/question-bank/types';

import { MOCK_EXAM_MODULE_ORDER, MOCK_EXAM_MODULES, MOCK_EXAM_MODULE_LABELS } from './rules';
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

function buildModule(moduleId: MockExamModuleId, expert: boolean, datasets: Record<QuestionBankId, QuestionBankDataset>, next: () => number) {
  if (moduleId === 'listening') return ['10s航空英语', '10s陆空通话', '20s航空英语', '20s陆空通话'].map((name, index) => { const data = datasets.listening; const group = category(data, name); const groupTopic = topic(group); return section(moduleId, `listening-${index + 1}`, `听力 · ${name}`, data, group, groupTopic, sample(groupTopic.cards, 5, next)); });
  if (moduleId === 'sentences900') { const data = datasets.sentences900; const level3 = category(data, '3级'); const level4 = category(data, '4级'); const level5 = category(data, '5级'); const first = sample(topic(level3).cards, 8, next); const result = [section(moduleId, 'sentence-1', '900 句 · 第 1 组', data, level3, topic(level3), first.slice(0, 4)), section(moduleId, 'sentence-2', '900 句 · 第 2 组', data, level3, topic(level3), first.slice(4)), section(moduleId, 'sentence-3', '900 句 · 第 3 组', data, level4, topic(level4), sample(topic(level4).cards, 4, next))]; if (expert) { const extra = sample(topic(level5).cards, 8, next); result.push(section(moduleId, 'sentence-4', '900 句 · 第 4 组', data, level5, topic(level5), extra.slice(0, 4)), section(moduleId, 'sentence-5', '900 句 · 第 5 组', data, level5, topic(level5), extra.slice(4))); } return result; }
  if (moduleId === 'radiotelephony') { const data = datasets.radiotelephony; const candidates = data.categories.flatMap((entry) => entry.topics.filter((entryTopic) => entryTopic.cards.length >= 15 && entryTopic.cards.length <= 20).map((entryTopic) => ({ category: entry, topic: entryTopic }))); const chosen = sample(candidates, 1, next)[0]; return [section(moduleId, 'radiotelephony', `陆空通话 · ${chosen.topic.name}`, data, chosen.category, chosen.topic, chosen.topic.cards)]; }
  if (moduleId === 'storytelling') { const data = datasets.storytelling; const group = category(data, '飞行ICAO'); const selected = group.topics.find((entry) => entry.name === '必做题库'); if (!selected) throw new Error('故事复述缺少飞行 ICAO 必做题库。'); return [section(moduleId, 'storytelling', '故事复述', data, group, selected, sample(selected.cards, 1, next))]; }
  const data = datasets.opi; const candidates = data.categories.flatMap((entry) => entry.topics.filter((entryTopic) => entryTopic.cards.length >= 5).map((entryTopic) => ({ category: entry, topic: entryTopic }))); const chosen = sample(candidates, 1, next)[0]; return [section(moduleId, 'opi', `OPI · ${chosen.topic.name}`, data, chosen.category, chosen.topic, sample(chosen.topic.cards, 5, next))];
}

export async function buildMockExamSession(config: MockExamConfig, providedSeed?: number): Promise<MockExamSession> {
  const allowed = MOCK_EXAM_MODULES[config.examType]; const selected = MOCK_EXAM_MODULE_ORDER.filter((id) => allowed.includes(id) && config.modules.includes(id));
  if (!selected.length) throw new Error('请至少选择一个考试板块。');
  const loaded = await Promise.all(['listening', 'sentences900', 'radiotelephony', 'storytelling', 'opi'].map(async (id) => [id, await questionBankRepository.getDataset(id as QuestionBankId)] as const));
  const datasets = Object.fromEntries(loaded) as Record<QuestionBankId, QuestionBankDataset | undefined>;
  for (const moduleId of selected) if (!datasets[moduleId]) throw new Error(`题库加载失败：${MOCK_EXAM_MODULE_LABELS[moduleId]}`);
  const resolved = datasets as Record<QuestionBankId, QuestionBankDataset>;
  const seed = (providedSeed ?? Math.floor(Math.random() * 0xffffffff)) >>> 0; const next = random(seed);
  const rawSections = selected.flatMap((id) => buildModule(id, config.examType === 'icao5-first', resolved, next));
  let number = 0;
  const sections: MockExamSection[] = rawSections.map((entry) => ({ id: entry.id, moduleId: entry.moduleId, title: entry.title, items: entry.cards.map((card) => { number += 1; return { id: `exam-${entry.moduleId}-${entry.id}-${number}-${card.id}`, number, moduleId: entry.moduleId, sectionId: entry.id, source: { bankId: entry.dataset.id, categoryId: entry.category.id, topicId: entry.topic.id, cardId: card.id }, dataset: entry.dataset, category: entry.category, topic: entry.topic, card }; }) }));
  return { id: `mock-exam-${seed.toString(16)}-${Date.now().toString(36)}`, seed, startedAt: new Date().toISOString(), config: { examType: config.examType, modules: selected }, mode: selected.length === allowed.length ? 'complete' : 'custom', sections, items: sections.flatMap((entry) => entry.items) };
}
