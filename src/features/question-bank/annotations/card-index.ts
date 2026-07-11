import { getEmbeddedQuestionBanks } from '../data/repository';
import type { QuestionBankCard } from '../types';
import type { QuestionBankCardTarget } from './types';

export type IndexedQuestionBankCard = QuestionBankCardTarget & {
  bankTitle: string;
  categoryTitle: string;
  topicTitle: string;
  cardIndex: number;
  card: QuestionBankCard;
};

export function questionBankCardTargetKey(target: QuestionBankCardTarget) {
  return [target.bankId, target.categoryId, target.topicId, target.cardId].join(':');
}

const cardIndex = new Map<string, IndexedQuestionBankCard>();

getEmbeddedQuestionBanks().forEach((bank) => {
  bank.categories.forEach((category) => {
    category.topics.forEach((topic) => {
      topic.cards.forEach((card, index) => {
        const value: IndexedQuestionBankCard = {
          bankId: bank.id,
          bankTitle: bank.title,
          categoryId: category.id,
          categoryTitle: category.name,
          topicId: topic.id,
          topicTitle: topic.name,
          cardId: card.id,
          cardIndex: index,
          card,
        };
        cardIndex.set(questionBankCardTargetKey(value), value);
      });
    });
  });
});

export function getQuestionBankCardReference(target: QuestionBankCardTarget) {
  return cardIndex.get(questionBankCardTargetKey(target));
}

export function getQuestionBankCardSource(target: QuestionBankCardTarget) {
  const reference = getQuestionBankCardReference(target);
  if (!reference) return '原题内容已更新或不可用';
  return reference.card.audioText.trim() || reference.card.taskTitle;
}
