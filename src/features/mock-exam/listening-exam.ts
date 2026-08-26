import { isVercelLegacyWeb, type WebRuntime, WEB_RUNTIME } from '@/config/web-runtime';
import type {
  CardLearningState,
  QuestionBankStudyItem,
  QuestionBankStudyPackage,
} from '@/features/question-bank/types';

export const LISTENING_EXAM_ITEM_COUNT = 20;

export type ListeningExamLevel = 2 | 3 | 4 | 5 | 6;

export type ListeningExamRange = {
  startIndex: number;
  endIndex: number;
  items: QuestionBankStudyItem[];
};

export type ListeningExamResult = {
  answeredCount: number;
  correctCount: number;
  level: ListeningExamLevel;
  score: number;
  totalCount: typeof LISTENING_EXAM_ITEM_COUNT;
};

export function listeningLevelForScore(score: number): ListeningExamLevel {
  if (score >= 46) return 6;
  if (score >= 41) return 5;
  if (score >= 25) return 4;
  if (score >= 21) return 3;
  return 2;
}

export function resolveVercelListeningExamRange(
  studyPackage: QuestionBankStudyPackage | undefined,
  platform: string,
  runtime: WebRuntime = WEB_RUNTIME,
): ListeningExamRange | undefined {
  if (
    !studyPackage
    || studyPackage.record.recordType !== 'mock_exam'
    || !isVercelLegacyWeb(platform, runtime)
  ) return undefined;

  const indexes = studyPackage.items.flatMap((item, index) => (
    item.dataset.id === 'listening' ? [index] : []
  ));
  if (indexes.length !== LISTENING_EXAM_ITEM_COUNT) return undefined;

  const startIndex = indexes[0];
  const endIndex = indexes[indexes.length - 1];
  if (endIndex - startIndex + 1 !== LISTENING_EXAM_ITEM_COUNT) return undefined;

  return {
    startIndex,
    endIndex,
    items: studyPackage.items.slice(startIndex, endIndex + 1),
  };
}

export function scoreListeningExam(
  range: ListeningExamRange,
  states: Record<string, CardLearningState>,
): ListeningExamResult {
  let answeredCount = 0;
  let correctCount = 0;
  let score = 0;

  range.items.forEach((item, index) => {
    const selectedChoiceIndex = states[item.id]?.selectedChoiceIndex;
    if (selectedChoiceIndex === undefined) return;
    answeredCount += 1;
    if (selectedChoiceIndex !== item.card.correctChoiceIndex) return;
    correctCount += 1;
    score += index < 10 ? 2 : 3;
  });

  return {
    answeredCount,
    correctCount,
    level: listeningLevelForScore(score),
    score,
    totalCount: LISTENING_EXAM_ITEM_COUNT,
  };
}
