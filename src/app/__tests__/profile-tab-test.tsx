import { fireEvent, render } from '@testing-library/react-native';

import { sqliteLearningStore } from '@/features/question-bank/platform/learning-store';
import { useAuth } from '@/features/auth/AuthProvider';
import { APP_DISPLAY_VERSION } from '@/config/app-version';

import ProfileTab from '../(tabs)/profile';

const mockPush = jest.fn();

jest.mock('lucide-react-native', () => {
  const { View } = jest.requireActual('react-native');
  const Icon = (props: object) => <View {...props} />;
  return {
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
  useFocusEffect: (callback: () => void) => callback(),
  useRouter: () => ({ push: mockPush }),
}));
jest.mock('@/features/question-bank/platform/learning-store', () => ({
  sqliteLearningStore: { getRecords: jest.fn().mockResolvedValue([]) },
}));
jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: jest.fn() }));

describe('<ProfileTab />', () => {
  beforeEach(() => {
    mockPush.mockClear();
    (sqliteLearningStore.getRecords as jest.Mock).mockResolvedValue([]);
    (useAuth as jest.Mock).mockReturnValue({ restoring: false, session: undefined });
  });

  it('matches the empty profile baseline content', async () => {
    const screen = await render(<ProfileTab />);

    expect(screen.getByText('飞行学员')).toBeTruthy();
    expect(screen.getByText('尚未登录')).toBeTruthy();
    expect(screen.getAllByText('0')).toHaveLength(2);
    expect(screen.getByText(`© 2026 听你五个 · ${APP_DISPLAY_VERSION}`)).toBeTruthy();
  });

  it('shows the current invite-account name in the profile card', async () => {
    (useAuth as jest.Mock).mockReturnValue({
      restoring: false,
      session: { user: { id: 'user-1', displayName: '起落平安' } },
    });

    const screen = await render(<ProfileTab />);

    expect(screen.getByText('听你五个账号 · 起落平安')).toBeTruthy();
  });

  it('shows a confirmation state while the local session is restoring', async () => {
    (useAuth as jest.Mock).mockReturnValue({ restoring: true, session: undefined });

    const screen = await render(<ProfileTab />);

    expect(screen.getByText('正在确认账号…')).toBeTruthy();
  });

  it('counts only session summaries and refreshes them on focus', async () => {
    (sqliteLearningStore.getRecords as jest.Mock).mockResolvedValue([
      { id: 'session-1', completedCount: 2, recordType: 'session' },
      { id: 'answer-1', completedCount: 1, recordType: 'ai_result' },
      { id: 'legacy-session', completedCount: 3 },
    ]);

    const screen = await render(<ProfileTab />);

    expect(screen.getByText('5')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
  });

  it('opens word favorites from the row below annotations', async () => {
    const screen = await render(<ProfileTab />);

    expect(screen.getByText('我的标注')).toBeTruthy();
    fireEvent.press(screen.getByText('单词收藏'));

    expect(mockPush).toHaveBeenCalledWith('/word-favorites');
  });

  it('opens the real feedback form from the profile menu', async () => {
    const screen = await render(<ProfileTab />);

    fireEvent.press(screen.getByText('意见反馈'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/info/[slug]',
      params: { slug: 'feedback', source: 'profile', sourceRoute: '/profile' },
    });
  });
});
