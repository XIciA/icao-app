import { act, render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { MemberFeatureGate } from '../MemberFeatureGate.native';
const mockLogin = jest.fn();
const mockReplace = jest.fn();
const mockRefresh = jest.fn();
let mockAuthenticated = true;
let mockFocused = true;
jest.mock('@react-navigation/native', () => ({ useIsFocused: () => mockFocused }));
let mockCommerce: { phase: string; entitlement?: { membership: { active: boolean; expiresAt?: string } }; refresh: typeof mockRefresh };
jest.mock('../AuthProvider', () => ({ useAuth: () => ({ canAccessApp: mockAuthenticated }) }));
jest.mock('../use-login-entry', () => ({ useLoginEntry: () => mockLogin }));
jest.mock('@/components/navigation/useAppRouter', () => ({ useAppRouter: () => ({ replace: mockReplace, canGoBack: () => false }) }));
jest.mock('@/features/native-commercial-testflight/CommerceRuntimeProvider', () => ({ useCommerceRuntime: () => mockCommerce }));
jest.mock('expo-router', () => ({ usePathname: () => '/content/radio', useLocalSearchParams: () => ({}) }));
const mockChild = jest.fn(() => <Text>protected-player</Text>);
function Child() { return mockChild(); }
beforeEach(() => { jest.clearAllMocks(); mockAuthenticated = true; mockFocused = true; mockCommerce = { phase: 'ready', refresh: mockRefresh }; });
it('does not mount paid functionality for a guest', async () => {
  mockAuthenticated = false;
  await render(<MemberFeatureGate><Child /></MemberFeatureGate>);
  expect(mockLogin).toHaveBeenCalledWith('/content/radio', undefined, { replace: true });
  expect(mockReplace).not.toHaveBeenCalled();
  expect(mockChild).not.toHaveBeenCalled();
});
it('routes a confirmed non-member to purchase and retains the original target', async () => {
  mockCommerce.entitlement = { membership: { active: false } };
  await render(<MemberFeatureGate><Child /></MemberFeatureGate>);
  expect(mockReplace).toHaveBeenCalledWith('/account/membership?next=%2Fcontent%2Fradio');
  expect(mockChild).not.toHaveBeenCalled();
});
it('does not misclassify failed entitlement reads as a non-member', async () => {
  mockCommerce.phase = 'error';
  const screen = await render(<MemberFeatureGate><Child /></MemberFeatureGate>);
  expect(screen.getByText('暂时无法确认会员状态')).toBeTruthy();
  expect(mockReplace).not.toHaveBeenCalled();
  expect(mockChild).not.toHaveBeenCalled();
});
it('opens a verified membership and closes it when its expiry passes', async () => {
  jest.useFakeTimers();
  mockCommerce.entitlement = { membership: { active: true, expiresAt: new Date(Date.now() + 1000).toISOString() } };
  const screen = await render(<MemberFeatureGate><Child /></MemberFeatureGate>);
  expect(screen.getByText('protected-player')).toBeTruthy();
  await act(async () => { jest.advanceTimersByTime(1100); });
  expect(screen.queryByText('protected-player')).toBeNull();
  expect(mockReplace).toHaveBeenCalledWith('/account/membership?next=%2Fcontent%2Fradio');
  jest.useRealTimers();
});

it('never lets a retained background feature hijack navigation', async () => {
  mockFocused = false;
  mockCommerce.entitlement = { membership: { active: false } };
  const screen = await render(<MemberFeatureGate><Child /></MemberFeatureGate>);
  expect(mockReplace).not.toHaveBeenCalled();
  mockFocused = true;
  await screen.rerender(<MemberFeatureGate><Child /></MemberFeatureGate>);
  expect(mockReplace).toHaveBeenCalledTimes(1);
  mockCommerce = { ...mockCommerce };
  await screen.rerender(<MemberFeatureGate><Child /></MemberFeatureGate>);
  expect(mockReplace).toHaveBeenCalledTimes(1);
});
