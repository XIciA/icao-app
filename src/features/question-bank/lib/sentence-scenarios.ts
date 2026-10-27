import type { QuestionBankDataset, QuestionBankStudyPackage } from '../types';

// PDF chapter membership only. Original card IDs, level, wording and audio remain authoritative.
export const SENTENCE_SCENARIOS = [
  { id: 'basic', name: '基本通话术语', first: 1, last: 85 },
  { id: 'aerodrome', name: '机场通话术语', first: 86, last: 223 },
  { id: 'radar', name: '雷达通话术语', first: 224, last: 294 },
  { id: 'approach', name: '进近通话术语', first: 295, last: 381 },
  { id: 'area', name: '区域通话术语', first: 382, last: 440 },
  { id: 'emergency', name: '紧急情况通话术语', first: 441, last: 700 },
  { id: 'weather', name: '气象及其他机场信息通话术语', first: 701, last: 800 },
  { id: 'other', name: '其它情况通话术语', first: 801, last: 900 },
] as const;
export function sentenceScenario(cardId: string) {
  const match = /^sentence900-main-(\d+)$/.exec(cardId);
  const number = match ? Number(match[1]) : NaN;
  return SENTENCE_SCENARIOS.find(scene => number >= scene.first && number <= scene.last);
}
export function sentenceScenarioCount(dataset: QuestionBankDataset, sceneId: string) {
  return dataset.categories.flatMap(category => category.topics).reduce((sum, topic) => sum +
    (topic.scopeCardIds?.all ?? topic.cards.filter(card => !card.retired).map(card => card.id)).filter(id => sentenceScenario(id)?.id === sceneId).length, 0);
}
export function sentenceScenarioPackage(dataset: QuestionBankDataset, sceneId: string): QuestionBankStudyPackage {
  const scene = SENTENCE_SCENARIOS.find(value => value.id === sceneId);
  if (!scene || dataset.id !== 'sentences900') throw new Error('invalid_sentence_scenario');
  const items = dataset.categories.flatMap(category => category.topics.flatMap(topic => topic.cards
    .filter(card => !card.retired && sentenceScenario(card.id)?.id === sceneId)
    .map(card => ({ id: card.id, dataset, category, topic, card }))));
  items.sort((a, b) => Number(a.card.id.split('-').at(-1)) - Number(b.card.id.split('-').at(-1)));
  return { id: `scenario-${scene.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`, startedAt: new Date().toISOString(),
    progressMode: 'persistent', items,
    record: { bankId: dataset.id, bankTitle: dataset.title, categoryTitle: scene.name, topicTitle: scene.name, recordType: 'session', source: 'question-bank' } };
}
