jest.mock('../components/LookupPronunciation', () => ({ LookupPronunciation: () => null }));
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { StudyReport } from '../components/StudyReport.native';
import { loadLearningRecordReview } from '../platform/learning-record-storage.native';
import { captureStudyReview } from '../lib/study-review.native';
import data from '../data/question-bank.json';
import type { LearningRecord, QuestionBankDataset } from '../types';
let mockBackHandler: (() => void) | undefined;
jest.mock('@react-navigation/native', () => ({ ...jest.requireActual('@react-navigation/native'), usePreventRemove: (enabled: boolean, back: () => void) => { mockBackHandler = enabled ? back : undefined; } }));
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
  await fireEvent.press(screen.getByText('全部学习记录'));
  await waitFor(() => expect(screen.getByText('返回结束页面')).toBeTruthy());
  await fireEvent.press(screen.getByText('返回结束页面'));
  expect(screen.getByText('听力成绩')).toBeTruthy(); expect(screen.getByText('0 / 50')).toBeTruthy(); expect(leave).not.toHaveBeenCalled(); expect(loadLearningRecordReview).toHaveBeenCalledTimes(1);
});

it('marks tutorial recap complete only after the saved original question opens', async () => {
  const { GuideBindingContext } = require('@/features/usage-guide/GuideBindings');
  const event = jest.fn();
  const controller = { current: 'study', step: 'study-recap', event, offer: jest.fn(), register: jest.fn(), exit: jest.fn(), start: jest.fn() };
  const screen = await render(<GuideBindingContext.Provider value={controller}><StudyReport record={record} noteCount={0} interaction="choices" onReturn={jest.fn()} /></GuideBindingContext.Provider>);
  jest.mocked(loadLearningRecordReview).mockRejectedValueOnce(new Error('offline'));
  await fireEvent.press(screen.getByText('全部学习记录'));
  await waitFor(() => expect(screen.getByText('记录暂时无法打开，请重试。')).toBeTruthy());
  expect(event).not.toHaveBeenCalled();
  const dataset = data[0] as QuestionBankDataset; const category = dataset.categories[0]; const topic = category.topics[0]; const card = topic.cards[0];
  jest.mocked(loadLearningRecordReview).mockResolvedValueOnce({ ...record, studyReview: captureStudyReview([{ id: card.id, dataset, category, topic, card }], {}, {}) });
  await fireEvent.press(screen.getByText('全部学习记录'));
  await waitFor(() => expect(event).toHaveBeenCalledWith('study-recap'));
  expect(screen.getByText('返回结束页面')).toBeTruthy();
});

it('links a looked-up word back to its saved source question using the existing recap', async () => {
  const dataset = data.find(bank => bank.id === 'sentences900') as QuestionBankDataset;
  const category = dataset.categories[0]; const topic = category.topics[0]; const card = topic.cards.find(card => card.audioText?.toLowerCase().includes('maintaining'))!;
  const saved = { ...record, id: 'word-recap', recordType: 'session' as const, sessionRecap: { annotatedCardIds: [], words: [{ word: 'maintaining', favorited: true }] }, studyReview: captureStudyReview([{ id: card.id, dataset, category, topic, card }], {}, {}) };
  jest.mocked(loadLearningRecordReview).mockResolvedValueOnce(saved);
  const screen = await render(<StudyReport record={saved} noteCount={0} interaction="speaking" onReturn={jest.fn()} />);
  await fireEvent.press(screen.getByText('查词与收藏'));
  await fireEvent.press(screen.getByText(`回到 ${card.taskTitle}`));
  await waitFor(() => expect(screen.getByText('返回结束页面')).toBeTruthy());
  expect(loadLearningRecordReview).toHaveBeenLastCalledWith(saved);
});

it('returns from an embedded exam result to setup on system back', async () => {
  const onReturn = jest.fn();
  await render(<StudyReport localReturn record={record} noteCount={0} interaction="choices" onReturn={onReturn} />);
  await act(async () => { mockBackHandler?.(); });
  expect(onReturn).toHaveBeenCalledTimes(1);
});
