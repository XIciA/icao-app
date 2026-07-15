import { render } from '@testing-library/react-native';

import { sqliteLearningStore } from '@/features/question-bank/platform/learning-store';
import { useAuth } from '@/features/auth/AuthProvider';

import ProfileTab from '../(tabs)/profile';

jest.mock('lucide-react-native', () => {
  const { View } = jest.requireActual('react-native');
  const Icon = (props: object) => <View {...props} />;
  return {
    Bookmark: Icon,
    ChevronRight: Icon,
    History: Icon,
    MessageCircle: Icon,
    Settings: Icon,
    UserRound: Icon,
  };
});
jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void) => callback(),
  useRouter: () => ({ push: jest.fn() }),
}));
jest.mock('@/features/question-bank/platform/learning-store', () => ({
  sqliteLearningStore: { getRecords: jest.fn().mockResolvedValue([]) },
}));
jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: jest.fn() }));

describe('<ProfileTab />', () => {
  beforeEach(() => {
    (sqliteLearningStore.getRecords as jest.Mock).mockResolvedValue([]);
    (useAuth as jest.Mock).mockReturnValue({ restoring: false, session: undefined });
  });

  it('matches the empty profile baseline content', async () => {
    const screen = await render(<ProfileTab />);

    expect(screen.getByText('飞行学员')).toBeTruthy();
    expect(screen.getByText('尚未登录')).toBeTruthy();
    expect(screen.getAllByText('0')).toHaveLength(2);
    expect(screen.getByText('© 2026 飞猪 ICAO · 咨询微信 15736231388')).toBeTruthy();
  });

  it('shows the current signed-in email in the profile card', async () => {
    (useAuth as jest.Mock).mockReturnValue({
      restoring: false,
      session: { user: { id: 'user-1', email: 'pilot@example.com' } },
    });

    const screen = await render(<ProfileTab />);

    expect(screen.getByText('当前账号 · pilot@example.com')).toBeTruthy();
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
});
