import { fireEvent, render } from '@testing-library/react-native';
import { MyAnnotationsScreen } from '../components/MyAnnotationsScreen.native';
import type { CardReference } from '../data/card-references.native';
const mockPush = jest.fn(), mockRetry = jest.fn();
let mockReference: CardReference;
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: jest.fn() }), useFocusEffect: () => undefined }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: ({ children }: { children: React.ReactNode }) => children, useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }) }));
jest.mock('../annotations/use-card-references.native', () => ({ useCardReferences: () => ({ values: new Map([['listening:member-card', mockReference]]), retry: mockRetry }) }));
jest.mock('../annotations/use-question-annotations', () => ({ useQuestionAnnotations: () => ({
  hydrated: true, refresh: jest.fn(), tagDefinitions: [{ id: 'memory', label: '记忆', color: 'yellow' }], highlightDefinitions: [],
  store: { entries: { one: { bankId: 'listening', categoryId: 'old-category', topicId: 'old-topic', cardId: 'member-card', tagIds: ['memory'], highlights: [], note: '', updatedAt: '2026-10-16T00:00:00.000Z' } } },
}) }));
beforeEach(() => { jest.clearAllMocks(); });
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
