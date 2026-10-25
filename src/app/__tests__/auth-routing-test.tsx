import { fireEvent, render } from '@testing-library/react-native';
import { Platform, Text } from 'react-native';

import { AppStack } from '@/app/_layout';
import { AppStack as NativeAppStack } from '@/app/_layout.native';
import IndexRoute from '@/app/index';

jest.mock('@/features/app-updates/AppUpdatePrompt', () => ({ AppUpdatePrompt: () => null }));
const mockStackOptions = jest.fn();
let mockScreenLayout: (props: any) => React.ReactElement;
let mockRestoring = false;
let mockSearchParams: Record<string, string> = {};

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
    restoring: mockRestoring,
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
  const Stack = ({ children, screenOptions, screenLayout }: { children: React.ReactNode; screenOptions: unknown; screenLayout: typeof mockScreenLayout }) => { mockStackOptions(screenOptions); mockScreenLayout = screenLayout; return React.createElement(React.Fragment, null, children); };
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
    useGlobalSearchParams: () => mockSearchParams,
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
    mockRestoring = false;
    mockSearchParams = {};
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
    expect(screen.getByTestId('screen-auth/[slug]')).toBeTruthy();
    expect(screen.queryByTestId('screen-auth/callback')).toBeNull();
  });

  it('keeps login and the public catalogue available while signed out', async () => {
    const screen = await render(<AppStack />);

    expect(screen.getByTestId('screen-index')).toBeTruthy();
    expect(screen.getByTestId('screen-auth/[slug]')).toBeTruthy();
    expect(screen.getByTestId('screen-(tabs)')).toBeTruthy();
    expect(screen.getByTestId('screen-word-favorites')).toBeTruthy();
    expect(screen.getByTestId('screen-content/hotspot/[briefId]')).toBeTruthy();
    expect(screen.getByTestId('screen-content/hotspot/[briefId]/study')).toBeTruthy();
    expect(screen.queryByTestId('screen-auth/callback')).toBeNull();
  });

  it('distinguishes an unavailable account-state check from a confirmed deletion task', async () => {
    mockAccountRestoreUnavailable = true;
    mockPathname = '/auth/login';

    await render(<NativeAppStack />);
    const screen = await render(mockScreenLayout({ route: { name: 'auth/[slug]', params: { slug: 'login' } }, children: <Text>login</Text>, navigation: {} }));

    expect(screen.getByText('暂时无法确认账号状态')).toBeTruthy();
    expect(screen.queryByText('账号正在注销')).toBeNull();
    expect(screen.getByText(/本机学习数据会保留/u)).toBeTruthy();
  });

  it('opens app routes without creating an authenticated session in UI acceptance mode', async () => {
    mockCanAccessApp = true;
    mockUiAcceptanceMode = true;

    const screen = await render(<AppStack />);

    expect(screen.getByTestId('screen-(tabs)')).toBeTruthy();
    expect(screen.getByTestId('screen-auth/[slug]')).toBeTruthy();
    expect(screen.getByText('UI 验收模式 · 退出')).toBeTruthy();
    expect(mockSession).toBeUndefined();
  });

  it.each([
    [{ user: { id: 'user-1' } }, true, '/(tabs)'],
    [undefined, true, '/(tabs)'],
    [undefined, false, '/(tabs)'],
  ])('redirects the neutral index according to the available access mode', async (session, canAccessApp, expectedHref) => {
    mockSession = session;
    mockCanAccessApp = canAccessApp;

    const screen = await render(<IndexRoute />);

    expect(screen.getByTestId('redirect-href').props.children).toBe(expectedHref);
  });


  it('does not mount protected page data hooks before login', async () => {
    await render(<NativeAppStack />);
    const privatePage = jest.fn(() => <Text>private account data</Text>);
    const PrivatePage = privatePage;
    const view = mockScreenLayout({ route: { name: 'account/[slug]', params: { slug: 'profile' } }, children: <PrivatePage />, navigation: {} });
    const screen = await render(view);
    expect(privatePage).not.toHaveBeenCalled();
    expect(screen.queryByText('private account data')).toBeNull();
  });

  it('allows a learning deep link without triggering the global login gate', async () => {
    mockPathname = '/question-bank/listening/study/main/topic';
    mockSearchParams = { bankId: 'listening', categoryId: 'main', topicId: 'topic', cardId: 'card-2' };
    await render(<NativeAppStack />);
    expect(mockRememberPendingPath).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('allows catalogue browsing during account restore and recovery failure', async () => {
    mockRestoring = true;
    const screen = await render(<NativeAppStack />);
    expect(screen.getByTestId('screen-(tabs)')).toBeTruthy();
    mockRestoring = false;
    mockAccountRestoreUnavailable = true;
    await screen.rerender(<NativeAppStack />);
    expect(screen.getByTestId('screen-(tabs)')).toBeTruthy();
    expect(screen.queryByText('暂时无法确认账号状态')).toBeNull();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('clears a pending login when browser back returns to a public page', async () => {
    mockPathname = '/auth/login';
    const screen = await render(<NativeAppStack />);
    mockPathname = '/discover';
    await screen.rerender(<NativeAppStack />);
    expect(mockConsumePendingPath).toHaveBeenCalledTimes(1);
  });

  it('returns sign-out from a private screen to the public catalogue', async () => {
    mockCanAccessApp = true;
    mockPathname = '/account/settings';
    const screen = await render(<NativeAppStack />);
    mockCanAccessApp = false;
    await screen.rerender(<NativeAppStack />);
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)');
    expect(mockRememberPendingPath).not.toHaveBeenCalled();
  });

  it('lets a user browse without deleting the session when restoration fails', async () => {
    mockPathname = '/auth/login';
    mockAccountRestoreUnavailable = true;
    await render(<NativeAppStack />);
    const screen = await render(mockScreenLayout({ route: { name: 'auth/[slug]', params: { slug: 'login' } }, children: <Text>login</Text>, navigation: {} }));
    await fireEvent.press(screen.getByText('暂不登录，继续浏览'));
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)');
    expect(mockConsumePendingPath).toHaveBeenCalled();
  });

  it('finishes a refreshed login in My regardless of its original destination', async () => {
    mockCanAccessApp = true;
    mockPathname = '/auth/login';
    mockSearchParams = { next: '/question-bank/sentences900' };
    await render(<NativeAppStack />);
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)/profile');
  });

  it('finishes login in My after rapid taps on different destinations', async () => {
    mockPathname = '/auth/login';
    mockSearchParams = { next: '/question-bank/sentences900?cardId=first' };
    const screen = await render(<NativeAppStack />);
    // The navigation gate suppressed the second push, but its intent was saved.
    mockConsumePendingPath.mockReturnValue('/question-bank/listening');
    mockCanAccessApp = true;
    await screen.rerender(<NativeAppStack />);
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)/profile');
    expect(mockReplace).not.toHaveBeenCalledWith('/question-bank/listening');
    expect(mockConsumePendingPath).toHaveBeenCalledTimes(1);
  });

  it('finishes in My when the login URL target is unsafe', async () => {
    mockCanAccessApp = true;
    mockPathname = '/auth/login';
    mockSearchParams = { next: '//external.example' };
    mockConsumePendingPath.mockReturnValue('/question-bank/listening');
    await render(<NativeAppStack />);
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)/profile');
    expect(mockConsumePendingPath).toHaveBeenCalledTimes(1);
  });

  it('rejects an external destination supplied in the login URL', async () => {
    mockCanAccessApp = true;
    mockPathname = '/auth/login';
    mockSearchParams = { next: '//external.example' };
    await render(<NativeAppStack />);
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)/profile');
  });

  it('finishes login in My only after the authenticated guard is ready', async () => {
    mockCanAccessApp = true;
    mockPathname = '/auth/login';
    mockConsumePendingPath.mockReturnValue('/content/hotspot/hotspot-2026-07-10/study');

    await render(<AppStack />);

    expect(mockReplace).toHaveBeenCalledWith('/(tabs)/profile');
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
