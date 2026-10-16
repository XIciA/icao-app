import { getEmbeddedQuestionBanks } from '../data/repository.native';
import { createCardDirectory } from '../data/card-directory';
import type { QuestionBankCardTarget } from './types';

const directory = createCardDirectory(getEmbeddedQuestionBanks());
export function questionBankCardTargetKey(target: QuestionBankCardTarget) {
  return [target.bankId, target.categoryId, target.topicId, target.cardId].join(':');
}
export const getQuestionBankCardReference = directory.get;
export const findQuestionBankCardReference = directory.findLegacy;
export function getQuestionBankCardSource(target: QuestionBankCardTarget) {
  const ref = directory.get(target);
  return ref?.card?.audioText?.trim() || ref?.card?.taskTitle || ref?.topicTitle || '原题尚待联网确认';
}
