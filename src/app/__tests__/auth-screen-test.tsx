import { act, fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LoginScreen, loginErrorMessage } from '@/components/auth/login-screen';

const mockRequestPhoneOtp = jest.fn();
const mockRequestPasswordRecoveryOtp = jest.fn();
const mockVerifyPhoneOtp = jest.fn();
const mockSignInWithPhonePassword = jest.fn();
const mockSignInWithApple = jest.fn();
const mockSignInWithWechat = jest.fn();
const mockConsumePendingPath = jest.fn();
const mockBack = jest.fn();
const mockCanGoBack = jest.fn();
const mockPush = jest.fn();
const mockReplace = jest.fn();
let mockParams: Record<string, string> = { slug: 'login' };

jest.mock('lucide-react-native', () => {
  const { View } = jest.requireActual('react-native');
  const Icon = (props: object) => <View {...props} />;
  return { ArrowLeft: Icon, Check: Icon, Eye: Icon, EyeOff: Icon, KeyRound: Icon, Mail: Icon, Plane: Icon, Smartphone: Icon };
});

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ back: mockBack, canGoBack: mockCanGoBack, push: mockPush, replace: mockReplace }),
}));

jest.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({
    consumePendingPath: mockConsumePendingPath,
    requestPhoneOtp: mockRequestPhoneOtp,
    requestPasswordRecoveryOtp: mockRequestPasswordRecoveryOtp,
    signInWithPhonePassword: mockSignInWithPhonePassword,
    signInWithApple: mockSignInWithApple,
    signInWithWechat: mockSignInWithWechat,
    verifyPhoneOtp: mockVerifyPhoneOtp,
  }),
}));

async function renderLoginScreen() {
  return render(
    <SafeAreaProvider initialMetrics={{ frame: { height: 812, width: 375, x: 0, y: 0 }, insets: { bottom: 34, left: 0, right: 0, top: 47 } }}>
      <LoginScreen />
    </SafeAreaProvider>,
  );
}

describe('<LoginScreen />', () => {
  beforeEach(() => {
    mockParams = { slug: 'login' };
    mockRequestPhoneOtp.mockReset().mockResolvedValue(undefined);
    mockRequestPasswordRecoveryOtp.mockReset().mockResolvedValue(undefined);
    mockVerifyPhoneOtp.mockReset().mockResolvedValue({
      user: { registrationPending: false },
    });
    mockSignInWithPhonePassword.mockReset().mockResolvedValue(undefined);
    mockSignInWithApple.mockReset().mockResolvedValue(undefined);
    mockSignInWithWechat.mockReset().mockResolvedValue(undefined);
    mockConsumePendingPath.mockReset().mockReturnValue(undefined);
    mockBack.mockClear();
    mockCanGoBack.mockReset();
    mockPush.mockClear();
    mockReplace.mockClear();
  });

  it('returns to the welcome screen when login is the navigation root', async () => {
    mockCanGoBack.mockReturnValue(false);
    const screen = await renderLoginScreen();

    await act(async () => { fireEvent.press(screen.getByLabelText('返回')); });

    expect(mockBack).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith('/auth/splash');
  });

  it('uses navigator history when the login screen has a previous route', async () => {
    mockCanGoBack.mockReturnValue(true);
    const screen = await renderLoginScreen();

    await act(async () => { fireEvent.press(screen.getByLabelText('返回')); });

    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('offers social, OTP, and password login with one registration consent', async () => {
    const screen = await renderLoginScreen();

    expect(screen.getByText('验证码登录')).toBeTruthy();
    expect(screen.getByText('密码登录')).toBeTruthy();
    expect(screen.getByText('微信登录')).toBeTruthy();
    expect(screen.getByTestId('apple-sign-in')).toBeTruthy();
    expect(screen.getByText('未注册手机号验证成功后会自动创建账号。')).toBeTruthy();
    expect(screen.getByRole('checkbox')).toBeTruthy();

    await act(async () => { fireEvent.press(screen.getByRole('tab', { name: '密码登录' })); });

    expect(screen.getByText('登录密码')).toBeTruthy();
    expect(screen.getByText('忘记密码')).toBeTruthy();
    expect(screen.getByRole('checkbox')).toBeTruthy();
    expect(screen.queryByText(/邀请码/u)).toBeNull();
  });

  it('accepts a pasted +86 phone number before normalizing the field', async () => {
    const screen = await renderLoginScreen();
    const phoneField = screen.getByPlaceholderText('请输入11位手机号');

    expect(phoneField.props.maxLength).toBe(14);
    await act(async () => { fireEvent.changeText(phoneField, '+8613800138000'); });

    expect(screen.getByPlaceholderText('请输入11位手机号').props.value).toBe('13800138000');
  });

  it('opens password recovery directly from the recovery route parameter', async () => {
    mockParams = { slug: 'login', mode: 'recovery' };
    const screen = await renderLoginScreen();

    expect(screen.getByText('重置密码')).toBeTruthy();
    expect(screen.getByText('获取重置验证码')).toBeTruthy();
    expect(screen.queryByText('验证码登录')).toBeNull();
  });

  it('logs an existing account in with a six-digit SMS code and starts a real-time countdown', async () => {
    const screen = await renderLoginScreen();

    await act(async () => { fireEvent.changeText(screen.getByPlaceholderText('请输入11位手机号'), '13800138000'); });
    await act(async () => { fireEvent.press(screen.getByRole('checkbox')); });
    await act(async () => { fireEvent.press(screen.getByText('获取验证码')); });

    expect(mockRequestPhoneOtp).toHaveBeenCalledWith('13800138000');
    expect(screen.getByText('60 秒后可重新获取')).toBeTruthy();

    const codeInput = screen.getByLabelText('短信验证码');
    expect(codeInput.props.autoFocus).toBe(true);
    expect(codeInput.props.keyboardType).toBe('number-pad');
    expect(codeInput.props.inputMode).toBe('numeric');
    expect(codeInput.props.showSoftInputOnFocus).toBe(true);
    expect(codeInput.props.textContentType).toBe('oneTimeCode');
    expect(codeInput.props.autoComplete).toBeUndefined();

    await act(async () => { fireEvent.changeText(codeInput, '123456'); });
    await act(async () => { fireEvent.press(screen.getByText('验证并进入')); });

    expect(mockVerifyPhoneOtp).toHaveBeenCalledWith('13800138000', '123456', 'login');
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)');
  });

  it('requires consent and auto-registers with phone OTP without forcing password setup', async () => {
    const screen = await renderLoginScreen();
    await act(async () => { fireEvent.changeText(screen.getByPlaceholderText('请输入11位手机号'), '13800138000'); });
    await act(async () => { fireEvent.press(screen.getByText('获取验证码')); });
    expect(screen.getByText('请确认已满14周岁，并同意用户协议与隐私政策。')).toBeTruthy();
    expect(mockRequestPhoneOtp).not.toHaveBeenCalled();

    await act(async () => { fireEvent.press(screen.getByRole('checkbox')); });
    await act(async () => { fireEvent.press(screen.getByText('获取验证码')); });

    expect(mockRequestPhoneOtp).toHaveBeenCalledWith('13800138000');
    expect(screen.getByText('输入验证码')).toBeTruthy();
    expect(screen.getByText('60 秒后可重新获取')).toBeTruthy();

    await act(async () => { fireEvent.changeText(screen.getByLabelText('短信验证码'), '123456'); });
    await act(async () => { fireEvent.press(screen.getByText('验证并进入')); });
    expect(mockVerifyPhoneOtp).toHaveBeenCalledWith('13800138000', '123456', 'login');
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)');
    expect(mockReplace).not.toHaveBeenCalledWith('/account/password?mode=setup');
  });

  it('uses WeChat as an auto-registration login after consent', async () => {
    const screen = await renderLoginScreen();
    await act(async () => { fireEvent.press(screen.getByRole('checkbox')); });
    await act(async () => { fireEvent.press(screen.getByText('微信登录')); });
    expect(mockSignInWithWechat).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)');
  });

  it('signs in with the phone and password using the same account entry', async () => {
    mockConsumePendingPath.mockReturnValue('/question-bank');
    const screen = await renderLoginScreen();

    await act(async () => { fireEvent.press(screen.getByRole('tab', { name: '密码登录' })); });
    await act(async () => { fireEvent.changeText(screen.getByPlaceholderText('请输入11位手机号'), '13800138000'); });
    await act(async () => { fireEvent.changeText(screen.getByPlaceholderText('请输入登录密码'), 'Flight2026safe'); });
    await act(async () => { fireEvent.press(screen.getByRole('button', { name: '密码登录' })); });

    expect(mockSignInWithPhonePassword).toHaveBeenCalledWith('13800138000', 'Flight2026safe');
    expect(mockReplace).toHaveBeenCalledWith('/question-bank');
  });

  it('verifies an existing phone before routing to password recovery', async () => {
    const screen = await renderLoginScreen();

    await act(async () => { fireEvent.press(screen.getByRole('tab', { name: '密码登录' })); });
    await act(async () => { fireEvent.press(screen.getByText('忘记密码')); });

    expect(screen.getByText('重置密码')).toBeTruthy();
    expect(screen.getByText('找回密码不会为未知手机号创建新账号。')).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull();
    await act(async () => { fireEvent.changeText(screen.getByPlaceholderText('请输入11位手机号'), '13800138000'); });
    await act(async () => { fireEvent.press(screen.getByText('获取重置验证码')); });
    expect(mockRequestPasswordRecoveryOtp).toHaveBeenCalledWith('13800138000');

    await act(async () => { fireEvent.changeText(screen.getByLabelText('短信验证码'), '654321'); });
    await act(async () => { fireEvent.press(screen.getByText('继续重置密码')); });

    expect(mockVerifyPhoneOtp).toHaveBeenCalledWith('13800138000', '654321', 'recovery');
    expect(mockReplace).toHaveBeenCalledWith('/account/password?mode=recovery');
  });

  it('maps dual-auth failures to actionable and non-enumerating messages', () => {
    expect(loginErrorMessage('invalid_phone_number')).toContain('中国大陆手机号');
    expect(loginErrorMessage('invalid_phone_otp')).toContain('验证码错误或已过期');
    expect(loginErrorMessage('invalid_phone_password')).toContain('10–64位');
    expect(loginErrorMessage('invalid_phone_or_password')).toBe('手机号或密码不正确，请重新输入。');
    expect(loginErrorMessage('phone_account_not_found')).not.toContain('未注册');
    expect(loginErrorMessage('phone_not_confirmed')).not.toContain('尚未');
    expect(loginErrorMessage('supplier_private_failure')).toBe('登录失败，请稍后重试。');
    expect(loginErrorMessage('supplier_private_failure')).not.toContain('supplier_private_failure');
    expect(loginErrorMessage('phone_otp_rate_limited')).toContain('请求过于频繁');
    expect(loginErrorMessage('auth_network_error')).toBe('网络连接失败，请检查网络后重试。');
    expect(loginErrorMessage('auth_service_unavailable')).toBe('认证服务暂时不可用，请稍后重试。');
  });
});
