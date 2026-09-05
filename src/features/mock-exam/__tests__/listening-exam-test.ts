import type {
  CardLearningState,
  LearningRecord,
  QuestionBankCategory,
  QuestionBankDataset,
  QuestionBankStudyItem,
  QuestionBankStudyPackage,
  QuestionBankTopic,
} from '@/features/question-bank/types';

import {
  listeningLevelForScore,
  resolveVercelListeningExamRange,
  scoreListeningExam,
} from '../listening-exam';
import { captureListeningReview, hasListeningReview, toListeningReviewPackage } from '../listening-review';

const dataset: QuestionBankDataset = {
  id: 'listening',
  title: '听力',
  nameEn: 'Listening',
  description: '',
  summary: '',
  enabled: true,
  statusLabel: '',
  icon: 'headphones',
  declaredTopicCount: 1,
  declaredCardCount: 20,
  categoryUnit: '类',
  topicUnit: '组',
  cardUnit: '题',
  categories: [],
  study: {
    interaction: 'choices',
    tools: { recorder: false, choices: true, notes: true, dictionary: true, highlights: true, tags: true },
    copy: { transcriptLabel: '音频原文', referenceLabel: '参考答案' },
    audioTitlePattern: 'card-title',
    consoleTabs: ['notes'],
  },
};
const topic: QuestionBankTopic = { id: 'topic', name: 'Topic', declaredCardCount: 20, cards: [] };
const category: QuestionBankCategory = { id: 'category', name: 'Category', declaredTopicCount: 1, declaredCardCount: 20, topics: [topic] };

function items(): QuestionBankStudyItem[] {
  return Array.from({ length: 20 }, (_, index) => {
    const card = {
      id: `card-${index + 1}`,
      taskTitle: `Card ${index + 1}`,
      audioText: 'Question',
      choices: ['A', 'B'],
      correctChoiceIndex: 1,
    };
    return { id: `item-${index + 1}`, dataset, category, topic, card };
  });
}

function studyPackage(): QuestionBankStudyPackage {
  return {
    id: 'mock-listening',
    startedAt: '2026-08-26T00:00:00.000Z',
    progressMode: 'session-only',
    items: items(),
    record: {
      bankId: 'mock_exam',
      bankTitle: 'AI 模考',
      categoryTitle: 'ICAO 4 初考',
      topicTitle: '自选练习 · 听力',
      recordType: 'mock_exam',
    },
  };
}

function state(selectedChoiceIndex: number): CardLearningState {
  return {
    visited: true,
    completed: true,
    selectedChoiceIndex,
    note: '',
    updatedAt: '2026-08-26T00:00:00.000Z',
  };
}

describe('Vercel listening exam', () => {
  it('persists only this paper and freezes choices and text across a JSON round trip', () => {
    const input = studyPackage();
    const states = Object.fromEntries(input.items.map((item, index) => [item.id, state(index % 2)]));
    const snapshot = captureListeningReview(input, states, 'web', 'vercel-legacy')!;
    expect(snapshot.result).toMatchObject({ answeredCount: 20, correctCount: 10, score: 25, level: 4 });
    expect(snapshot.items.every((item) => !item.dataset.categories.length && !item.category.topics.length && !item.topic.cards.length)).toBe(true);
    input.items[0].card.choices![0] = 'Changed after the exam';
    states[input.items[0].id].selectedChoiceIndex = 1;
    const record = JSON.parse(JSON.stringify({
      ...input.record, id: 'saved', completedCount: 20, totalCount: 20, correctCount: 10,
      durationSeconds: 60, reason: 'complete', createdAt: snapshot.completedAt, vercelListeningReview: snapshot,
    })) as LearningRecord;
    expect(hasListeningReview(record)).toBe(true);
    const restored = toListeningReviewPackage(record, 'web', 'vercel-legacy')!;
    expect(restored.items.map((item) => item.id)).toEqual(input.items.map((item) => item.id));
    expect(restored.items[0].card.choices![0]).toBe('A');
    expect(record.vercelListeningReview!.items[0].selectedChoiceIndex).toBe(0);
    expect(restored.listeningReviewRecord).toBe(record);
    for (const platform of ['ios', 'android']) {
      expect(captureListeningReview(input, states, platform, 'vercel-legacy')).toBeUndefined();
      expect(toListeningReviewPackage(record, platform, 'vercel-legacy')).toBeUndefined();
    }
    expect(captureListeningReview(input, states, 'web', 'edgeone-production')).toBeUndefined();
    expect(toListeningReviewPackage(record, 'web', 'edgeone-production')).toBeUndefined();
  });

  it('does not offer full review for an incomplete paper or legacy summary', () => {
    const input = studyPackage();
    expect(captureListeningReview(input, { [input.items[0].id]: state(0) }, 'web')).toBeUndefined();
    expect(hasListeningReview({ recordType: 'mock_exam' } as LearningRecord)).toBe(false);
  });

  it('is enabled only for a 20-question Vercel legacy mock-exam segment', () => {
    const input = studyPackage();
    expect(resolveVercelListeningExamRange(input, 'web', 'vercel-legacy')).toMatchObject({
      startIndex: 0,
      endIndex: 19,
      items: expect.any(Array),
    });
    expect(resolveVercelListeningExamRange(input, 'web', 'edgeone-production')).toBeUndefined();
    expect(resolveVercelListeningExamRange(input, 'ios', 'vercel-legacy')).toBeUndefined();
    expect(resolveVercelListeningExamRange({ ...input, items: input.items.slice(0, 19) }, 'web', 'vercel-legacy')).toBeUndefined();
  });

  it.each([
    [0, 2], [20, 2], [21, 3], [24, 3], [25, 4], [40, 4], [41, 5], [45, 5], [46, 6], [48, 6], [50, 6],
  ] as const)('maps %s points to level %s', (score, level) => {
    expect(listeningLevelForScore(score)).toBe(level);
  });

  it('scores the first ten questions at two points and the final ten at three points', () => {
    const input = studyPackage();
    const range = resolveVercelListeningExamRange(input, 'web', 'vercel-legacy')!;
    const allCorrect = Object.fromEntries(input.items.map((item) => [item.id, state(1)]));
    expect(scoreListeningExam(range, allCorrect)).toEqual({
      answeredCount: 20,
      correctCount: 20,
      level: 6,
      score: 50,
      totalCount: 20,
    });

    const fortyEight = { ...allCorrect, [input.items[0].id]: state(0) };
    expect(scoreListeningExam(range, fortyEight)).toMatchObject({ correctCount: 19, level: 6, score: 48 });

    const missingLast = { ...allCorrect };
    delete missingLast[input.items[19].id];
    expect(scoreListeningExam(range, missingLast)).toMatchObject({ answeredCount: 19, score: 47, level: 6 });
  });
});
