import { fireEvent, render } from '@testing-library/react-native';
import { DEFAULT_PROFILE, type ExamGoal } from '@/features/account/profile-model';

import QuestionBankTab from '../(tabs)';

const mockPush = jest.fn();
let mockCanAccessApp = true;
const mockRememberPendingPath = jest.fn();
const mockUseProfile = jest.fn(() => mockProfile);
let mockProfile = { ...DEFAULT_PROFILE };

jest.mock('@/features/account/profile-store.native', () => ({ useProfile: () => mockUseProfile() }));
jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ canAccessApp: mockCanAccessApp, rememberPendingPath: mockRememberPendingPath }) }));

jest.mock('lucide-react-native', () => {
  const { View } = jest.requireActual('react-native');
  const Icon = (props: object) => <View {...props} />;

  return {
    BookOpenText: Icon,
    Check: Icon,
    ChevronDown: Icon,
    Info: Icon,
    ChevronRight: Icon,
    Headphones: Icon,
    MessageSquareQuote: Icon,
    Mic2: Icon,
    RadioTower: Icon,
    UserRound: Icon,
  };
});

jest.mock('expo-router', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: mockPush }),
  useFocusEffect: (callback: () => void) => jest.requireActual('react').useEffect(callback, [callback]),
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}));

describe('<QuestionBankTab />', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockCanAccessApp = true;
    mockRememberPendingPath.mockClear();
    mockUseProfile.mockClear();
    mockProfile = { ...DEFAULT_PROFILE, studyScope: 'all' };
  });

  it('shows the public five-bank catalogue without reading any previous account profile', async () => {
    mockCanAccessApp = false;
    mockProfile = { ...mockProfile, target: 'icao4-recert', avatarUri: 'https://private.example/avatar.png' };
    const screen = await render(<QuestionBankTab />);
    expect(screen.getAllByLabelText(/，打开$/)).toHaveLength(5);
    expect(screen.getByText('故事复诵')).toBeTruthy();
    expect(mockUseProfile).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('切换学习范围')).toBeNull();
    await fireEvent.press(screen.getByLabelText('900 句，打开'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/question-bank/[bankId]', params: { bankId: 'sentences900' } });
    expect(mockRememberPendingPath).not.toHaveBeenCalled();
  });

  it('opens login explicitly from the public avatar', async () => {
    mockCanAccessApp = false;
    const screen = await render(<QuestionBankTab />);
    await fireEvent.press(screen.getByLabelText('登录 / 注册'));
    expect(mockRememberPendingPath).toHaveBeenCalledWith('/account/profile');
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/auth/[slug]', params: { slug: 'login', next: '/account/profile', returnTo: '/' } });
  });

  it('defaults to ICAO 4 first-exam banks without adding an onboarding choice or another profile entrance', async () => {
    const screen = await render(<QuestionBankTab />);

    expect(screen.getByText('航空英语题库')).toBeTruthy();
    expect(screen.getByText('按自己的节奏开始练习。')).toBeTruthy();
    expect(screen.getByText('听力')).toBeTruthy();
    expect(screen.getByText('4 题组 / 1502 题')).toBeTruthy();
    expect(screen.getByText('900 句')).toBeTruthy();
    expect(screen.getByText('陆空通话')).toBeTruthy();
    expect(screen.getByText('310 场景＋9 专项 / 5751 卡')).toBeTruthy();
    expect(screen.getByText('OPI')).toBeTruthy();
    expect(screen.getByText('238 话题 / 2361 卡')).toBeTruthy();
    expect(screen.queryByText('故事复诵')).toBeNull();
    await fireEvent.press(screen.getByLabelText('打开个人资料'));
    expect(mockPush).toHaveBeenCalledWith('/account/profile');
    expect(screen.getByLabelText('用户头像')).toBeTruthy();
    expect(screen.queryByText('可练习')).toBeNull();
    expect(screen.queryByLabelText('选择备考课程')).toBeNull();
    expect(screen.queryByText('ICAO 4 复考')).toBeNull();
    expect(screen.queryByText('ICAO 4 首考')).toBeNull();
    expect(screen.queryByText('ICAO 5 首考')).toBeNull();
    expect(screen.queryByText('跟着课程计划，逐个攻克核心模块。')).toBeNull();
  });

  it.each<[ExamGoal, string[]]>([
    ['icao4-first', ['听力', '900 句', '陆空通话', 'OPI']],
    ['icao4-recert', ['陆空通话', 'OPI']],
    ['icao5-first', ['听力', '900 句', '陆空通话', 'OPI', '故事复诵']],
    ['icao5-recert', ['陆空通话', 'OPI', '故事复诵']],
  ])('shows the confirmed module set for %s', async (target, expected) => {
    mockProfile = { ...mockProfile, target };
    const screen = await render(<QuestionBankTab />);
    expect(screen.getAllByLabelText(/，打开$/).map(node => node.props.accessibilityLabel)).toEqual(expected.map(title => `${title}，打开`));
  });

  it('reflects a profile goal change and keeps the selected bank navigation', async () => {
    const screen = await render(<QuestionBankTab />);
    expect(screen.queryByLabelText('故事复诵，打开')).toBeNull();
    mockProfile = { ...mockProfile, target: 'icao5-first' };
    await screen.rerender(<QuestionBankTab />);
    await fireEvent.press(screen.getByLabelText('故事复诵，打开'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/question-bank/[bankId]',
      params: { bankId: 'storytelling' },
    });
  });
});
