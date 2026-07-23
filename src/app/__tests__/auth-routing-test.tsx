import { render } from '@testing-library/react-native';

import { AppStack } from '@/app/_layout';
import IndexRoute from '@/app/index';

let mockSession: { user: { id: string } } | undefined;
let mockCanAccessApp = false;
let mockUiAcceptanceMode = false;
const mockRememberPendingPath = jest.fn();
const mockExitUiAcceptanceMode = jest.fn();
const mockReplace = jest.fn();

jest.mock('lucide-react-native', () => {
  const { View } = jest.requireActual('react-native');
  const Icon = (props: object) => <View {...props} />;
  return new Proxy({}, { get: () => Icon });
});

jest.mock('@/features/auth/AuthProvider', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({
    canAccessApp: mockCanAccessApp,
    exitUiAcceptanceMode: mockExitUiAcceptanceMode,
    rememberPendingPath: mockRememberPendingPath,
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
  const Stack = ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children);
  function MockScreen({ name }: { name: string }) {
    return React.createElement(Text, { testID: `screen-${name}` }, name);
  }
  function MockProtected({ children, guard }: { children: React.ReactNode; guard: boolean }) {
    return guard ? children : null;
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
    usePathname: () => '/',
    useRouter: () => ({ replace: mockReplace }),
  };
});

describe('authentication routing', () => {
  beforeEach(() => {
    mockRememberPendingPath.mockClear();
    mockExitUiAcceptanceMode.mockClear();
    mockReplace.mockClear();
    mockCanAccessApp = false;
    mockSession = undefined;
    mockUiAcceptanceMode = false;
  });

  it('keeps the neutral index route available during a signed-in cold start', async () => {
    mockSession = { user: { id: 'user-1' } };
    mockCanAccessApp = true;

    const screen = await render(<AppStack />);

    expect(screen.getByTestId('screen-index')).toBeTruthy();
    expect(screen.getByTestId('screen-(tabs)')).toBeTruthy();
    expect(screen.getByTestId('screen-word-favorites')).toBeTruthy();
    expect(screen.queryByTestId('screen-auth/[slug]')).toBeNull();
    expect(screen.queryByTestId('screen-auth/callback')).toBeNull();
  });

  it('keeps login available and app tabs protected while signed out', async () => {
    const screen = await render(<AppStack />);

    expect(screen.getByTestId('screen-index')).toBeTruthy();
    expect(screen.getByTestId('screen-auth/[slug]')).toBeTruthy();
    expect(screen.queryByTestId('screen-(tabs)')).toBeNull();
    expect(screen.queryByTestId('screen-word-favorites')).toBeNull();
    expect(screen.queryByTestId('screen-auth/callback')).toBeNull();
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
});
