import { randomUUID } from 'expo-crypto';
import type { CardLearningState, LearningRecord, QuestionBankStudyItem, QuestionBankStudyPackage, StudyReviewSnapshot } from '../types';
import { withStudyMaterials } from './study-materials.native';

export function captureStudyReview(
  items: QuestionBankStudyItem[],
  states: Record<string, CardLearningState>,
  answers: Record<string, string>,
): StudyReviewSnapshot | undefined {
  if (!items.length) return undefined;
  return JSON.parse(JSON.stringify({
    schemaVersion: 1,
    items: items.map(withStudyMaterials).map((item) => ({
      id: item.id,
      sectionId: item.sectionId,
      sectionTitle: item.sectionTitle,
      dataset: { ...item.dataset, categories: [] },
      category: { ...item.category, topics: [] },
      topic: { ...item.topic, cards: [] },
      card: item.card,
      materials: item.materials,
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
  })) as StudyReviewSnapshot;
}

export function getStudyReview(record: LearningRecord): StudyReviewSnapshot | undefined {
  const value = record.studyReview;
  if (!value || value.schemaVersion !== 1 || !Array.isArray(value.items) || !value.items.length
    || !value.states || !value.answers || new Set(value.items.map((item) => item?.id)).size !== value.items.length) return undefined;
  if (!value.items.every((item) => {
    if (!item?.id || !item.dataset?.study || !item.category?.id || !item.topic?.id || !item.card?.id) return false;
    const choice = value.states[item.id]?.selectedChoiceIndex;
    return (choice === undefined || (Number.isInteger(choice) && choice >= 0 && choice < (item.card.choices?.length ?? 0)))
      && (value.answers[item.id] === undefined || typeof value.answers[item.id] === 'string');
  })) return undefined;
  return value;
}

export function toStudyReviewPackage(record: LearningRecord): QuestionBankStudyPackage | undefined {
  const review = getStudyReview(record);
  if (!review) return undefined;
  // The saved attempt supplies the ordered questions and starting answers only.
  // A new session must never reuse its id, start time, exam rules or grade.
  return {
    id: `study-${randomUUID()}`,
    startedAt: new Date().toISOString(),
    progressMode: 'persistent',
    items: review.items,
    record: {
      bankId: record.bankId,
      bankTitle: record.bankId === 'mock_exam' ? '模拟考试题包' : record.bankTitle,
      categoryTitle: record.categoryTitle,
      topicTitle: record.topicTitle,
      recordType: 'session',
      source: record.source,
      ...(record.hotspot ? { hotspot: record.hotspot } : {}),
    },
    studyReviewRecord: record,
  };
}

export function wasAnswered(review: StudyReviewSnapshot, id: string) {
  return review.states[id]?.selectedChoiceIndex !== undefined || Boolean(review.answers[id]?.trim()) || Boolean(review.states[id]?.recorded);
}
