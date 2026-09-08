import { isVercelLegacyWeb, type WebRuntime, WEB_RUNTIME } from '@/config/web-runtime';
import { hasListeningReview, listeningReviewStates } from '@/features/mock-exam/listening-review';

import type { CardLearningState, LearningRecord, QuestionBankStudyItem, QuestionBankStudyPackage } from '../types';

export type VercelStudyReview = {
  schemaVersion: 1;
  items: QuestionBankStudyItem[];
  states: Record<string, CardLearningState>;
  answers: Record<string, string>;
};

// Snapshot the selected package only; never copy the surrounding question banks or recording URLs.
export function captureStudyReview(
  items: QuestionBankStudyItem[],
  states: Record<string, CardLearningState>,
  answers: Record<string, string>,
  platform: string,
  runtime: WebRuntime = WEB_RUNTIME,
): VercelStudyReview | undefined {
  if (!isVercelLegacyWeb(platform, runtime) || !items.length) return undefined;
  return JSON.parse(JSON.stringify({
    schemaVersion: 1,
    items: items.map((item) => ({
      ...item,
      dataset: { ...item.dataset, categories: [] },
      category: { ...item.category, topics: [] },
      topic: { ...item.topic, cards: [] },
    })),
    states: Object.fromEntries(items.flatMap(({ id }) => {
      const state = states[id];
      return state ? [[id, {
        visited: state.visited,
        completed: state.completed,
        selectedChoiceIndex: state.selectedChoiceIndex,
        recorded: state.recorded,
        note: '',
        updatedAt: state.updatedAt,
      }]] : [];
    })),
    answers: Object.fromEntries(items.flatMap(({ id }) => typeof answers[id] === 'string' ? [[id, answers[id]]] : [])),
  })) as VercelStudyReview;
}

export function getStudyReview(record: LearningRecord): VercelStudyReview | undefined {
  const review = record.vercelStudyReview;
  if (review?.schemaVersion === 1 && Array.isArray(review.items) && review.items.length
    && review.states && review.answers
    && new Set(review.items.map((item) => item?.id)).size === review.items.length
    && review.items.every((item) => {
      if (!item?.id || !item.dataset?.study || !item.category || !item.topic || !item.card) return false;
      const choice = review.states[item.id]?.selectedChoiceIndex;
      return (choice === undefined || (Number.isInteger(choice) && choice >= 0 && choice < (item.card.choices?.length ?? 0)))
        && (review.answers[item.id] === undefined || typeof review.answers[item.id] === 'string');
    })) return review;
  if (!hasListeningReview(record)) return undefined;
  return { schemaVersion: 1, items: record.vercelListeningReview!.items, states: listeningReviewStates(record), answers: {} };
}

export function toStudyReviewPackage(
  record: LearningRecord,
  platform: string,
  runtime: WebRuntime = WEB_RUNTIME,
): QuestionBankStudyPackage | undefined {
  if (!isVercelLegacyWeb(platform, runtime)) return undefined;
  const review = getStudyReview(record);
  if (!review) return undefined;
  return {
    id: `study-review-${record.id}`,
    startedAt: record.createdAt,
    progressMode: 'session-only',
    items: review.items,
    record,
    studyReviewRecord: record,
  };
}

export function wasAnswered(review: VercelStudyReview, itemId: string) {
  return review.states[itemId]?.selectedChoiceIndex !== undefined
    || Boolean(review.answers[itemId]?.trim()) || Boolean(review.states[itemId]?.recorded);
}
