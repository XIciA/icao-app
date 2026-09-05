import { isVercelLegacyWeb, type WebRuntime, WEB_RUNTIME } from '@/config/web-runtime';
import type { CardLearningState, LearningRecord, QuestionBankStudyItem, QuestionBankStudyPackage } from '@/features/question-bank/types';

import { LISTENING_EXAM_ITEM_COUNT, resolveVercelListeningExamRange, scoreListeningExam, type ListeningExamResult } from './listening-exam';

export type VercelListeningReview = {
  schemaVersion: 1;
  completedAt: string;
  result: ListeningExamResult;
  items: (QuestionBankStudyItem & { selectedChoiceIndex: number })[];
};

export function captureListeningReview(
  studyPackage: QuestionBankStudyPackage | undefined,
  states: Record<string, CardLearningState>,
  platform: string,
  runtime: WebRuntime = WEB_RUNTIME,
): VercelListeningReview | undefined {
  const range = resolveVercelListeningExamRange(studyPackage, platform, runtime);
  if (!range) return undefined;
  const result = scoreListeningExam(range, states);
  if (result.answeredCount !== LISTENING_EXAM_ITEM_COUNT) return undefined;

  // Keep only the selected questions, never the datasets' full nested question banks.
  return JSON.parse(JSON.stringify({
    schemaVersion: 1,
    completedAt: new Date().toISOString(),
    result,
    items: range.items.map((item) => ({
      ...item,
      dataset: { ...item.dataset, categories: [] },
      category: { ...item.category, topics: [] },
      topic: { ...item.topic, cards: [] },
      selectedChoiceIndex: states[item.id].selectedChoiceIndex,
    })),
  })) as VercelListeningReview;
}

export function hasListeningReview(record: LearningRecord) {
  const review = record.vercelListeningReview;
  return record.recordType === 'mock_exam'
    && review?.schemaVersion === 1
    && review.result?.answeredCount === LISTENING_EXAM_ITEM_COUNT
    && Array.isArray(review.items)
    && review.items?.length === LISTENING_EXAM_ITEM_COUNT
    && review.items.every((item) => item?.dataset?.id === 'listening'
      && item.category && item.topic && item.card?.choices
      && Number.isInteger(item.selectedChoiceIndex)
      && item.selectedChoiceIndex >= 0 && item.selectedChoiceIndex < item.card.choices.length
      && Number.isInteger(item.card.correctChoiceIndex)
      && item.card.correctChoiceIndex! >= 0 && item.card.correctChoiceIndex! < item.card.choices.length)
    && new Set(review.items.map((item) => item.id)).size === LISTENING_EXAM_ITEM_COUNT;
}

export function listeningReviewStates(record: LearningRecord): Record<string, CardLearningState> {
  return Object.fromEntries((record.vercelListeningReview?.items ?? []).map((item) => [item.id, {
    visited: true,
    completed: true,
    selectedChoiceIndex: item.selectedChoiceIndex,
    note: '',
    updatedAt: record.vercelListeningReview!.completedAt,
  }]));
}

export function toListeningReviewPackage(
  record: LearningRecord,
  platform: string,
  runtime: WebRuntime = WEB_RUNTIME,
): QuestionBankStudyPackage | undefined {
  if (!isVercelLegacyWeb(platform, runtime) || !hasListeningReview(record)) return undefined;
  return {
    id: `listening-review-${record.id}`,
    startedAt: record.vercelListeningReview!.completedAt,
    progressMode: 'session-only',
    items: record.vercelListeningReview!.items,
    record,
    listeningReviewRecord: record,
  };
}
