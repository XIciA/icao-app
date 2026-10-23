import { render } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { AppStack } from '@/app/_layout';
import { AppStack as NativeAppStack } from '@/app/_layout.native';
import IndexRoute from '@/app/index';

jest.mock('@/features/app-updates/AppUpdatePrompt', () => ({ AppUpdatePrompt: () => null }));
const mockStackOptions = jest.fn();

let mockSession: { user: { id: string } } | undefined;
let mockCanAccessApp = false;
let mockAccountDeletionPending = false;
let mockAccountRestoreUnavailable = false;
let mockUiAcceptanceMode = false;
const mockRememberPendingPath = jest.fn();
const mockConsumePendingPath = jest.fn();
const mockExitUiAcceptanceMode = jest.fn();
const mockRetryAccountRestore = jest.fn();
const mockReplace = jest.fn();
let mockPathname = '/';

jest.mock('lucide-react-native', () => {
  const { View } = jest.requireActual('react-native');
  const Icon = (props: object) => <View {...props} />;
  return new Proxy({}, { get: () => Icon });
});

jest.mock('@/features/auth/AuthProvider', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({
    accountDeletionPending: mockAccountDeletionPending,
    accountRestoreUnavailable: mockAccountRestoreUnavailable,
    canAccessApp: mockCanAccessApp,
    consumePendingPath: mockConsumePendingPath,
    exitUiAcceptanceMode: mockExitUiAcceptanceMode,
    rememberPendingPath: mockRememberPendingPath,
    retryAccountRestore: mockRetryAccountRestore,
    restoring: false,
    session: mockSession,
    uiAcceptanceMode: mockUiAcceptanceMode,
  }),
}));

jest.mock('@/features/radio-player/RadioMiniPlayer', () => ({ RadioMiniPlayer: () => null }));
jest.mock('@/features/radio-player/RadioPlayerProvider', () => ({ RadioPlayerProvider: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@/features/question-bank/recording/recording-repository', () => ({ recordingRepository: { cleanupExpired: jest.fn() } }));

jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  const { Text } = jest.requireActual('react-native');
  const Stack = ({ children, screenOptions }: { children: React.ReactNode; screenOptions: unknown }) => { mockStackOptions(screenOptions); return React.createElement(React.Fragment, null, children); };
  function MockScreen({ name }: { name: string }) {
    return React.createElement(Text, { testID: `screen-${name}` }, name);
  }
  function MockProtected({ children, guard }: { children: React.ReactNode; guard: boolean }) {
    if (!guard) return null;
    React.Children.forEach(children, (child: React.ReactNode) => {
      if ((child as React.ReactElement | null)?.type === React.Fragment) {
        throw new Error('Stack.Protected children must be direct Stack.Screen elements.');
      }
    });
    return children;
  }

  Stack.Screen = MockScreen;
  Stack.Protected = MockProtected;

  return {
    Redirect: ({ href }: { href: string }) => React.createElement(Text, { testID: 'redirect-href' }, href),
    SplashScreen: {
      hideAsync: jest.fn().mockResolvedValue(undefined),
      preventAutoHideAsync: jest.fn().mockResolvedValue(undefined),
    },
    Stack,
    usePathname: () => mockPathname,
    useRouter: () => ({ replace: mockReplace }),
  };
});

describe('authentication routing', () => {
  beforeEach(() => {
    mockRememberPendingPath.mockClear();
    mockConsumePendingPath.mockReset().mockReturnValue(undefined);
    mockExitUiAcceptanceMode.mockClear();
    mockReplace.mockClear();
    mockCanAccessApp = false;
    mockAccountDeletionPending = false;
    mockAccountRestoreUnavailable = false;
    mockSession = undefined;
    mockUiAcceptanceMode = false;
    mockRetryAccountRestore.mockReset().mockResolvedValue(undefined);
    mockPathname = '/';
  });

  it('keeps the neutral index route available during a signed-in cold start', async () => {
    mockSession = { user: { id: 'user-1' } };
    mockCanAccessApp = true;

    const screen = await render(<AppStack />);

    expect(screen.getByTestId('screen-index')).toBeTruthy();
    expect(screen.getByTestId('screen-(tabs)')).toBeTruthy();
    expect(screen.getByTestId('screen-word-favorites')).toBeTruthy();
    expect(screen.getByTestId('screen-content/hotspot/[briefId]')).toBeTruthy();
    expect(screen.getByTestId('screen-content/hotspot/[briefId]/study')).toBeTruthy();
    expect(screen.queryByTestId('screen-auth/[slug]')).toBeNull();
    expect(screen.queryByTestId('screen-auth/callback')).toBeNull();
  });

  it('keeps login available and app tabs protected while signed out', async () => {
    const screen = await render(<AppStack />);

    expect(screen.getByTestId('screen-index')).toBeTruthy();
    expect(screen.getByTestId('screen-auth/[slug]')).toBeTruthy();
    expect(screen.queryByTestId('screen-(tabs)')).toBeNull();
    expect(screen.queryByTestId('screen-word-favorites')).toBeNull();
    expect(screen.queryByTestId('screen-content/hotspot/[briefId]')).toBeNull();
    expect(screen.queryByTestId('screen-content/hotspot/[briefId]/study')).toBeNull();
    expect(screen.queryByTestId('screen-auth/callback')).toBeNull();
  });

  it('distinguishes an unavailable account-state check from a confirmed deletion task', async () => {
    mockAccountRestoreUnavailable = true;

    const screen = await render(<AppStack />);

    expect(screen.getByText('暂时无法确认账号状态')).toBeTruthy();
    expect(screen.queryByText('账号正在注销')).toBeNull();
    expect(screen.getByText(/暂时无法读取本机安全登录状态/u)).toBeTruthy();
  });

  it('opens app routes without creating an authenticated session in UI acceptance mode', async () => {
    mockCanAccessApp = true;
    mockUiAcceptanceMode = true;

    const screen = await render(<AppStack />);

    expect(screen.getByTestId('screen-(tabs)')).toBeTruthy();
    expect(screen.queryByTestId('screen-auth/[slug]')).toBeNull();
    expect(screen.getByText('UI 验收模式 · 退出')).toBeTruthy();
    expect(mockSession).toBeUndefined();
  });

  it.each([
    [{ user: { id: 'user-1' } }, true, '/(tabs)'],
    [undefined, true, '/(tabs)'],
    [undefined, false, '/auth/login'],
  ])('redirects the neutral index according to the available access mode', async (session, canAccessApp, expectedHref) => {
    mockSession = session;
    mockCanAccessApp = canAccessApp;

    const screen = await render(<IndexRoute />);

    expect(screen.getByTestId('redirect-href').props.children).toBe(expectedHref);
  });

  it('enters the remembered destination only after the authenticated guard is ready', async () => {
    mockCanAccessApp = true;
    mockPathname = '/auth/login';
    mockConsumePendingPath.mockReturnValue('/content/hotspot/hotspot-2026-07-10/study');

    await render(<AppStack />);

    expect(mockReplace).toHaveBeenCalledWith('/content/hotspot/hotspot-2026-07-10/study');
    expect(mockConsumePendingPath).toHaveBeenCalledTimes(1);
  });
});

it.each(['ios', 'android', 'web'] as const)('keeps edge-return animation platform scoped on %s', async platform => {
  const original = Platform.OS;
  Object.defineProperty(Platform, 'OS', { configurable: true, value: platform });
  mockCanAccessApp = true;
  try {
    await render(<NativeAppStack />);
    expect(mockStackOptions).toHaveBeenLastCalledWith(expect.objectContaining({
      animation: 'slide_from_right',
      fullScreenGestureEnabled: false,
      gestureEnabled: platform !== 'ios', headerShown: false,
    }));
  } finally { Object.defineProperty(Platform, 'OS', { configurable: true, value: original }); }
});
