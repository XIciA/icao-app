import { sqliteLearningStore } from '../platform/learning-store';
import type { StudyScope } from '@icao/contracts';
import type { QuestionBankTopic } from '../types';

export type CatalogProgressMap = Record<string, { learned: number; total: number }>;

export async function loadCatalogProgress(topics: readonly QuestionBankTopic[], scope: StudyScope = 'all'): Promise<CatalogProgressMap> {
  const entries = await Promise.all(
    topics.map(async (topic) => {
      const states = await sqliteLearningStore.getTopicStates(topic);
      const ids = topic.scopeCardIds?.[scope] ?? topic.cards.map((card) => card.id);
      const learned = ids.reduce((count, id) => count + (states[id]?.completed ? 1 : 0), 0);
      return [topic.id, { learned, total: topic.declaredCardCount }] as const;
    }),
  );
  return Object.fromEntries(entries);
}
