import type { QuestionBankCard, QuestionBankDataset, QuestionBankId } from '../types';
import type { QuestionBankCardTarget } from '../annotations/types';

export type CardLocation = QuestionBankCardTarget & {
  bankTitle: string; categoryTitle: string; topicTitle: string; cardIndex: number;
  card?: QuestionBankCard;
};

/** Identity comes from the complete directory, never from downloaded member text. */
export function createCardDirectory(datasets: readonly QuestionBankDataset[]) {
  const byIdentity = new Map<string, CardLocation>();
  const byTopic = new Map<string, CardLocation | null>();
  const byCard = new Map<string, CardLocation | null>();
  for (const bank of datasets) for (const category of bank.categories) for (const topic of category.topics) {
    const cards = new Map(topic.cards.map(card => [card.id, card]));
    const ids = topic.scopeCardIds?.all ?? topic.cards.map(card => card.id);
    ids.forEach((cardId, cardIndex) => {
      const location: CardLocation = { bankId: bank.id, categoryId: category.id, topicId: topic.id, cardId,
        bankTitle: bank.title, categoryTitle: category.name, topicTitle: topic.name, cardIndex, card: cards.get(cardId) };
      const key = `${bank.id}:${cardId}`;
      if (byIdentity.has(key)) throw new Error('duplicate_question_identity');
      byIdentity.set(key, location);
      for (const [map, lookup] of [[byTopic, `${topic.id}:${cardId}`], [byCard, cardId]] as const) {
        map.set(lookup, map.has(lookup) ? null : location);
      }
    });
  }
  return {
    get: (target: Pick<QuestionBankCardTarget, 'bankId' | 'cardId'>) => byIdentity.get(`${target.bankId}:${target.cardId}`),
    findLegacy: (topicId: string, cardId: string) => byTopic.get(`${topicId}:${cardId}`) ?? byCard.get(cardId) ?? undefined,
    size: byIdentity.size,
  };
}

export function directoryHasCompleteBank(dataset: QuestionBankDataset) {
  const topics = dataset.categories.flatMap(category => category.topics);
  return topics.reduce((sum, topic) => sum + topic.declaredCardCount, 0) === dataset.declaredCardCount
    && topics.every(topic => (topic.scopeCardIds?.all.length ?? topic.cards.length) === topic.declaredCardCount);
}
export type CardIdentity = { bankId: QuestionBankId; cardId: string };
