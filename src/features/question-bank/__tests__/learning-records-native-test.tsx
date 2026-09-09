import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { LearningRecordsScreen } from '../components/LearningRecordsScreen.native';
import { StudyHistoryPersonalContent } from '../components/StudyHistoryPersonalContent.native';
import { getLearningRecordPage, loadLearningRecordReview, subscribeLearningRecords } from '../platform/learning-record-storage.native';
import { deleteLearningHistory } from '@/features/sync/learning-sync.native';
import { captureStudyReview } from '../lib/study-review.native';
import data from '../data/question-bank.json';
import type { LearningRecord, QuestionBankDataset, QuestionBankStudyPackage } from '../types';
jest.mock('react', () => ({ ...jest.requireActual('react'), lazy: () => jest.requireMock('../components/QuestionBankStudyScreen.native').QuestionBankStudyScreen }));
jest.mock('../platform/learning-record-storage.native', () => ({ getLearningRecordPage: jest.fn(), loadLearningRecordReview: jest.fn(), subscribeLearningRecords: jest.fn(() => () => {}) }));
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  const { useState } = jest.requireActual('react'); const { View } = jest.requireActual('react-native');
  return function MockSwipeable({ children, renderRightActions, testID }: { children: React.ReactNode; renderRightActions: (...args: unknown[]) => React.ReactNode; testID: string }) {
    const [open, setOpen] = useState(false);
    return <View testID={testID} onSwipe={() => setOpen(true)}>{children}{open ? renderRightActions({}, {}, { close: () => setOpen(false) }) : null}</View>;
  };
});
jest.mock('@/features/sync/learning-sync.native', () => ({ deleteLearningHistory: jest.fn() }));
jest.mock('../components/QuestionBankStudyScreen.native', () => {
  const { Pressable, Text, View } = jest.requireActual('react-native');
  return { QuestionBankStudyScreen: ({ onReturn, studyPackage }: { onReturn: () => void; studyPackage: QuestionBankStudyPackage }) => <View><Text>{`attempt:${studyPackage.studyReviewRecord?.id}`}</Text><Pressable accessibilityLabel="返回列表" onPress={onReturn} /></View> };
});
const dataset = data[0] as QuestionBankDataset; const category = dataset.categories[0]; const topic = category.topics[0]; const card = topic.cards[0];
const record: LearningRecord = { id: 'history-1', sessionId: 'session-1', recordType: 'session', source: 'hotspot', hotspot: { id: 'brief-1', title: '7月10日 考试资讯', date: '2026-07-10' }, bankId: 'opi', bankTitle: 'OPI 热点', categoryTitle: '7月10日 考试资讯', topicTitle: '绵阳考点', reason: 'abort', durationSeconds: 45, createdAt: '2026-09-09T00:00:00.000Z', totalCount: 1, completedCount: 0, correctCount: 0, studyReviewSaved: true };
beforeEach(() => { jest.clearAllMocks(); jest.mocked(getLearningRecordPage).mockResolvedValue({ records: [record], hasMore: false }); jest.mocked(deleteLearningHistory).mockResolvedValue(); });
it('opens the selected attempt directly and can return to the session list', async () => {
  jest.mocked(loadLearningRecordReview).mockResolvedValue({ ...record, studyReview: captureStudyReview([{ id: card.id, dataset, category, topic, card }], {}, {}) });
  const screen = await render(<LearningRecordsScreen />);
  await waitFor(() => expect(screen.getByText('OPI 热点')).toBeTruthy());
  expect(screen.queryByText('LOCAL HISTORY')).toBeNull();
  await fireEvent.press(screen.getByLabelText('查看OPI 热点 绵阳考点'));
  await waitFor(() => expect(screen.getByText('attempt:history-1')).toBeTruthy());
  await fireEvent.press(screen.getByLabelText('返回列表'));
  await waitFor(() => expect(screen.getByText('OPI 热点')).toBeTruthy());
});
it('deletes only the selected session after the existing confirmation dialog', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  const screen = await render(<LearningRecordsScreen />);
  await waitFor(() => expect(screen.getByText('OPI 热点')).toBeTruthy());
  expect(screen.queryByLabelText('删除OPI 热点 绵阳考点的学习记录')).toBeNull();
  await fireEvent(screen.getByTestId('history-swipe-history-1'), 'swipe');
  await fireEvent.press(screen.getByLabelText('删除OPI 热点 绵阳考点的学习记录'));
  const remove = alert.mock.calls[0][2]?.find(button => button.style === 'destructive');
  await act(async () => remove?.onPress?.());
  await waitFor(() => expect(deleteLearningHistory).toHaveBeenCalledWith('history-1'));
  alert.mockRestore();
});
it('uses learned counts for ordinary sessions and refreshes automatically after a synced record change', async () => {
  let changed: (() => void) | undefined;
  jest.mocked(subscribeLearningRecords).mockImplementation(listener => { changed = listener; return () => {}; });
  const screen = await render(<LearningRecordsScreen />);
  await waitFor(() => expect(screen.getByText('本次学习 1 题')).toBeTruthy());
  const next: LearningRecord = { ...record, id: 'history-2', recordType: 'mock_exam', source: 'mock-exam', bankTitle: '模拟考试', answeredCount: 7, totalCount: 20, createdAt: new Date().toISOString() };
  jest.mocked(getLearningRecordPage).mockResolvedValue({ records: [next, record], hasMore: false });
  await act(async () => changed?.());
  await waitFor(() => expect(screen.getByText('已答 7/20 题')).toBeTruthy());
  expect(screen.getByText('今天')).toBeTruthy();
});
it('labels retained AI text within the readonly answer, including the analyzed text when it differs', async () => {
  const screen = await render(<StudyHistoryPersonalContent definitions={[]} answer="final answer" feedback={{ questionId: 'q-1', transcript: 'old answer', analyzedTranscript: 'old answer', polishedText: 'polished answer' }} />);
  expect(screen.getByText('final answer')).toBeTruthy(); expect(screen.getByText('old answer')).toBeTruthy();
  expect(screen.getByLabelText('AI 辅助生成')).toBeTruthy();
});
it('shows a recovered ASR transcript without discarding a later edited answer', async () => {
  const screen = await render(<StudyHistoryPersonalContent definitions={[]} answer="manually edited" feedback={{ questionId: 'q-1', transcript: 'baseline', rawTranscript: 'recovered speech' }} />);
  expect(screen.getByText('manually edited')).toBeTruthy(); expect(screen.getByText('本次转写')).toBeTruthy(); expect(screen.getByText('recovered speech')).toBeTruthy();
  await screen.rerender(<StudyHistoryPersonalContent definitions={[]} answer="" recorded feedback={{ questionId: 'q-1', transcript: '', rawTranscript: 'recovered speech' }} />);
  expect(screen.queryByText('本题仅录音，未保存文字回答')).toBeNull(); expect(screen.getByText('recovered speech')).toBeTruthy();
});
