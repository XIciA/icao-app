import { fireEvent, render } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { ProfileHomeScreen } from '../ProfileHomeScreen.native';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useFocusEffect: (effect: () => (() => void) | undefined) => jest.requireActual('react').useEffect(effect, [effect]),
}));
jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ accountReady: true, account: { accountId: 'account-a' },
  session: { user: { displayName: '飞行学员' } }, restoring: false }) }));
jest.mock('@/features/account/profile-store.native', () => ({ useProfile: () => ({ displayName: '飞行学员', target: 'icao4-first' }) }));
jest.mock('@/features/account/ProfileAvatar', () => ({ ProfileAvatar: () => null }));
jest.mock('../AiAllowanceCard.native', () => ({ AiAllowanceCard: () => null }));
jest.mock('@/features/question-bank/platform/learning-store.native', () => ({
  readLearningProgressStats: async () => ({ learnedCards: 0, completedCards: 0 }),
}));
const originalPlatform = Platform.OS;
afterEach(() => { Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform }); jest.clearAllMocks(); });

it.each(['ios', 'android'])('shows exactly one membership entry on %s and navigates to the same account route', async (platform) => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: platform });
  const screen = await render(<ProfileHomeScreen />);
  expect(screen.getAllByText('会员与购买')).toHaveLength(1);
  await fireEvent.press(screen.getByText('会员与购买'));
  expect(mockPush).toHaveBeenCalledTimes(1);
  expect(mockPush).toHaveBeenCalledWith('/account/membership');
});

it('does not expose Native payment in a web surface', async () => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
  const screen = await render(<ProfileHomeScreen />);
  expect(screen.queryByText('会员与购买')).toBeNull();
});
