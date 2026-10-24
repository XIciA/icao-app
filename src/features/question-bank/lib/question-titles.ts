import type { QuestionBankDataset, QuestionBankId, QuestionBankTopic } from '../types';

/** Display names never identify a question. Resolve the full directory before scope filtering. */
export function naturalTopicTitles(bankId: QuestionBankId, topic: QuestionBankTopic): QuestionBankTopic {
  if (bankId !== 'listening' && bankId !== 'storytelling') return topic;
  const order = topic.scopeCardIds?.all ?? topic.cards.filter(card => !card.retired).map(card => card.id);
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
  if (dataset.id !== 'listening' && dataset.id !== 'storytelling') return dataset;
  return { ...dataset, categories: dataset.categories.map(category => ({ ...category,
    topics: category.topics.map(topic => naturalTopicTitles(dataset.id, topic)),
  })) };
}
