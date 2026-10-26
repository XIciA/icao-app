import type { QuestionBankDataset, QuestionBankId, QuestionBankTopic } from '../types';

/** Display names never identify a question; a caller can supply its final visible order. */
export function naturalTopicTitles(bankId: QuestionBankId, topic: QuestionBankTopic, displayOrder?: readonly string[]): QuestionBankTopic {
  if (bankId !== 'listening' && bankId !== 'storytelling') return topic;
  const order = displayOrder ?? topic.scopeCardIds?.all ?? topic.cards.filter(card => !card.retired).map(card => card.id);
  const numbers = new Map(order.map((id, index) => [id, index + 1]));
  const cards = topic.cards.map(card => {
    const number = numbers.get(card.id);
    if (number === undefined || card.retired || !/[-－—·]\s*\d+\s*$/.test(card.taskTitle)) return card;
    const prefix = bankId === 'storytelling' ? '故事复述' : card.taskTitle.replace(/[-－—·]\s*\d+\s*$/, '').replace(/(\d+)s/g, '$1秒');
    const taskTitle = `${prefix}-${number}`;
    return card.taskTitle === taskTitle ? card : { ...card, taskTitle };
  });
  return { ...topic, cards };
}
export function naturalDatasetTitles(dataset: QuestionBankDataset): QuestionBankDataset {
  if (dataset.id !== 'listening' && dataset.id !== 'storytelling' && dataset.id !== 'radiotelephony') return dataset;
  const categories = dataset.id === 'listening' ? [...dataset.categories].sort((a, b) => listeningRank(a.id) - listeningRank(b.id)) : dataset.id === 'radiotelephony' ? [...dataset.categories].sort((a, b) => Number(a.topics.every(topic => topic.practiceKind === 'scoring-points')) - Number(b.topics.every(topic => topic.practiceKind === 'scoring-points'))) : dataset.categories;
  return { ...dataset, categories: categories.map(category => ({ ...category,
    name: dataset.id === 'listening' ? category.name.replace(/(\d+)s/g, '$1秒')
      : dataset.id === 'radiotelephony' && category.id === 'atc-scoring-points' ? '专项训练' : category.name,
    topics: category.topics.map(topic => naturalTopicTitles(dataset.id, topic)),
  })) };
}

export const LISTENING_CATEGORY_ORDER = ['listening-category-01', 'listening-category-04', 'listening-category-03', 'listening-category-02'] as const;
function listeningRank(id: string) {
  const rank = (LISTENING_CATEGORY_ORDER as readonly string[]).indexOf(id);
  return rank === -1 ? LISTENING_CATEGORY_ORDER.length : rank;
}
