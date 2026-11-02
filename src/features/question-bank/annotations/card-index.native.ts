import { storageTarget } from '../data/directory-storage-identity';
import { getEmbeddedQuestionBanks } from '../data/repository.native';
import { createCardDirectory } from '../data/card-directory';
import type { QuestionBankCardTarget } from './types';

const directory = createCardDirectory(getEmbeddedQuestionBanks());
export function questionBankCardTargetKey(target: QuestionBankCardTarget) {
  const stable = storageTarget(target);
  return [stable.bankId, stable.categoryId, stable.topicId, stable.cardId].join(':');
}
export const getQuestionBankCardReference = directory.get;
export const findQuestionBankCardReference = directory.findLegacy;
export function getQuestionBankCardSource(target: QuestionBankCardTarget) {
  const ref = directory.get(target);
  return ref?.card?.audioText?.trim() || ref?.card?.taskTitle || ref?.topicTitle || '原题尚待联网确认';
}
