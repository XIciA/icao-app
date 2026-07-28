import type { QuestionBankCard } from '../types';

export function useQuestionBankAudioPreload(_cards: QuestionBankCard[], _currentIndex: number) {
  // Native playback buffering remains owned by the existing player lifecycle.
}
