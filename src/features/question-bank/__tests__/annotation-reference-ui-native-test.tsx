import { fireEvent, render } from '@testing-library/react-native';
import { MyAnnotationsScreen } from '../components/MyAnnotationsScreen.native';
import { contentFingerprint } from '../annotations/text';
import type { AnnotationHighlight } from '../annotations/types';
import type { CardReference } from '../data/card-references.native';
const mockPush = jest.fn(), mockRetry = jest.fn();
let mockReference: CardReference;
let mockHighlights: AnnotationHighlight[] = [];
let mockNote = '';
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: jest.fn() }), useFocusEffect: () => undefined }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: ({ children }: { children: React.ReactNode }) => children, useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }) }));
jest.mock('../annotations/use-card-references.native', () => ({ useCardReferences: () => ({ values: new Map([['listening:member-card', mockReference]]), retry: mockRetry }) }));
jest.mock('../annotations/use-question-annotations', () => ({ useQuestionAnnotations: () => ({
  hydrated: true, refresh: jest.fn(), tagDefinitions: [{ id: 'memory', label: '记忆', color: 'yellow' }], highlightDefinitions: [{ id: 'green', label: '重点', color: 'green' }, { id: 'yellow', label: '记忆', color: 'yellow' }],
  store: { entries: { one: { bankId: 'listening', categoryId: 'old-category', topicId: 'old-topic', cardId: 'member-card', tagIds: ['memory'], highlights: mockHighlights, note: mockNote, updatedAt: '2026-10-16T00:00:00.000Z' } } },
}) }));
beforeEach(() => { jest.clearAllMocks(); mockHighlights = []; mockNote = ''; });
it('renders downloaded member text and opens its current directory location', async () => {
  mockReference = { status: 'ready', location: { bankId: 'listening', categoryId: 'current-category', topicId: 'current-topic', cardId: 'member-card', bankTitle: '听力', categoryTitle: '分类', topicTitle: '主题', cardIndex: 0, card: { id: 'member-card', taskTitle: '原题', audioText: 'The member question.' } } };
  const screen = await render(<MyAnnotationsScreen />);
  await fireEvent.press(screen.getByText('The member question.'));
  expect(mockPush).toHaveBeenCalledWith(expect.objectContaining({ params: expect.objectContaining({ categoryId: 'current-category', topicId: 'current-topic', cardId: 'member-card' }) }));
  expect(screen.queryByText('原题内容已更新或不可用')).toBeNull();
});
it('keeps an unavailable annotation retryable and explains uncertainty', async () => {
  mockReference = { status: 'unavailable', message: '原题加载未完成，请联网后重试。' };
  const screen = await render(<MyAnnotationsScreen />);
  await fireEvent.press(screen.getAllByText(/原题加载未完成/)[0]);
  expect(mockRetry).toHaveBeenCalled();
  expect(mockPush).not.toHaveBeenCalled();
});

it('keeps original context with the note and all highlighted blocks in the same question', async () => {
  const text = 'Request diversion.';
  const option = 'Hold position.';
  mockReference = { status: 'ready', location: { bankId: 'listening', categoryId: 'current', topicId: 'topic', cardId: 'member-card', bankTitle: '听力', categoryTitle: '分类', topicTitle: '主题', cardIndex: 0, card: { id: 'member-card', taskTitle: '原题', audioText: text, choices: [option] } } };
  mockNote = '先申请备降，再确认许可。';
  mockHighlights = [
    { blockId: 'question', wordIndex: 1, colorId: 'green', quote: 'diversion.', sentence: text, contentFingerprint: contentFingerprint(text) },
    { blockId: 'choice-0', wordIndex: 0, colorId: 'yellow', quote: 'Hold', sentence: option, contentFingerprint: contentFingerprint(option) },
  ];
  const screen = await render(<MyAnnotationsScreen />);
  await fireEvent.press(screen.getByText('笔记'));
  expect(screen.getByText(text)).toBeTruthy();
  expect(screen.getByText(mockNote)).toBeTruthy();
  await fireEvent.press(screen.getByText('高亮'));
  expect(screen.getByLabelText('高亮词：diversion.')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('展开原文 原题'));
  expect(screen.getByText('选项 A')).toBeTruthy();
  expect(screen.getByLabelText('高亮词：Hold')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('筛选记忆'));
  expect(screen.queryByLabelText('高亮词：diversion.')).toBeNull();
  expect(screen.getByLabelText('高亮词：Hold')).toBeTruthy();
  expect(screen.queryByText(/另有 .* 个词被高亮/)).toBeNull();
});

it('retains membership routing and never opens a missing question', async () => {
  mockReference = { status: 'membership-required', message: '需要会员权限' };
  const screen = await render(<MyAnnotationsScreen />);
  await fireEvent.press(screen.getByText(/需要会员权限/));
  expect(mockPush).toHaveBeenCalledWith('/account/membership');
  mockReference = { status: 'not-found', message: '原题不存在' };
  await screen.rerender(<MyAnnotationsScreen />);
  mockPush.mockClear();
  await fireEvent.press(screen.getByText('原题不存在'));
  expect(mockPush).not.toHaveBeenCalled();
});

it('shows a late highlighted sentence while collapsed and the whole text after expanding', async () => {
  const text = 'Routine information. '.repeat(20) + 'Request diversion now.';
  mockReference = { status: 'ready', location: { bankId: 'listening', categoryId: 'current', topicId: 'topic', cardId: 'member-card', bankTitle: '听力', categoryTitle: '分类', topicTitle: '主题', cardIndex: 0, card: { id: 'member-card', taskTitle: '长题', audioText: text } } };
  mockHighlights = [{ blockId: 'question', wordIndex: 41, colorId: 'green', quote: 'diversion', sentence: 'Request diversion now.', contentFingerprint: contentFingerprint(text) }];
  const screen = await render(<MyAnnotationsScreen />);
  await fireEvent.press(screen.getByText('高亮'));
  expect(screen.getByLabelText('高亮词：diversion')).toBeTruthy();
  expect(screen.queryAllByText('Routine')).toHaveLength(0);
  await fireEvent.press(screen.getByLabelText('展开原文 长题'));
  expect(screen.getAllByText('Routine')).toHaveLength(20);
  expect(screen.getByLabelText('高亮词：diversion')).toBeTruthy();
});
