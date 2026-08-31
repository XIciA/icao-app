import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LoginScreen, loginErrorMessage } from '@/components/auth/login-screen';

const mockRequestPhoneOtp = jest.fn();
const mockRequestPasswordRecoveryOtp = jest.fn();
const mockVerifyPhoneOtp = jest.fn();
const mockSignInWithPhonePassword = jest.fn();
const mockSignInWithApple = jest.fn();
const mockConsumePendingPath = jest.fn();
const mockReadPhoneOtpChallenge = jest.fn();
const mockWritePhoneOtpChallenge = jest.fn();
const mockClearPhoneOtpChallenge = jest.fn();
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
    verifyPhoneOtp: mockVerifyPhoneOtp,
  }),
}));

jest.mock('@/features/auth/phone-otp-challenge-store', () => ({
  clearPhoneOtpChallenge: (...args: unknown[]) => mockClearPhoneOtpChallenge(...args),
  phoneOtpChallenge: (phone: string, purpose: 'login' | 'recovery', response: { expiresAt: number; issuedAt: number; resendAllowedAt: number }) => ({
    expiresAt: response.expiresAt,
    issuedAt: response.issuedAt,
    phone,
    purpose,
    resendAllowedAt: response.resendAllowedAt,
    version: 1,
  }),
  readPhoneOtpChallenge: (...args: unknown[]) => mockReadPhoneOtpChallenge(...args),
  writePhoneOtpChallenge: (...args: unknown[]) => mockWritePhoneOtpChallenge(...args),
}));

async function renderLoginScreen() {
  const screen = await render(
    <SafeAreaProvider initialMetrics={{ frame: { height: 812, width: 375, x: 0, y: 0 }, insets: { bottom: 34, left: 0, right: 0, top: 47 } }}>
      <LoginScreen />
    </SafeAreaProvider>,
  );
  await waitFor(() => expect(screen.queryByText('正在恢复验证')).toBeNull());
  return screen;
}

describe('<LoginScreen />', () => {
  beforeEach(() => {
    mockParams = { slug: 'login' };
    const now = Date.now();
    const response = { accepted: true, expiresAt: now + 300_000, issuedAt: now, resendAllowedAt: now + 60_000 };
    mockRequestPhoneOtp.mockReset().mockResolvedValue(response);
    mockRequestPasswordRecoveryOtp.mockReset().mockResolvedValue(response);
    mockVerifyPhoneOtp.mockReset().mockResolvedValue({
      user: { registrationPending: false },
    });
    mockSignInWithPhonePassword.mockReset().mockResolvedValue(undefined);
    mockSignInWithApple.mockReset().mockResolvedValue(undefined);
    mockConsumePendingPath.mockReset().mockReturnValue(undefined);
    mockReadPhoneOtpChallenge.mockReset().mockResolvedValue(undefined);
    mockWritePhoneOtpChallenge.mockReset().mockResolvedValue(undefined);
    mockClearPhoneOtpChallenge.mockReset().mockResolvedValue(undefined);
    mockBack.mockClear();
    mockCanGoBack.mockReset();
    mockPush.mockClear();
    mockReplace.mockClear();
  });

  it('returns to the welcome screen when login is the navigation root', async () => {
    mockCanGoBack.mockReturnValue(false);
    const screen = await renderLoginScreen();

    await fireEvent.press(screen.getByLabelText('返回'));

    expect(mockBack).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith('/auth/splash');
  });

  it('uses navigator history when the login screen has a previous route', async () => {
    mockCanGoBack.mockReturnValue(true);
    const screen = await renderLoginScreen();

    await fireEvent.press(screen.getByLabelText('返回'));

    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('offers social, OTP, and password login with one registration consent', async () => {
    const screen = await renderLoginScreen();

    expect(screen.getByText('验证码登录')).toBeTruthy();
    expect(screen.getByText('密码登录')).toBeTruthy();
    expect(screen.queryByText('微信登录')).toBeNull();
    expect(screen.getByTestId('apple-sign-in')).toBeTruthy();
    expect(screen.getByText('未注册手机号验证成功后会自动创建账号。')).toBeTruthy();
    expect(screen.getByRole('checkbox')).toBeTruthy();
    expect(screen.getByText('我已年满16周岁，并同意用户协议与隐私政策')).toBeTruthy();

    await fireEvent.press(screen.getByRole('tab', { name: '密码登录' }));

    expect(screen.getByText('登录密码')).toBeTruthy();
    expect(screen.getByText('忘记密码')).toBeTruthy();
    expect(screen.getByRole('checkbox')).toBeTruthy();
    expect(screen.queryByText(/邀请码/u)).toBeNull();
  });

  it('accepts a pasted +86 phone number before normalizing the field', async () => {
    const screen = await renderLoginScreen();
    const phoneField = screen.getByPlaceholderText('请输入11位手机号');

    expect(phoneField.props.maxLength).toBe(14);
    await fireEvent.changeText(phoneField, '+8613800138000');

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

    await fireEvent.changeText(screen.getByPlaceholderText('请输入11位手机号'), '13800138000');
    await fireEvent.press(screen.getByRole('checkbox'));
    await fireEvent.press(screen.getByText('获取验证码'));

    expect(mockRequestPhoneOtp).toHaveBeenCalledWith('+8613800138000');
    expect(screen.getByText('60 秒后可重新获取')).toBeTruthy();

    const codeInput = screen.getByLabelText('短信验证码');
    expect(codeInput.props.autoFocus).toBe(true);
    expect(codeInput.props.keyboardType).toBe('number-pad');
    expect(codeInput.props.inputMode).toBe('numeric');
    expect(codeInput.props.showSoftInputOnFocus).toBe(true);
    expect(codeInput.props.textContentType).toBe('oneTimeCode');
    expect(codeInput.props.autoComplete).toBeUndefined();

    await fireEvent.changeText(codeInput, '123456');
    await fireEvent.press(screen.getByText('验证并进入'));

    expect(mockVerifyPhoneOtp).toHaveBeenCalledWith('+8613800138000', '123456', 'login');
    expect(mockReplace).not.toHaveBeenCalledWith('/(tabs)');
  });

  it('requires consent and auto-registers with phone OTP without forcing password setup', async () => {
    const screen = await renderLoginScreen();
    await fireEvent.changeText(screen.getByPlaceholderText('请输入11位手机号'), '13800138000');
    await fireEvent.press(screen.getByText('获取验证码'));
    expect(screen.getByText('请确认已满16周岁，并同意用户协议与隐私政策。')).toBeTruthy();
    expect(mockRequestPhoneOtp).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('checkbox'));
    await fireEvent.press(screen.getByText('获取验证码'));

    expect(mockRequestPhoneOtp).toHaveBeenCalledWith('+8613800138000');
    expect(screen.getByText('输入验证码')).toBeTruthy();
    expect(screen.getByText('60 秒后可重新获取')).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('短信验证码'), '123456');
    await fireEvent.press(screen.getByText('验证并进入'));
    expect(mockVerifyPhoneOtp).toHaveBeenCalledWith('+8613800138000', '123456', 'login');
    expect(mockReplace).not.toHaveBeenCalledWith('/(tabs)');
    expect(mockReplace).not.toHaveBeenCalledWith('/account/password?mode=setup');
  });

  it('uses Apple as an auto-registration login after consent', async () => {
    const screen = await renderLoginScreen();
    await fireEvent.press(screen.getByRole('checkbox'));
    await fireEvent.press(screen.getByTestId('apple-sign-in'));
    expect(mockSignInWithApple).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalledWith('/(tabs)');
  });

  it('signs in with the phone and password using the same account entry', async () => {
    mockConsumePendingPath.mockReturnValue('/question-bank');
    const screen = await renderLoginScreen();

    await fireEvent.press(screen.getByRole('tab', { name: '密码登录' }));
    await fireEvent.changeText(screen.getByPlaceholderText('请输入11位手机号'), '13800138000');
    await fireEvent.changeText(screen.getByPlaceholderText('请输入登录密码'), 'Flight2026safe');
    await fireEvent.press(screen.getByRole('checkbox'));
    await fireEvent.press(screen.getByRole('button', { name: '密码登录' }));

    expect(mockSignInWithPhonePassword).toHaveBeenCalledWith('+8613800138000', 'Flight2026safe');
    expect(mockReplace).not.toHaveBeenCalledWith('/question-bank');
  });

  it('verifies an existing phone before routing to password recovery', async () => {
    const screen = await renderLoginScreen();

    await fireEvent.press(screen.getByRole('tab', { name: '密码登录' }));
    await fireEvent.press(screen.getByText('忘记密码'));

    expect(screen.getByText('重置密码')).toBeTruthy();
    expect(screen.getByText('找回密码不会为未知手机号创建新账号。')).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull();
    await fireEvent.changeText(screen.getByPlaceholderText('请输入11位手机号'), '13800138000');
    await fireEvent.press(screen.getByText('获取重置验证码'));
    expect(mockRequestPasswordRecoveryOtp).toHaveBeenCalledWith('+8613800138000');

    await fireEvent.changeText(screen.getByLabelText('短信验证码'), '654321');
    await fireEvent.press(screen.getByText('继续重置密码'));

    expect(mockVerifyPhoneOtp).toHaveBeenCalledWith('+8613800138000', '654321', 'recovery');
    expect(mockReplace).not.toHaveBeenCalledWith('/account/password?mode=recovery');
  });

  it('restores an unexpired OTP challenge after the screen is reopened', async () => {
    const now = Date.now();
    mockReadPhoneOtpChallenge.mockResolvedValueOnce({
      expiresAt: now + 240_000,
      issuedAt: now - 60_000,
      phone: '+8613800138000',
      purpose: 'login',
      resendAllowedAt: now,
      version: 1,
    });

    const screen = await renderLoginScreen();

    expect(screen.getByText('输入验证码')).toBeTruthy();
    expect(screen.getByText(/138\*{4}8000/u)).toBeTruthy();
    expect(screen.getByText('重新获取验证码')).toBeTruthy();
    expect(mockRequestPhoneOtp).not.toHaveBeenCalled();
  });

  it('deduplicates rapid OTP requests before React can disable the button', async () => {
    let resolveRequest!: (value: { accepted: true; expiresAt: number; issuedAt: number; resendAllowedAt: number }) => void;
    mockRequestPhoneOtp.mockImplementationOnce(() => new Promise((resolve) => { resolveRequest = resolve; }));
    const screen = await renderLoginScreen();
    await fireEvent.changeText(screen.getByPlaceholderText('请输入11位手机号'), '13800138000');
    await fireEvent.press(screen.getByRole('checkbox'));

    let buttonFiber = screen.getByText('获取验证码').unstable_fiber;
    while (buttonFiber?.return && typeof buttonFiber.memoizedProps?.onPress !== 'function') {
      buttonFiber = buttonFiber.return;
    }
    const press = buttonFiber?.memoizedProps?.onPress;
    if (typeof press !== 'function') throw new Error('OTP request button has no press handler');
    const now = Date.now();
    await act(async () => {
      const firstRequest = press();
      const secondRequest = press();
      expect(mockRequestPhoneOtp).toHaveBeenCalledTimes(1);
      resolveRequest({ accepted: true, expiresAt: now + 300_000, issuedAt: now, resendAllowedAt: now + 60_000 });
      await Promise.all([firstRequest, secondRequest]);
    });
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
