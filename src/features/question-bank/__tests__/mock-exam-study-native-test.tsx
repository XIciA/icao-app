import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert, Platform, Text as MockText, View as MockView } from 'react-native';
import { QuestionBankStudyScreen } from '../components/QuestionBankStudyScreen.native';
import { sqliteLearningStore } from '../platform/learning-store.native';
import data from '../data/question-bank.json';
import type { QuestionBankDataset, QuestionBankStudyItem, QuestionBankStudyPackage } from '../types';
import { captureStudyReview } from '../lib/study-review.native';
const mockEntitlement: { snapshot: { membership: { active: boolean; expiresAt: string } } } = { snapshot: { membership: { active: false, expiresAt: '2020-01-01T00:00:00Z' } } };
let mockNote = '';
const mockToggleFavorite = jest.fn();
const mockAnnotationFlush = jest.fn(async () => true);
const mockToggleTag = jest.fn();
jest.mock('@/features/native-commercial-testflight/commerce-entitlement-events', () => ({ getCommerceEntitlementSnapshot: () => mockEntitlement, subscribeCommerceEntitlementChanges: () => () => {} }));
jest.mock('../data/repository.native', () => ({ getEmbeddedQuestionBanks: () => [] }));
jest.mock('@/platform/product-clicks.native', () => ({ trackProductClick: jest.fn(), setClickStudyContext: jest.fn() }));
jest.mock('expo-router', () => ({ useFocusEffect: (callback: () => void) => jest.requireActual('react').useEffect(callback, [callback]), useRouter: () => ({ dismissTo: jest.fn(), replace: jest.fn(), canGoBack: () => true, back: jest.fn() }) }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: MockView, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));
jest.mock('@react-navigation/native', () => ({ usePreventRemove: jest.fn() }));
jest.mock('react-native-reanimated', () => ({ ...jest.requireActual('react-native-reanimated/mock'), useReducedMotion: () => true }));
jest.mock('../hooks/useQuestionBankAsset', () => ({ useQuestionBankAsset: () => ({ resolving: false, retry: jest.fn() }) }));
jest.mock('../hooks/useQuestionBankAudioPreload', () => ({ useQuestionBankAudioPreload: jest.fn() }));
jest.mock('../annotations/use-question-annotations-with-save.native', () => ({ useQuestionAnnotations: () => ({ flushPendingSaves: mockAnnotationFlush, toggleTag: mockToggleTag, entry: mockNote ? { note: mockNote, highlights: [], tagIds: [] } : undefined, highlightDefinitions: jest.requireActual('../annotations/types').DEFAULT_ANNOTATION_HIGHLIGHTS, tagDefinitions: jest.requireActual('../annotations/types').DEFAULT_ANNOTATION_TAGS, store: { entries: {} } }) }));
jest.mock('../platform/network-service', () => ({ getConnectivity: async () => 'online', subscribeConnectivity: () => () => {} }));
jest.mock('@/features/vocabulary/progress-store', () => ({ useWordFavorites: () => ({ isFavorite: () => false, toggleFavorite: mockToggleFavorite }) }));
jest.mock('../static-word-lookup/repository', () => ({ hasStaticWordLookup: () => true, findStaticWordLookup: (word: string) => ({ word }) }));
jest.mock('../components/ExamQuestionAudio.native', () => ({ ExamQuestionAudio: ({ practiceControls }: { practiceControls?: React.ReactNode }) => <MockView><MockText>自动播放题目</MockText>{practiceControls}</MockView> }));
jest.mock('../components/ExamSpeakingPractice.native', () => ({ ExamSpeakingPractice: () => <MockText>口语作答</MockText> }));
jest.mock('../components/StudyCardStack', () => ({ StudyCardStack: ({ primary, transcript, workbench, revealed }: { primary: React.ReactNode; transcript: React.ReactNode; workbench: React.ReactNode; revealed: boolean }) => <MockView>{primary}{revealed ? <>{transcript}{workbench}</> : null}</MockView> }));
jest.mock('../components/StudyAudioPlayer', () => ({ StudyAudioPlayer: () => null }));
jest.mock('../components/ImageQuestionCard', () => ({ ImageQuestionCard: ({ imageAlt }: { imageAlt: string }) => <MockText>{imageAlt}</MockText> }));
jest.mock('../components/SpeakingPracticePanel', () => ({ SpeakingPracticePanel: () => null }));
jest.mock('../components/StudyWorkbench.native', () => ({ StudyWorkbench: () => <MockText>AI工作台</MockText> }));
jest.mock('../platform/learning-store.native', () => ({ migrateLegacyCardState: (state: unknown) => state, sqliteLearningStore: { getTopicStates: jest.fn(async () => ({})), addRecord: jest.fn(async () => undefined), saveCardState: jest.fn() } }));
jest.mock('../recording/recording-repository', () => ({ recordingRepository: { cleanupSession: jest.fn(), discard: jest.fn() } }));
function paper(mixed = true): QuestionBankStudyPackage {
  const dataset = data[0] as QuestionBankDataset; const category = dataset.categories[0]; const topic = category.topics[0];
  const items: QuestionBankStudyItem[] = Array.from({ length: 20 }, (_, index) => ({ id: `item-${index}`, dataset, category, topic, card: { id: `card-${index}`, taskTitle: `题目 ${index + 1}`, audioText: '隐藏题干原文', choices: ['正确选项', '另一个选项'], correctChoiceIndex: 0 } }));
  if (mixed) items.push({ ...items[0], id: 'opi-item', dataset: { ...dataset, id: 'opi', study: { ...dataset.study, interaction: 'speaking' } }, card: { id: 'opi-card', taskTitle: 'OPI', audioText: 'Question' } });
  return { id: 'screen-paper', startedAt: '2026-09-09T00:00:00.000Z', progressMode: 'session-only', items, record: { id: 'screen-record', bankId: 'mock_exam', bankTitle: '模拟考试', categoryTitle: 'ICAO 4 初考', topicTitle: '听力', recordType: 'mock_exam', mockExam: { examType: 'icao4-first', mode: 'custom', moduleIds: mixed ? ['listening', 'opi'] : ['listening'], sectionCounts: [] } } };
}
beforeEach(() => { jest.clearAllMocks(); mockAnnotationFlush.mockResolvedValue(true); mockNote = ''; mockEntitlement.snapshot.membership = { active: false, expiresAt: '2020-01-01T00:00:00Z' }; });
it('preserves the exam on save failure and permits leaving only after explicit confirmation', async () => {
  const onReturn = jest.fn();
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  jest.mocked(sqliteLearningStore.addRecord).mockRejectedValueOnce(new Error('storage_failed'));
  const screen = await render(<QuestionBankStudyScreen studyPackage={paper()} onReturn={onReturn} />);
  await waitFor(() => expect(screen.getByText('自动播放题目')).toBeTruthy());
  expect(screen.queryByText('仍然返回')).toBeNull();
  await fireEvent.press(screen.getByText('结束'));
  await waitFor(() => expect(screen.getByText('学习报告保存失败，请重试。')).toBeTruthy());
  expect(onReturn).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText('仍然返回'));
  expect(onReturn).not.toHaveBeenCalled();
  expect(alert.mock.calls[0][1]).toContain('尚未保存的本次作答可能丢失');
  await act(async () => { alert.mock.calls[0][2]?.find(button => button.text === '仍然返回')?.onPress?.(); });
  expect(onReturn).toHaveBeenCalledTimes(1);
  expect(sqliteLearningStore.addRecord).toHaveBeenCalledTimes(1);
  alert.mockRestore();
});
it('runs sequentially with no answer/tool/previous controls, shows listening score, then ends into the same record', async () => {
  const screen = await render(<QuestionBankStudyScreen studyPackage={paper()} onReturn={() => {}} />);
  await waitFor(() => expect(screen.getByText('自动播放题目')).toBeTruthy());
  expect(screen.queryByText('上一题')).toBeNull(); expect(screen.queryByText('答案')).toBeNull(); expect(screen.queryByText('AI工作台')).toBeNull(); expect(screen.queryByText('隐藏题干原文')).toBeNull();
  for (let index = 0; index < 19; index += 1) await fireEvent.press(screen.getByLabelText('下一题'));
  await fireEvent.press(screen.getByLabelText('提交听力'));
  await waitFor(() => expect(screen.getByText('听力成绩')).toBeTruthy());
  expect(screen.getByText('0 / 50')).toBeTruthy(); expect(screen.getByText('2 级')).toBeTruthy(); expect(screen.queryByText('查看本次记录')).toBeNull();
  await fireEvent.press(screen.getByText('进入下一板块'));
  await waitFor(() => expect(screen.getByText('口语作答')).toBeTruthy());
  await fireEvent.press(screen.getByText('结束'));
  await waitFor(() => expect(screen.getByText('本次模拟考试已结束')).toBeTruthy());
  expect(screen.getByText('未完成')).toBeTruthy(); expect(screen.getByText('0 / 50')).toBeTruthy(); expect(screen.getByText('全部学习记录')).toBeTruthy();
  const calls = jest.mocked(sqliteLearningStore.addRecord).mock.calls;
  expect(calls).toHaveLength(2); expect(calls[0][0].id).toBe(calls[1][0].id);
});
it('uses the listening result itself as the final screen for a listening-only exam', async () => {
  const screen = await render(<QuestionBankStudyScreen studyPackage={paper(false)} onReturn={() => {}} />);
  await waitFor(() => expect(screen.getByText('自动播放题目')).toBeTruthy());
  for (let index = 0; index < 19; index += 1) await act(async () => { await fireEvent.press(screen.getByLabelText('下一题')); });
  await fireEvent.press(screen.getByLabelText('提交听力'));
  await waitFor(() => expect(screen.getByText('听力成绩')).toBeTruthy());
  expect(screen.queryByText('进入下一板块')).toBeNull(); expect(screen.getByText('全部学习记录')).toBeTruthy(); expect(screen.queryByText('已结束')).toBeNull();
});

it('keeps the source picture visible beside its OPI question without creating an extra exam answer', async () => {
  const input = paper(); const opi = input.items.at(-1)!;
  opi.topic = { ...opi.topic, cards: [{ id: 'picture', taskTitle: 'Picture', kind: 'image', image: '/assets/opi.jpg', imageAlt: 'OPI 场景图片' }, opi.card] };
  input.items = [opi]; input.record.mockExam!.moduleIds = ['opi'];
  const screen = await render(<QuestionBankStudyScreen studyPackage={input} onReturn={() => {}} />);
  await waitFor(() => expect(screen.getByText('OPI 场景图片')).toBeTruthy());
  expect(screen.queryByText('上一题')).toBeNull();
  await fireEvent.press(screen.getByText('结束'));
  const saved = jest.mocked(sqliteLearningStore.addRecord).mock.calls.at(-1)![0];
  expect(saved.totalCount).toBe(1); expect(saved.studyReview?.items[0].materials?.[0].id).toBe('picture');
});

it('keeps the shared picture beside ordinary daily OPI questions as well', async () => {
  const input = paper(); const opi = input.items.at(-1)!;
  opi.topic = { ...opi.topic, cards: [{ id: 'picture', taskTitle: 'Picture', kind: 'image', image: '/assets/opi.jpg', imageAlt: '日常 OPI 场景图片' }, opi.card] };
  input.items = [opi];
  input.record = { ...input.record, recordType: 'session', mockExam: undefined };
  const screen = await render(<QuestionBankStudyScreen studyPackage={input} onReturn={() => {}} />);
  await waitFor(() => expect(screen.getByText('日常 OPI 场景图片')).toBeTruthy());
  expect(screen.queryByText('自动播放题目')).toBeNull();
});

it('hides expired member question media and references while keeping the attempt answer and current shared note', async () => {
  const input = paper(); const opi = input.items.at(-1)!;
  if (opi.card.kind === 'image') throw new Error('expected OPI text question');
  opi.card = { ...opi.card, referenceText: '付费参考答案' };
  opi.topic = { ...opi.topic, cards: [{ id: 'picture', taskTitle: 'Picture', kind: 'image', image: '/assets/opi.jpg', imageAlt: '付费 OPI 场景图片' }, opi.card] };
  input.items = [opi]; input.record.mockExam!.moduleIds = ['opi'];
  input.studyReviewRecord = { ...input.record, id: 'expired-history', createdAt: input.startedAt, totalCount: 1, completedCount: 1, correctCount: 0, durationSeconds: 10, reason: 'complete', studyReview: captureStudyReview(input.items, {}, { [opi.id]: '这次独立回答' }) };
  mockNote = '当前共享笔记';
  const screen = await render(<QuestionBankStudyScreen studyPackage={input} onReturn={() => {}} />);
  await waitFor(() => expect(screen.getByText('这次独立回答')).toBeTruthy());
  expect(screen.getByText('当前共享笔记')).toBeTruthy();
  expect(screen.queryByText('付费 OPI 场景图片')).toBeNull(); expect(screen.queryByText('自动播放题目')).toBeNull(); expect(screen.queryByText('付费参考答案')).toBeNull();
  expect(screen.queryByText('口语作答')).toBeNull(); expect(screen.queryByText('AI工作台')).toBeNull();
  expect(sqliteLearningStore.addRecord).not.toHaveBeenCalled();
  await screen.unmount();
  mockEntitlement.snapshot.membership = { active: true, expiresAt: '2099-01-01T00:00:00Z' };
  const restored = await render(<QuestionBankStudyScreen studyPackage={input} onReturn={() => {}} />);
  await waitFor(() => expect(restored.getByText('付费 OPI 场景图片')).toBeTruthy());
  await fireEvent.press(restored.getByLabelText('显示答案'));
  expect(restored.getByText('AI工作台')).toBeTruthy();
  expect(sqliteLearningStore.addRecord).not.toHaveBeenCalled();
});

it('history uses ordinary listening choices, lookup and favorites without creating a browsing record', async () => {
  const input = paper(false);
  const first = input.items[0];
  if (first.card.kind === 'image') throw new Error('expected listening choices');
  input.items = [{ ...first, card: { ...first.card, choices: ['Request deviation now', 'Continue approach'] } }];
  input.studyReviewRecord = { ...input.record, id: 'readonly-listening', createdAt: input.startedAt, totalCount: 1, completedCount: 1, correctCount: 0, durationSeconds: 10, reason: 'complete', studyReview: captureStudyReview(input.items, {}, {}) };
  mockEntitlement.snapshot.membership.active = true;
  const screen = await render(<QuestionBankStudyScreen studyPackage={input} onReturn={() => {}} />);
  await waitFor(() => expect(screen.getByLabelText('选项 A：Request deviation now')).toBeTruthy());
  expect(screen.getByTestId('annotation-toolbar')).toBeTruthy();
  await fireEvent(screen.getByLabelText('长按查词：deviation'), 'longPress');
  await waitFor(() => expect(screen.getByLabelText('收藏')).toBeTruthy());
  await fireEvent.press(screen.getByLabelText('收藏'));
  expect(mockToggleFavorite).toHaveBeenCalledWith({ word: 'deviation' });
  expect(sqliteLearningStore.addRecord).not.toHaveBeenCalled();
});
it('closes an existing lookup sheet when the screen enters an exam', async () => {
  const input = paper(false);
  const first = input.items[0];
  if (first.card.kind === 'image') throw new Error('expected listening choices');
  input.items = [{ ...first, card: { ...first.card, choices: ['Request deviation now', 'Continue approach'] } }];
  input.record = { ...input.record, recordType: 'session', mockExam: undefined };
  mockEntitlement.snapshot.membership.active = true;
  const screen = await render(<QuestionBankStudyScreen studyPackage={input} onReturn={() => {}} />);
  await waitFor(() => expect(screen.getByLabelText('长按查词：deviation')).toBeTruthy());
  await fireEvent(screen.getByLabelText('长按查词：deviation'), 'longPress');
  await waitFor(() => expect(screen.getByLabelText('收藏')).toBeTruthy());
  const examInput = { ...input, record: { ...input.record, recordType: 'mock_exam' as const } };
  await screen.rerender(<QuestionBankStudyScreen studyPackage={examInput} onReturn={() => {}} />);
  await waitFor(() => expect(screen.queryByLabelText('收藏')).toBeNull());
  expect(screen.queryByLabelText('查词结果')).toBeNull();
  expect(mockToggleFavorite).not.toHaveBeenCalled();
});

it('releases the navigation lock after an annotation save failure so retry and return remain usable', async () => {
  const input = paper(false);
  input.record = { ...input.record, recordType: 'session', mockExam: undefined };
  const onReturn = jest.fn();
  const screen = await render(<QuestionBankStudyScreen studyPackage={input} onReturn={onReturn} />);
  await waitFor(() => expect(screen.getByLabelText('下一题')).toBeTruthy());
  mockAnnotationFlush.mockResolvedValueOnce(false);
  await fireEvent.press(screen.getByLabelText('下一题'));
  await waitFor(() => expect(screen.getByText('笔记或标注保存失败，请重试。')).toBeTruthy());
  await fireEvent.press(screen.getByLabelText('下一题'));
  await waitFor(() => expect(screen.getByText('2 / 20')).toBeTruthy());
  await fireEvent.press(screen.getByLabelText('返回题库目录'));
  await waitFor(() => expect(onReturn).toHaveBeenCalledTimes(1));
});
jest.mock('../components/LookupPronunciation', () => ({ LookupPronunciation: () => null }));

it('opens tag and highlight management from the shared study screen on formal Web', async () => {
  const originalPlatform = Platform.OS;
  Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });
  try {
    const input = paper(false);
    input.record = { ...input.record, recordType: 'session', mockExam: undefined };
    const screen = await render(<QuestionBankStudyScreen studyPackage={input} onReturn={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('annotation-panel-anchor')).toBeTruthy());
    await fireEvent(screen.getByTestId('annotation-panel-anchor'), 'layout', { nativeEvent: { layout: { x: 0, y: 50, width: 400, height: 40 } } });
    await fireEvent.press(screen.getByLabelText('开启标签模式'));
    await fireEvent.press(screen.getByLabelText('管理标注分类'));
    await fireEvent.press(screen.getByLabelText('颜色 yellow 已使用'));
    expect(screen.getByLabelText('标注名称').props.value).toBe('记忆');
    await fireEvent.changeText(screen.getByLabelText('标注名称'), '待保存草稿');
    await fireEvent.press(screen.getByLabelText('取消编辑标注'));
    expect(screen.queryByLabelText('标注名称')).toBeNull();
    expect(mockToggleTag).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText('开启高亮模式'));
    await fireEvent.press(screen.getByLabelText('管理标注分类'));
    expect(screen.getByText('管理高亮 · 修改当前颜色名称')).toBeTruthy();
    await screen.unmount();
  } finally { Object.defineProperty(Platform, 'OS', { value: originalPlatform, configurable: true }); }
});
