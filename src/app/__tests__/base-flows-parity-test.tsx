import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AccountScreen } from '@/features/account/AccountScreen';
import { APP_DISPLAY_VERSION } from '@/config/app-version';
import { InfoScreen } from '@/features/info/InfoScreen';
import { SystemStateScreen } from '@/features/states/SystemStateScreen';

let mockParams: Record<string, string> = { slug: '' };
const mockSubmitFeedback = jest.fn();
const mockLaunchImageLibrary = jest.fn();

jest.mock('lucide-react-native', () => {
  const { View } = jest.requireActual('react-native');
  const Icon = (props: object) => <View {...props} />;
  return new Proxy({}, { get: () => Icon });
});

jest.mock('@/features/question-bank/recording/expo-recorder-adapter', () => ({
  getMicrophonePermission: jest.fn(async () => ({ granted: false })),
  requestMicrophonePermission: jest.fn(async () => ({ granted: false })),
}));

jest.mock('@/features/ai/ai-client', () => ({
  hasAiConsent: jest.fn().mockResolvedValue(false),
  withdrawAiConsent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/features/feedback/feedback-client', () => ({
  createClientSubmissionId: () => '00000000-0000-4000-8000-000000000123',
  submitFeedback: (...args: unknown[]) => mockSubmitFeedback(...args),
}));

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchImageLibraryAsync: (...args: unknown[]) => mockLaunchImageLibrary(...args),
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ dispatch: jest.fn() }),
  usePreventRemove: jest.fn(),
}));

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn() }),
}));

function withSafeArea(node: React.ReactNode) {
  return <SafeAreaProvider initialMetrics={{ frame: { height: 812, width: 375, x: 0, y: 0 }, insets: { bottom: 34, left: 0, right: 0, top: 47 } }}>{node}</SafeAreaProvider>;
}

describe('base flow parity screens', () => {
  beforeEach(() => {
    mockParams = { slug: '' };
    mockSubmitFeedback.mockReset();
    mockLaunchImageLibrary.mockReset();
  });

  it('covers the account security and future-service boundary', async () => {
    mockParams = { slug: 'security' };
    const screen = await render(withSafeArea(<AccountScreen />));
    expect(screen.getByText('账号安全')).toBeTruthy();
    expect(screen.getByText('专属邀请码')).toBeTruthy();
    expect(screen.getByText('注销账号')).toBeTruthy();
  });

  it('renders the information hub instead of skipping directly to help', async () => {
    mockParams = { slug: 'hub' };
    const screen = await render(withSafeArea(<InfoScreen />));
    expect(screen.getByText('信息与帮助')).toBeTruthy();
    expect(screen.getByText('帮助中心')).toBeTruthy();
    expect(screen.getByText('法律条款')).toBeTruthy();
  });

  it('shows the shared task timestamp version in settings', async () => {
    mockParams = { slug: 'settings' };
    const screen = await render(withSafeArea(<AccountScreen />));
    expect(screen.getByText(APP_DISPLAY_VERSION)).toBeTruthy();
  });

  it('shows the shared task timestamp version on the about page', async () => {
    mockParams = { slug: 'about' };
    const screen = await render(withSafeArea(<InfoScreen />));
    expect(screen.getByText(`版本 ${APP_DISPLAY_VERSION}`)).toBeTruthy();
  });

  it('lists permission and failure states from the state hub', async () => {
    mockParams = { slug: 'gallery' };
    const screen = await render(withSafeArea(<SystemStateScreen />));
    expect(screen.getByText('麦克风权限说明')).toBeTruthy();
    expect(screen.getByText('麦克风被拒绝')).toBeTruthy();
    expect(screen.getByText('全局加载页')).toBeTruthy();
  });

  it('submits a profile feedback form and shows only the ticket number', async () => {
    mockParams = { slug: 'feedback', source: 'profile', sourceRoute: '/profile' };
    mockSubmitFeedback.mockResolvedValue({
      ticketNumber: 'FB-260723-A8K4Q2',
      status: 'received',
      createdAt: '2026-07-23T05:00:00.000Z',
    });
    const screen = await render(withSafeArea(<InfoScreen />));

    expect(screen.getByText('功能建议')).toBeTruthy();
    fireEvent.changeText(screen.getByPlaceholderText('请详细描述你的建议或遇到的问题。'), '希望优化题库检索体验');
    await waitFor(() => expect(screen.getByTestId('feedback-submit').props.accessibilityState?.disabled).toBe(false));
    await act(async () => {
      fireEvent.press(screen.getByTestId('feedback-submit'));
      await Promise.resolve();
    });

    await waitFor(() => expect(mockSubmitFeedback).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText('FB-260723-A8K4Q2')).toBeTruthy());
    expect(mockSubmitFeedback).toHaveBeenCalledWith(expect.objectContaining({
      category: 'feature_suggestion',
      description: '希望优化题库检索体验',
      source: 'profile',
    }));
  });

  it('defaults study feedback to correction and keeps image selection removable', async () => {
    mockParams = {
      slug: 'feedback',
      source: 'study',
      sourceRoute: '/question-bank/listening/study/a/topic-a',
      bankId: 'listening',
      categoryId: 'a',
      topicId: 'topic-a',
      cardId: 'card-a',
    };
    mockLaunchImageLibrary.mockResolvedValue({
      canceled: false,
      assets: [{
        uri: 'file:///feedback.png',
        fileName: 'feedback.png',
        fileSize: 1024,
        mimeType: 'image/png',
        width: 100,
        height: 100,
      }],
    });
    const screen = await render(withSafeArea(<InfoScreen />));

    expect(screen.getByText('已关联当前题目')).toBeTruthy();
    expect(screen.getByText('内容纠错')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('添加反馈图片'));
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.getByLabelText('反馈图片 1')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('移除反馈图片 1'));
    await waitFor(() => expect(screen.queryByLabelText('反馈图片 1')).toBeNull());
  });
});
