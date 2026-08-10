import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LoginScreen, loginErrorMessage } from '@/components/auth/login-screen';

let mockUiAcceptanceAvailable = false;
const mockEnterUiAcceptanceMode = jest.fn();
const mockBack = jest.fn();
const mockCanGoBack = jest.fn();
const mockReplace = jest.fn();

jest.mock('lucide-react-native', () => {
  const { View } = jest.requireActual('react-native');
  const Icon = (props: object) => <View {...props} />;
  return { ArrowLeft: Icon, Check: Icon, Eye: Icon, EyeOff: Icon, KeyRound: Icon, Mail: Icon, Plane: Icon, Smartphone: Icon };
});

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ slug: 'login' }),
  useRouter: () => ({ back: mockBack, canGoBack: mockCanGoBack, push: jest.fn(), replace: mockReplace }),
}));

jest.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({
    enterUiAcceptanceMode: mockEnterUiAcceptanceMode,
    signIn: jest.fn(),
    uiAcceptanceAvailable: mockUiAcceptanceAvailable,
  }),
}));

describe('<LoginScreen />', () => {
  beforeEach(() => {
    mockEnterUiAcceptanceMode.mockClear();
    mockBack.mockClear();
    mockCanGoBack.mockReset();
    mockReplace.mockClear();
    mockUiAcceptanceAvailable = false;
  });

  it('returns to the welcome screen when login is the navigation root', async () => {
    mockCanGoBack.mockReturnValue(false);
    const screen = await render(
      <SafeAreaProvider initialMetrics={{ frame: { height: 812, width: 375, x: 0, y: 0 }, insets: { bottom: 34, left: 0, right: 0, top: 47 } }}>
        <LoginScreen />
      </SafeAreaProvider>,
    );

    fireEvent.press(screen.getByLabelText('返回'));

    expect(mockBack).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith('/auth/splash');
  });

  it('uses navigator history when the login screen has a previous route', async () => {
    mockCanGoBack.mockReturnValue(true);
    const screen = await render(
      <SafeAreaProvider initialMetrics={{ frame: { height: 812, width: 375, x: 0, y: 0 }, insets: { bottom: 34, left: 0, right: 0, top: 47 } }}>
        <LoginScreen />
      </SafeAreaProvider>,
    );

    fireEvent.press(screen.getByLabelText('返回'));

    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('renders the controlled invite-code login entry', async () => {
    const screen = await render(
      <SafeAreaProvider initialMetrics={{ frame: { height: 812, width: 375, x: 0, y: 0 }, insets: { bottom: 34, left: 0, right: 0, top: 47 } }}>
        <LoginScreen />
      </SafeAreaProvider>,
    );

    expect(screen.getByText('欢迎回来')).toBeTruthy();
    expect(screen.getByText('登录以继续你的 ICAO 备考进度')).toBeTruthy();
    expect(screen.getByText('当前使用专属邀请码登录，请向管理员获取邀请码。')).toBeTruthy();
    expect(screen.getByText('邀请码可在多台设备登录，学习数据会自动同步。')).toBeTruthy();
    expect(screen.queryByText('开发者 · 免登录验收')).toBeNull();
  });

  it('shows the developer entry only when the Web acceptance build enables it', async () => {
    mockUiAcceptanceAvailable = true;
    const screen = await render(
      <SafeAreaProvider initialMetrics={{ frame: { height: 812, width: 375, x: 0, y: 0 }, insets: { bottom: 34, left: 0, right: 0, top: 47 } }}>
        <LoginScreen />
      </SafeAreaProvider>,
    );

    fireEvent.press(screen.getByText('开发者 · 免登录验收'));

    expect(mockEnterUiAcceptanceMode).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)');
  });

  it('maps login failures to actionable messages', () => {
    expect(loginErrorMessage('invalid_invite_code')).toBe('邀请码无效或已停用');
    expect(loginErrorMessage('auth_network_error')).toBe('网络连接失败，请检查网络后重试。');
    expect(loginErrorMessage('auth_service_unavailable')).toBe('认证服务暂时不可用，请稍后重试。');
    expect(loginErrorMessage('auth_session_storage_unavailable')).toContain('浏览器禁止了本地存储');
    expect(loginErrorMessage('auth_request_not_completed')).toContain('认证请求未到达服务端');
  });
});
