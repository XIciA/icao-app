import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import { readLearningProgressStats } from '@/features/question-bank/platform/learning-store.native';
import { useAuth } from '@/features/auth/AuthProvider';
import { APP_DISPLAY_VERSION } from '@/config/app-version';

import ProfileRoute from '../(tabs)/profile';
import { SafeAreaInsetsContext, SafeAreaFrameContext } from 'react-native-safe-area-context';
import { CommerceRuntimeContext } from '@/features/native-commercial-testflight/commerce-runtime-context.native';
import type { CommerceRuntimeValue } from '@/features/native-commercial-testflight/commerce-runtime-types';

const commerce: CommerceRuntimeValue = {
  supported: true, phase: 'loading', offerings: [],
  purchase: async () => ({ ok: false, message: 'not requested by this screen test' }),
  restorePurchases: async () => ({ ok: false, message: 'not requested by this screen test' }),
  refresh: async () => {},
};
function ProfileTab() {
  return <SafeAreaFrameContext.Provider value={{ x: 0, y: 0, width: 390, height: 844 }}>
    <SafeAreaInsetsContext.Provider value={{ top: 47, bottom: 34, left: 0, right: 0 }}>
      <CommerceRuntimeContext.Provider value={commerce}><ProfileRoute /></CommerceRuntimeContext.Provider>
    </SafeAreaInsetsContext.Provider>
  </SafeAreaFrameContext.Provider>;
}


jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));
const mockPush = jest.fn();
let mockFocused = true;
const mockProfile = { displayName: '飞行学员', avatarUri: null, target: 'icao4-first' };

jest.mock('lucide-react-native', () => {
  const { View } = jest.requireActual('react-native');
  const Icon = (props: object) => <View {...props} />;
  return {
    Phone: Icon,
    Copy: Icon,
    Bookmark: Icon,
    ChevronRight: Icon,
    History: Icon,
    MessageCircle: Icon,
    Settings: Icon,
    Star: Icon,
    UserRound: Icon,
  };
});
jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void | (() => void)) => {
    const isFocused = mockFocused;
    jest.requireActual('react').useEffect(() => isFocused ? callback() : undefined, [callback, isFocused]);
  },
  usePathname: () => '/profile',
  useRouter: () => ({ push: mockPush }),
}));
jest.mock('@/features/question-bank/platform/learning-store.native', () => ({
  readLearningProgressStats: jest.fn(),
}));
jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: jest.fn() }));
jest.mock('@/features/account/profile-store.native', () => ({ useProfile: () => mockProfile }));

function readyAccount(accountId = 'business-account-a') {
  return {
    restoring: false, canAccessApp: true, accountReady: true, account: { accountId },
    session: { user: { id: `provider-${accountId}`, displayName: '已登录' } },
  };
}

describe('<ProfileTab />', () => {
  beforeEach(() => {
    jest.clearAllMocks(); mockFocused = true;
    jest.mocked(readLearningProgressStats).mockResolvedValue({ learnedCards: 0, completedCards: 0 });
    (useAuth as jest.Mock).mockReturnValue(readyAccount());
  });

  it('matches the empty profile baseline content', async () => {
    const screen = await render(<ProfileTab />);

    expect(screen.getByText('飞行学员')).toBeTruthy();
    expect(screen.queryByText('听你五个账号 · 已登录')).toBeNull();
    expect(screen.getByLabelText(/查看个人资料，.*听你五个账号 · 已登录/u)).toBeTruthy();
    expect(screen.getAllByText('0')).toHaveLength(2);
    expect(screen.getByText('ICAO 4 · 初考')).toBeTruthy();
    expect(screen.getByText('已完成卡片')).toBeTruthy();
    expect(screen.queryByText('学习次数')).toBeNull();
    expect(screen.queryByText(`© 2026 听你五个 · ${APP_DISPLAY_VERSION}`)).toBeNull();
  });

  it('shows the current invite-account name in the profile card', async () => {
    (useAuth as jest.Mock).mockReturnValue({
      ...readyAccount(),
      session: { user: { id: 'user-1', displayName: '起落平安' } },
    });

    const screen = await render(<ProfileTab />);

    expect(screen.queryByText('听你五个账号 · 起落平安')).toBeNull();
    expect(screen.getByLabelText(/查看个人资料，.*听你五个账号 · 起落平安/u)).toBeTruthy();
  });

  it('shows restoration status without claiming the existing session is signed out', async () => {
    (useAuth as jest.Mock).mockReturnValue({ restoring: true, accountReady: false, session: undefined });

    const screen = await render(<ProfileTab />);

    expect(screen.getByText('正在恢复登录…')).toBeTruthy();
    expect(screen.queryByText('登录，开启你的学习记录')).toBeNull();
    expect(screen.queryByText('已完成卡片')).toBeNull();
    expect(readLearningProgressStats).not.toHaveBeenCalled();
  });

  it('uses actual card progress independently of history records and refreshes on focus', async () => {
    jest.mocked(readLearningProgressStats).mockResolvedValue({ learnedCards: 5, completedCards: 2 });
    const screen = await render(<ProfileTab />);
    expect(screen.getByText('5')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(readLearningProgressStats).toHaveBeenCalledTimes(1);
    mockFocused = false; await screen.rerender(<ProfileTab />);
    jest.mocked(readLearningProgressStats).mockResolvedValue({ learnedCards: 6, completedCards: 3 });
    mockFocused = true; await screen.rerender(<ProfileTab />);
    await waitFor(() => expect(screen.getByText('6')).toBeTruthy());
    expect(screen.getByText('3')).toBeTruthy();
    expect(readLearningProgressStats).toHaveBeenCalledTimes(2);
  });

  it('ignores the old business account read while a new account workspace is becoming ready', async () => {
    let resolveOld!: (stats: { learnedCards: number; completedCards: number }) => void;
    jest.mocked(readLearningProgressStats).mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve; }));
    const screen = await render(<ProfileTab />);
    (useAuth as jest.Mock).mockReturnValue({ ...readyAccount('business-account-b'), accountReady: false });
    await screen.rerender(<ProfileTab />);
    await act(async () => { resolveOld({ learnedCards: 12, completedCards: 8 }); });
    expect(screen.queryByText('12')).toBeNull();
    expect(screen.getAllByText('—')).toHaveLength(2);
    jest.mocked(readLearningProgressStats).mockResolvedValue({ learnedCards: 3, completedCards: 1 });
    (useAuth as jest.Mock).mockReturnValue(readyAccount('business-account-b'));
    await screen.rerender(<ProfileTab />);
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('1')).toBeTruthy();
  });

  it('opens word favorites from the row below annotations', async () => {
    const screen = await render(<ProfileTab />);

    expect(screen.getByText('我的标注')).toBeTruthy();
    await fireEvent.press(screen.getByText('单词收藏'));

    expect(mockPush).toHaveBeenCalledWith('/word-favorites');
  });

  it('opens the guide directly and moves contact out of the profile', async () => {
    const screen = await render(<ProfileTab />);
    await fireEvent.press(screen.getByText('使用指南'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/info/[slug]', params: { slug: 'guide' } });
    expect(screen.queryByText('联系我们')).toBeNull();
  });

  it('opens the real feedback form from the profile menu', async () => {
    const screen = await render(<ProfileTab />);

    await fireEvent.press(screen.getByText('意见反馈'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/info/[slug]',
      params: { slug: 'feedback', source: 'profile', sourceRoute: '/(tabs)/profile' },
    });
  });
});
