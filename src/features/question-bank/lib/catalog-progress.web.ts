import { completedCards, readTopicStatesBatch } from '../platform/learning-store';
import type { QuestionBankTopic } from '../types';

import type { CatalogProgressMap } from './catalog-progress';

export async function loadCatalogProgress(topics: readonly QuestionBankTopic[]): Promise<CatalogProgressMap> {
  const statesByTopic = await readTopicStatesBatch(topics);
  return Object.fromEntries(topics.map((topic) => [
    topic.id,
    {
      learned: completedCards(topic.cards, statesByTopic[topic.id] ?? {}),
      total: topic.declaredCardCount,
    },
  ]));
}
