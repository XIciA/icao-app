import type { QuestionBankId } from '../types';

/** Presentation order shared by bank menus, profile progress and radio. */
export const QUESTION_BANK_ORDER: readonly QuestionBankId[] = ['listening', 'sentences900', 'radiotelephony', 'storytelling', 'opi'];
export function orderQuestionBanks<T extends { id: QuestionBankId }>(banks: readonly T[]): T[] {
  return [...banks].sort((a, b) => QUESTION_BANK_ORDER.indexOf(a.id) - QUESTION_BANK_ORDER.indexOf(b.id));
}
