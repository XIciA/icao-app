jest.mock('lucide-react-native/icons/crown', () => ({ __esModule: true, default: () => null }));
jest.mock('@/features/native-commercial-testflight/CommerceRuntimeProvider', () => ({ useCommerceRuntime: () => ({phase:'ready', entitlement: {serverTime:'2026-10-22T00:00:00Z',membership:{active:true,expiresAt:'2026-11-14T00:00:00Z'}}}) }));
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
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
  expect(screen.queryByText(/© 2026|蜀ICP备/)).toBeNull();
  expect(screen.queryByText('关于听你五个')).toBeNull();
  await fireEvent.press(screen.getByText('会员与购买'));
  expect(mockPush).toHaveBeenCalledTimes(1);
  expect(mockPush).toHaveBeenCalledWith('/account/membership');
});

it('does not expose Native payment in a web surface', async () => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
  const screen = await render(<ProfileHomeScreen />);
  expect(screen.queryByText('会员与购买')).toBeNull();
});
