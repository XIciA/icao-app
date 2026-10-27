import type { CardLearningState, QuestionBankStudyItem } from '../types';

/** Derive display state from the caller's progress owner (live session or saved review). */
export function listeningAnswerResults(
  items: readonly QuestionBankStudyItem[],
  stateFor: (item: QuestionBankStudyItem) => CardLearningState | undefined,
): readonly ('correct' | 'incorrect' | undefined)[] | undefined {
  if (!items.some(item => item.dataset.id === 'listening')) return undefined;
  return items.map(item => {
    const selected = stateFor(item)?.selectedChoiceIndex;
    const correct = item.card.correctChoiceIndex;
    if (item.dataset.id !== 'listening' || selected === undefined || correct === undefined) return undefined;
    return selected === correct ? 'correct' : 'incorrect';
  });
}
