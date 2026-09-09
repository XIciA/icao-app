import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { HotspotAccessResult } from '../access-state.native';
import { HotspotDetailScreen } from '../HotspotDetailScreen';
import { HotspotStudyScreen } from '../HotspotStudyScreen';
import { loadHotspotBriefs } from '../repository';

const mockBack = jest.fn();
const mockReplace = jest.fn();
let mockCanGoBack = true;
const mockPush = jest.fn();
const mockRetry = jest.fn();
const mockUseHotspotAccess = jest.fn();
let mockState: { status: 'loading' } | HotspotAccessResult;

jest.mock('lucide-react-native', () => {
  const { View } = jest.requireActual('react-native');
  const Icon = (props: object) => <View {...props} />;
  return new Proxy({}, { get: () => Icon });
});

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, canGoBack: () => mockCanGoBack, replace: mockReplace, push: mockPush }),
}));

jest.mock('../use-hotspot-access.native', () => ({
  useHotspotAccess: (briefId: string) => {
    mockUseHotspotAccess(briefId);
    return { retry: mockRetry, state: mockState };
  },
}));

jest.mock('@/features/question-bank/components/QuestionBankStudyScreen', () => {
  const { Text } = jest.requireActual('react-native');
  return { QuestionBankStudyScreen: () => <Text>question-bank-study</Text> };
});

function withSafeArea(screen: React.ReactNode) {
  return (
    <SafeAreaProvider initialMetrics={{ frame: { height: 812, width: 375, x: 0, y: 0 }, insets: { bottom: 34, left: 0, right: 0, top: 47 } }}>
      {screen}
    </SafeAreaProvider>
  );
}

describe('OPI hotspot restricted states', () => {
  const brief = loadHotspotBriefs()[0];

  beforeEach(() => {
    jest.clearAllMocks();
    mockCanGoBack = true;
    mockState = { status: 'loading' };
  });

  it.each([HotspotDetailScreen, HotspotStudyScreen])('keeps back available while loading %p', async (Component) => {
    const screen = await render(withSafeArea(<Component briefId={brief.id} />));
    await fireEvent.press(screen.getByLabelText('返回'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it.each([HotspotDetailScreen, HotspotStudyScreen])('returns direct links to the hotspot list after a load failure in %p', async (Component) => {
    mockCanGoBack = false;
    mockState = { brief, status: 'network-error' };
    const screen = await render(withSafeArea(<Component briefId={brief.id} />));
    await fireEvent.press(screen.getByLabelText('返回'));
    expect(mockReplace).toHaveBeenCalledWith('/content/hotspot');
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('keeps the public summary visible while hiding questions behind the membership entry', async () => {
    mockState = { brief, status: 'membership-required' };

    const screen = await render(withSafeArea(<HotspotDetailScreen briefId={brief.id} />));

    expect(screen.getAllByText(brief.title)).toHaveLength(2);
    expect(screen.getByText(new RegExp(`本期包含 ${brief.topics.length} 个考试话题`))).toBeTruthy();
    expect(screen.getByText('完整练习需会员')).toBeTruthy();
    expect(screen.queryByText('membership_required')).toBeNull();
    expect(screen.queryByText('涵盖话题与问题')).toBeNull();

    await fireEvent.press(screen.getByText('查看会员'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/account/[slug]', params: { slug: 'membership', from: 'learning' } });
    await fireEvent.press(screen.getByText('刷新权益'));
    expect(mockRetry).toHaveBeenCalledTimes(1);
  });

  it('reauthorizes a direct study deep link instead of trusting detail-screen state', async () => {
    mockState = { brief, status: 'membership-required' };

    const screen = await render(withSafeArea(<HotspotStudyScreen briefId={brief.id} />));

    expect(mockUseHotspotAccess).toHaveBeenCalledWith(brief.id);
    expect(screen.getByText('完整练习需会员')).toBeTruthy();
    expect(screen.queryByText('question-bank-study')).toBeNull();
  });

  it('shows only a safe request ID for unavailable content', async () => {
    mockState = {
      brief,
      requestId: 'request-safe_3',
      status: 'content-unavailable',
    };

    const screen = await render(withSafeArea(<HotspotDetailScreen briefId={brief.id} />));

    expect(screen.getByText(/服务请求编号：request-safe_3/u)).toBeTruthy();
    expect(screen.queryByText(/https?:\/\//u)).toBeNull();
    expect(screen.queryByText(/content-unavailable|content_unavailable/u)).toBeNull();
  });

  it.each([
    [{ brief, status: 'membership-required' }, '完整练习需会员'],
    [{ brief, status: 'offline-authorization-expired' }, '需要联网验证会员状态'],
    [{ brief, status: 'network-error' }, '网络连接不稳定'],
    [{ status: 'not-found' }, '无法打开热点资讯'],
    [{ brief, status: 'content-unavailable' }, '热点内容暂不可用'],
    [{ brief, status: 'ready', topics: [], session: {} }, '涵盖话题与问题（0）'],
  ] as const)('renders the six-state access view for %s', async (state, expectedText) => {
    mockState = state as HotspotAccessResult;

    const screen = await render(withSafeArea(<HotspotDetailScreen briefId={brief.id} />));

    expect(screen.getByText(expectedText)).toBeTruthy();
  });
});
