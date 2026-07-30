import { completedCards, sqliteLearningStore } from '../platform/learning-store';
import type { QuestionBankTopic } from '../types';

export type CatalogProgressMap = Record<string, { learned: number; total: number }>;

export async function loadCatalogProgress(topics: readonly QuestionBankTopic[]): Promise<CatalogProgressMap> {
  const entries = await Promise.all(
    topics.map(async (topic) => {
      const states = await sqliteLearningStore.getTopicStates(topic);
      return [topic.id, { learned: completedCards(topic.cards, states), total: topic.declaredCardCount }] as const;
    }),
  );
  return Object.fromEntries(entries);
}
