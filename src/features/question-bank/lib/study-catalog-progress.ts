import type { StudyScope } from '@icao/contracts';
import { readTopicStatesBatch } from '../platform/learning-store.native';
import type { QuestionBankDataset, QuestionBankId } from '../types';

export type StudyCatalogProgress = Partial<Record<QuestionBankId, number>>;

/** Count the visible directory's IDs, including protected questions without loading their text. */
export async function loadStudyCatalogProgress(datasets: readonly QuestionBankDataset[], scope: StudyScope): Promise<StudyCatalogProgress> {
  const states = await readTopicStatesBatch(datasets.flatMap(bank => bank.categories.flatMap(category => category.topics)));
  return Object.fromEntries(datasets.map(bank => {
    const bankScope = bank.id === 'sentences900' ? 'all' : scope;
    const learned = bank.categories.reduce((sum, category) => sum + category.topics.reduce((count, topic) => {
      const retired = new Set(topic.cards.filter(card => card.retired).map(card => card.id));
      const ids = new Set(topic.scopeCardIds?.[bankScope] ?? topic.cards.map(card => card.id));
      return count + Math.min(topic.declaredCardCount, [...ids].filter(id => !retired.has(id) && states[topic.id]?.[id]?.completed).length);
    }, 0), 0);
    return [bank.id, Math.min(learned, bank.declaredCardCount)];
  }));
}
