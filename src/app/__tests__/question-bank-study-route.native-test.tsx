import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { useQuestionBank } from '@/features/question-bank/hooks/useQuestionBank';
import type { useQuestionBankTopic } from '@/features/question-bank/hooks/useQuestionBankTopic.native';
import type { QuestionBankDataset, QuestionBankTopic } from '@/features/question-bank/types';

import NativeQuestionBankStudyRoute from '../question-bank/[bankId]/study/[categoryId]/[topicId].native';

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockBankRetry = jest.fn();
const mockTopicRetry = jest.fn();
let mockCanGoBack = true;
let mockParams: { bankId: string; categoryId: string; topicId: string; cardId?: string; returnTo?: 'radio' | 'annotations' };
let mockBankState: ReturnType<typeof useQuestionBank>;
let mockTopicState: ReturnType<typeof useQuestionBankTopic>;

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ back: mockBack, replace: mockReplace, push: mockPush, canGoBack: () => mockCanGoBack }),
}));
jest.mock('@/features/question-bank/hooks/useQuestionBank', () => ({ useQuestionBank: () => mockBankState }));
jest.mock('@/features/question-bank/hooks/useQuestionBankTopic.native', () => ({ useQuestionBankTopic: () => mockTopicState }));
jest.mock('@/features/question-bank/components/QuestionBankStudyScreen', () => ({
  QuestionBankStudyScreen: () => {
    const { View } = jest.requireActual<typeof import('react-native')>('react-native');
    return <View testID="existing-study-screen" />;
  },
}));

const topic: QuestionBankTopic = {
  id: 'topic', name: 'Topic', declaredCardCount: 1,
  cards: [{ id: 'card', taskTitle: 'Question', audioText: 'Question text' }],
};
// The route reads only the directory and access state; the existing study screen
// remains responsible for rendering the complete dataset.
const dataset = {
  id: 'opi', categories: [{ id: 'category', name: 'Category', topics: [topic] }],
  access: { membershipActive: true },
} as QuestionBankDataset;

function Page() {
  return (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, bottom: 34, left: 0, right: 0 } }}>
      <NativeQuestionBankStudyRoute />
    </SafeAreaProvider>
  );
}

describe('Native study route recovery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanGoBack = true;
    mockParams = { bankId: 'opi', categoryId: 'category', topicId: 'topic' };
    mockBankState = { status: 'ready', data: dataset, source: 'remote', retry: mockBankRetry };
    mockTopicState = { status: 'ready', topic, retry: mockTopicRetry };
  });

  it('keeps the existing study screen for available questions', async () => {
    const screen = await render(<Page />);
    expect(screen.getByTestId('existing-study-screen')).toBeTruthy();
    expect(screen.queryByText('题库学习')).toBeNull();
  });

  it('lets the user leave while the topic is still loading', async () => {
    mockTopicState = { status: 'loading', retry: mockTopicRetry };
    const screen = await render(<Page />);
    expect(screen.getByText('正在准备学习空间…')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: '返回' }));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('falls back to home when launched directly before the directory loads', async () => {
    mockCanGoBack = false;
    mockBankState = { status: 'loading', retry: mockBankRetry };
    mockTopicState = { status: 'loading', retry: mockTopicRetry };
    const screen = await render(<Page />);
    await fireEvent.press(screen.getByRole('button', { name: '返回' }));
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)');
    expect(mockBack).not.toHaveBeenCalled();
  });

  it.each(['membership-required', 'locked-card'] as const)('offers a return independently of the %s purchase action', async (state) => {
    mockCanGoBack = false;
    if (state === 'membership-required') mockTopicState = { status: state, retry: mockTopicRetry };
    else {
      mockParams.cardId = 'unavailable';
      mockBankState = { status: 'ready', data: { ...dataset, access: { ...dataset.access!, membershipActive: false } }, source: 'remote', retry: mockBankRetry };
    }
    const screen = await render(<Page />);
    await fireEvent.press(screen.getByText('查看会员方案'));
    expect(mockPush).toHaveBeenCalledWith('/account/membership');
    await fireEvent.press(screen.getByRole('button', { name: '返回' }));
    expect(mockReplace).toHaveBeenCalledWith({ pathname: '/question-bank/[bankId]', params: { bankId: 'opi' } });
  });

  it('preserves retries after errors and still permits returning to the directory', async () => {
    mockCanGoBack = false;
    mockTopicState = { status: 'error', error: new Error('network'), retry: mockTopicRetry };
    const screen = await render(<Page />);
    await fireEvent.press(screen.getByText('重新加载'));
    expect(mockBankRetry).toHaveBeenCalledTimes(1);
    expect(mockTopicRetry).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole('button', { name: '返回' }));
    expect(mockReplace).toHaveBeenCalledWith({ pathname: '/question-bank/[bankId]', params: { bankId: 'opi' } });
  });

  it('offers a correctly labelled directory fallback for an unavailable question', async () => {
    mockCanGoBack = false;
    mockParams.cardId = 'removed';
    const screen = await render(<Page />);
    expect(screen.getByText('原题不可用')).toBeTruthy();
    await fireEvent.press(screen.getByText('返回题库'));
    expect(mockReplace).toHaveBeenCalledWith({ pathname: '/question-bank/[bankId]', params: { bankId: 'opi' } });
  });

  it.each([
    ['radio', '返回随身听', '/content/radio'],
    ['annotations', '返回我的标注', '/annotations'],
  ] as const)('returns empty %s content to its source with no history', async (returnTo, label, destination) => {
    mockCanGoBack = false;
    mockParams.returnTo = returnTo;
    mockTopicState = { status: 'ready', topic: { ...topic, cards: [] }, retry: mockTopicRetry };
    const screen = await render(<Page />);
    await fireEvent.press(screen.getByText(label));
    expect(mockReplace).toHaveBeenCalledWith(destination);
    mockReplace.mockClear();
    await fireEvent.press(screen.getByRole('button', { name: '返回' }));
    expect(mockReplace).toHaveBeenCalledWith(destination);
  });
});
