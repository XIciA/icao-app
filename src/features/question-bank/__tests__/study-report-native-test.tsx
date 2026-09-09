import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { StudyReport } from '../components/StudyReport.native';
import { loadLearningRecordReview } from '../platform/learning-record-storage.native';
import { captureStudyReview } from '../lib/study-review.native';
import data from '../data/question-bank.json';
import type { LearningRecord, QuestionBankDataset } from '../types';
jest.mock('react', () => ({ ...jest.requireActual('react'), lazy: () => jest.requireMock('../components/QuestionBankStudyScreen.native').QuestionBankStudyScreen }));
jest.mock('../platform/learning-record-storage.native', () => ({ loadLearningRecordReview: jest.fn() }));
jest.mock('../components/QuestionBankStudyScreen.native', () => {
  const { Pressable, Text } = jest.requireActual('react-native');
  return { QuestionBankStudyScreen: ({ onReturn, returnLabel }: { onReturn: () => void; returnLabel: string }) => <Pressable onPress={onReturn}><Text>{returnLabel}</Text></Pressable> };
});
const record: LearningRecord = { id: 'report', sessionId: 'attempt', recordType: 'mock_exam', bankId: 'mock_exam', bankTitle: '模拟考试', categoryTitle: 'ICAO 4 初考', topicTitle: '听力', completedCount: 0, totalCount: 20, correctCount: 0, reason: 'complete', durationSeconds: 60, createdAt: '2026-09-09T00:00:00Z', mockExam: { examType: 'icao4-first', mode: 'custom', moduleIds: ['listening'], sectionCounts: [], listeningResult: { answeredCount: 0, correctCount: 0, score: 0, level: 2, totalCount: 20 } } };
it('returns from the readonly paper to the same completed result without leaving or recreating an attempt', async () => {
  const dataset = data[0] as QuestionBankDataset; const category = dataset.categories[0]; const topic = category.topics[0]; const card = topic.cards[0];
  jest.mocked(loadLearningRecordReview).mockResolvedValue({ ...record, studyReview: captureStudyReview([{ id: card.id, dataset, category, topic, card }], {}, {}) });
  const leave = jest.fn();
  const screen = await render(<StudyReport record={record} noteCount={0} interaction="choices" onReturn={leave} />);
  await fireEvent.press(screen.getByText('查看本次记录'));
  await waitFor(() => expect(screen.getByText('返回结束页面')).toBeTruthy());
  await fireEvent.press(screen.getByText('返回结束页面'));
  expect(screen.getByText('听力成绩')).toBeTruthy(); expect(screen.getByText('0 / 50')).toBeTruthy(); expect(leave).not.toHaveBeenCalled(); expect(loadLearningRecordReview).toHaveBeenCalledTimes(1);
});
