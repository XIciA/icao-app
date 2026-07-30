import type { QuestionBankCard } from '../types';

export function useQuestionBankAudioPreload(
  _cards: QuestionBankCard[],
  _currentIndex: number,
  _currentAudioReady = false,
) {
  // Native playback buffering remains owned by the existing player lifecycle.
}
