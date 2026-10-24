import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { useQuestionBank } from '@/features/question-bank/hooks/useQuestionBank.native';
import type { useQuestionBankTopic } from '@/features/question-bank/hooks/useQuestionBankTopic.native';
import type { QuestionBankDataset, QuestionBankTopic } from '@/features/question-bank/types';

import NativeQuestionBankStudyRoute from '../question-bank/[bankId]/study/[categoryId]/[topicId].native';

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockDismissTo = jest.fn();
const mockPush = jest.fn();
const mockBankRetry = jest.fn();
const mockTopicRetry = jest.fn();
let mockCanGoBack = true;
let mockParams: { bankId: string; categoryId: string; topicId: string; cardId?: string; guide?: string; returnTo?: 'radio' | 'annotations' };
let mockBankState: Omit<Extract<ReturnType<typeof useQuestionBank>, { status: 'ready' }>, 'catalog'> & { catalog?: QuestionBankDataset } | Exclude<ReturnType<typeof useQuestionBank>, { status: 'ready' }>;
let mockTopicState: ReturnType<typeof useQuestionBankTopic>;

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ back: mockBack, replace: mockReplace, dismissTo: mockDismissTo, push: mockPush, canGoBack: () => mockCanGoBack }),
}));
jest.mock('@/features/question-bank/hooks/useQuestionBank.native', () => ({ useQuestionBank: () => mockBankState }));
jest.mock('@/features/question-bank/hooks/useQuestionBankTopic.native', () => ({ useQuestionBankTopic: () => mockTopicState }));
jest.mock('@/features/account/profile-store.native', () => ({ useProfile: () => ({ studyScope: 'selected' }) }));
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
  id: 'opi', declaredCardCount: 1, categories: [{ id: 'category', name: 'Category', topics: [topic] }],
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
    mockBankState = { status: 'ready', data: dataset, catalog: dataset, source: 'remote', retry: mockBankRetry };
    mockTopicState = { status: 'ready', topic, retry: mockTopicRetry };
  });

  it('opens explicit Sentence1 teaching from the raw catalog without changing the daily exam scope', async () => {
    const first = {...topic, cards:[{...topic.cards[0],id:'sentence900-main-001'}]};
    const raw = {...dataset,id:'sentences900',categories:[{...dataset.categories[0],topics:[first]}]} as QuestionBankDataset;
    mockParams = {bankId:'sentences900',categoryId:'category',topicId:'topic',cardId:'sentence900-main-001',guide:'study'};
    mockBankState = {status:'ready',data:{...raw,categories:[]},catalog:raw,source:'remote',retry:mockBankRetry};
    mockTopicState = {status:'ready',topic:first,retry:mockTopicRetry};
    const screen=await render(<Page/>);
    expect(screen.getByTestId('existing-study-screen')).toBeTruthy();
    expect(screen.queryByText('不在当前学习范围')).toBeNull();
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
      const lockedTopic = { ...topic, declaredCardCount: 2, scopeCardIds: { all: ['card', 'unavailable'], selected: ['card', 'unavailable'], crash: ['card', 'unavailable'] } };
      mockBankState = { status: 'ready', data: { ...dataset, declaredCardCount: 2, categories: [{ ...dataset.categories[0], topics: [lockedTopic] }], access: { ...dataset.access!, membershipActive: false } }, source: 'remote', retry: mockBankRetry };
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

  it('offers a retry when a missing body is not proof of deletion', async () => {
    mockCanGoBack = false;
    mockParams.cardId = 'removed';
    mockBankState = { status: 'ready', data: dataset, catalog: { ...dataset, declaredCardCount: 2, categories: [{ ...dataset.categories[0], topics: [{ ...topic, declaredCardCount: 2, scopeCardIds: { all: ['card', 'removed'], selected: ['card', 'removed'], crash: ['card', 'removed'] } }] }] }, source: 'remote', retry: mockBankRetry };
    const screen = await render(<Page />);
    expect(screen.getByText('学习内容加载失败')).toBeTruthy();
    await fireEvent.press(screen.getByText('重新加载'));
    expect(mockTopicRetry).toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: '返回' }));
    expect(mockReplace).toHaveBeenCalledWith({ pathname: '/question-bank/[bankId]', params: { bankId: 'opi' } });
  });

  it('does not suggest paying for a question excluded by the daily scope', async () => {
    mockParams.cardId = 'outside';
    mockBankState = { status: 'ready', data: { ...dataset, declaredCardCount: 2, access: { ...dataset.access!, membershipActive: false } }, source: 'remote', retry: mockBankRetry };
    mockTopicState = { status: 'ready', topic, scopeExcludedCardIds: ['outside'], retry: mockTopicRetry };
    const screen = await render(<Page />);
    expect(screen.getByText('不在当前学习范围')).toBeTruthy();
    expect(screen.queryByText('查看会员方案')).toBeNull();
    await fireEvent.press(screen.getByText('返回题库首页'));
    expect(mockDismissTo).toHaveBeenCalledWith('/(tabs)');
  });

  it('does not suggest paying for a deleted question when the topic itself is protected', async () => {
    mockParams.cardId = 'deleted';
    const indexed = { ...topic, scopeCardIds: { all: ['card'], selected: ['card'], crash: ['card'] } };
    mockBankState = { status: 'ready', data: { ...dataset, categories: [{ ...dataset.categories[0], topics: [indexed] }], access: { ...dataset.access!, membershipActive: false } }, source: 'remote', retry: mockBankRetry };
    mockTopicState = { status: 'membership-required', retry: mockTopicRetry };
    const screen = await render(<Page />);
    expect(screen.getByText('原题不可用')).toBeTruthy();
    expect(screen.queryByText('查看会员方案')).toBeNull();
  });

  it('does not suggest paying for an excluded protected topic', async () => {
    mockBankState = { status: 'ready', data: { ...dataset, categories: [{ ...dataset.categories[0], topics: [] }] }, catalog: dataset, source: 'remote', retry: mockBankRetry };
    mockTopicState = { status: 'membership-required', retry: mockTopicRetry };
    const screen = await render(<Page />);
    expect(screen.getByText('不在当前学习范围')).toBeTruthy();
    expect(screen.queryByText('查看会员方案')).toBeNull();
  });

  it('uses public scope identities when an excluded card belongs to a protected topic', async () => {
    mockParams.cardId = 'outside';
    const indexed = { ...topic, scopeCardIds: { all: ['card', 'outside'], selected: ['card'], crash: ['card'] } };
    mockBankState = { status: 'ready', data: { ...dataset, categories: [{ ...dataset.categories[0], topics: [indexed] }] }, source: 'remote', retry: mockBankRetry };
    mockTopicState = { status: 'membership-required', retry: mockTopicRetry };
    const screen = await render(<Page />);
    expect(screen.getByText('不在当前学习范围')).toBeTruthy();
    expect(screen.queryByText('查看会员方案')).toBeNull();
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
