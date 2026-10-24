import { GuideBindingContext } from '@/features/usage-guide/GuideBindings';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { StudyReport } from '../components/StudyReport.native';
import { loadLearningRecordReview } from '../platform/learning-record-storage.native';
import { captureStudyReview } from '../lib/study-review.native';
import data from '../data/question-bank.json';
import type { LearningRecord, QuestionBankDataset } from '../types';
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('../components/LookupPronunciation', () => ({ LookupPronunciation: () => null }));
let mockBackHandler: (() => void) | undefined;
jest.mock('@react-navigation/native', () => ({ ...jest.requireActual('@react-navigation/native'), usePreventRemove: (enabled: boolean, back: () => void) => { mockBackHandler = enabled ? back : undefined; } }));
jest.mock('react', () => ({ ...jest.requireActual('react'), lazy: () => jest.requireMock('../components/QuestionBankStudyScreen.native').QuestionBankStudyScreen }));
jest.mock('../platform/learning-record-storage.native', () => ({ loadLearningRecordReview: jest.fn() }));
jest.mock('../components/QuestionBankStudyScreen.native', () => {
  const { Pressable, Text } = jest.requireActual('react-native');
  return { QuestionBankStudyScreen: ({ onReturn, returnLabel, studyPackage }: { onReturn: () => void; returnLabel: string; studyPackage: import('../types').QuestionBankStudyPackage }) => { mockOpenedPackage=studyPackage; return <Pressable onPress={onReturn}><Text>{returnLabel}</Text></Pressable>; } };
});
let mockOpenedPackage: import('../types').QuestionBankStudyPackage | undefined;
const record: LearningRecord = { id: 'report', sessionId: 'attempt', recordType: 'mock_exam', bankId: 'mock_exam', bankTitle: '模拟考试', categoryTitle: 'ICAO 4 初考', topicTitle: '听力', completedCount: 0, totalCount: 20, correctCount: 0, reason: 'complete', durationSeconds: 60, createdAt: '2026-09-09T00:00:00Z', mockExam: { examType: 'icao4-first', mode: 'custom', moduleIds: ['listening'], sectionCounts: [], listeningResult: { answeredCount: 0, correctCount: 0, score: 0, level: 2, totalCount: 20 } } };
it('returns from the readonly paper to the same completed result without leaving or recreating an attempt', async () => {
  const dataset = data[0] as QuestionBankDataset; const category = dataset.categories[0]; const topic = category.topics[0]; const card = topic.cards[0];
  jest.mocked(loadLearningRecordReview).mockResolvedValue({ ...record, studyReview: captureStudyReview([{ id: card.id, dataset, category, topic, card }], {}, {}) });
  const leave = jest.fn();
  const screen = await render(<StudyReport record={record} noteCount={0} interaction="choices" onReturn={leave} />);
  await fireEvent.press(screen.getByText('本次学习记录'));
  await waitFor(() => expect(screen.getByText('返回结束页面')).toBeTruthy());
  await fireEvent.press(screen.getByText('返回结束页面'));
  expect(screen.getByText('听力成绩')).toBeTruthy(); expect(screen.getByText('0 / 50')).toBeTruthy(); expect(leave).not.toHaveBeenCalled(); expect(loadLearningRecordReview).toHaveBeenCalledTimes(1);
});

it('marks tutorial recap complete only after the saved original question opens', async () => {
  const event = jest.fn();
  const controller = { availability: jest.fn(), modal: jest.fn(), surface: jest.fn(() => null), suspend: jest.fn(), pause: jest.fn(), checkpoint: jest.fn(), current: 'study', step: 'study-recap', event, offer: jest.fn(), register: jest.fn(), exit: jest.fn(), start: jest.fn() };
  const screen = await render(<GuideBindingContext.Provider value={controller}><StudyReport record={record} noteCount={0} interaction="choices" onReturn={jest.fn()} /></GuideBindingContext.Provider>);
  jest.mocked(loadLearningRecordReview).mockRejectedValueOnce(new Error('offline'));
  await fireEvent.press(screen.getByText('本次学习记录'));
  await waitFor(() => expect(screen.getByText('记录暂时无法打开，请重试。')).toBeTruthy());
  expect(event).not.toHaveBeenCalled();
  const dataset = data[0] as QuestionBankDataset; const category = dataset.categories[0]; const topic = category.topics[0]; const card = topic.cards[0];
  jest.mocked(loadLearningRecordReview).mockResolvedValueOnce({ ...record, studyReview: captureStudyReview([{ id: card.id, dataset, category, topic, card }], {}, {}) });
  await fireEvent.press(screen.getByText('本次学习记录'));
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
  await waitFor(() => expect(screen.getByText('返回查词与收藏')).toBeTruthy());
  expect(loadLearningRecordReview).toHaveBeenLastCalledWith(saved);
  await fireEvent.press(screen.getByText('返回查词与收藏'));
  expect(screen.getByText(`回到 ${card.taskTitle}`)).toBeTruthy();
});

it('returns from an embedded exam result to setup on system back', async () => {
  const onReturn = jest.fn();
  await render(<StudyReport localReturn record={record} noteCount={0} interaction="choices" onReturn={onReturn} />);
  await act(async () => { mockBackHandler?.(); });
  expect(onReturn).toHaveBeenCalledTimes(1);
});

it('does not reopen a review when its slow load finishes after returning', async () => {
  let resolve!: (value: LearningRecord) => void;
  jest.mocked(loadLearningRecordReview).mockReturnValueOnce(new Promise(done => { resolve = done; }));
  const leave = jest.fn();
  const screen = await render(<StudyReport localReturn record={record} noteCount={0} interaction="choices" onReturn={leave} />);
  await fireEvent.press(screen.getByText('本次学习记录'));
  await act(async () => { mockBackHandler?.(); });
  const dataset = data[0] as QuestionBankDataset; const category = dataset.categories[0]; const topic = category.topics[0]; const card = topic.cards[0];
  await act(async () => resolve({ ...record, studyReview: captureStudyReview([{ id: card.id, dataset, category, topic, card }], {}, {}) }));
  expect(leave).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('返回结束页面')).toBeNull();
});

it('opens the saved session answer card and enters a selected question', async () => {
  const dataset = data[0] as QuestionBankDataset, category = dataset.categories[0], topic = category.topics[0];
  const items = topic.cards.slice(0, 2).map(card => ({id:card.id,dataset,category,topic,card}));
  const saved = {...record, studyReview:captureStudyReview(items, {}, {})};
  jest.mocked(loadLearningRecordReview).mockResolvedValue(saved);
  const screen = await render(<StudyReport record={saved} noteCount={0} interaction="choices" onReturn={jest.fn()} />);
  await fireEvent.press(screen.getByText('查看答题卡'));
  await waitFor(() => expect(screen.getByText('共 2 题')).toBeTruthy());
  await fireEvent.press(screen.getByLabelText('第 2 题'));
  await waitFor(() => expect(screen.getByText('返回结束页面')).toBeTruthy());
});

it('cancels a slow question open when the answer card is closed', async () => {
  const dataset = data[0] as QuestionBankDataset, category = dataset.categories[0], topic = category.topics[0], card = topic.cards[0];
  const saved = {...record,studyReview:captureStudyReview([{id:card.id,dataset,category,topic,card}],{},{})};
  let resolve!: (value:LearningRecord)=>void;
  jest.mocked(loadLearningRecordReview).mockResolvedValueOnce(saved).mockReturnValueOnce(new Promise(done=>{resolve=done;}));
  const screen = await render(<StudyReport record={saved} noteCount={0} interaction="choices" onReturn={jest.fn()} />);
  await fireEvent.press(screen.getByText('查看答题卡'));
  await waitFor(() => expect(screen.getByLabelText('第 1 题')).toBeTruthy());
  await fireEvent.press(screen.getByLabelText('第 1 题'));
  await fireEvent.press(screen.getByLabelText('关闭答题卡'));
  await act(async () => resolve(saved));
  expect(screen.queryByText('返回结束页面')).toBeNull();
  expect(screen.queryByLabelText('第 1 题')).toBeNull();
});

it('shows the complete learning scope after a partial session and opens an unlearned question by stable identity', async()=>{
  const dataset=data[0] as QuestionBankDataset, category=dataset.categories[0], topic=category.topics[0];
  const items=topic.cards.slice(0,3).map(card=>({id:card.id,dataset,category,topic,card}));
  const saved={...record,recordType:'session' as const,totalCount:1,studiedCount:1,studyReview:captureStudyReview(items.slice(0,1),{}, {})};
  jest.mocked(loadLearningRecordReview).mockResolvedValue(saved);
  const screen=await render(<StudyReport record={saved} answerScope={{items,learned:new Set([0]),current:0}} noteCount={0} interaction="choices" onReturn={jest.fn()}/>);
  await fireEvent.press(screen.getByText('查看答题卡'));
  await waitFor(()=>expect(screen.getByText('共 3 题')).toBeTruthy());
  expect(screen.getByText('已学习 1')).toBeTruthy();expect(screen.getByText('未学习 2')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('第 3 题'));
  await waitFor(()=>expect(mockOpenedPackage?.initialItemId).toBe(items[2].id));
  expect(mockOpenedPackage?.items.map(item=>item.id)).toEqual(items.map(item=>item.id));
  expect(mockOpenedPackage?.studyReviewRecord).toBeUndefined();
});
