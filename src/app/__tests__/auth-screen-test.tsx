import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert, AppState, type AppStateStatus } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { createAuthActionGate, LoginScreen, loginErrorMessage } from '@/components/auth/login-screen.native';

const mockRequestPhoneOtp = jest.fn();
const mockRequestPasswordRecoveryOtp = jest.fn();
const mockVerifyPhoneOtp = jest.fn();
const mockSignInWithPhonePassword = jest.fn();
const mockSignInWithApple = jest.fn();
const mockSignInWithWechat = jest.fn();
const mockIsWechatSignInAvailable = jest.fn();
const mockRememberLoginConsent = jest.fn();
jest.mock('@/features/app-content/repository.native', () => {
  const legal = require('../../../content/app-content/text.json').legal;
  return { builtinAppContent: { legal }, loadLegalDocuments: jest.fn().mockResolvedValue({ documents: legal }) };
});
const mockConsumePendingPath = jest.fn();
const mockReadPhoneOtpChallenge = jest.fn();
const mockWritePhoneOtpChallenge = jest.fn();
const mockClearPhoneOtpChallenge = jest.fn();
const mockBeginPhoneOtpChallengeMutation = jest.fn();
const mockInvalidatePhoneOtpChallengeMutation = jest.fn();
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
    isWechatSignInAvailable: mockIsWechatSignInAvailable,
    rememberLoginConsent: mockRememberLoginConsent,
    verifyPhoneOtp: mockVerifyPhoneOtp,
  }),
}));

jest.mock('@/features/auth/phone-otp-challenge-store', () => ({
  beginPhoneOtpChallengeMutation: (...args: unknown[]) => mockBeginPhoneOtpChallengeMutation(...args),
  clearPhoneOtpChallenge: (...args: unknown[]) => mockClearPhoneOtpChallenge(...args),
  invalidatePhoneOtpChallengeMutation: (...args: unknown[]) => mockInvalidatePhoneOtpChallengeMutation(...args),
  phoneOtpChallenge: (phone: string, purpose: 'login' | 'recovery', response: { challengeId: string; expiresAt: number; issuedAt: number; resendAllowedAt: number; serverTime: number }) => ({
    challengeId: response.challengeId,
    expiresAt: response.expiresAt,
    issuedAt: response.issuedAt,
    phone,
    purpose,
    resendAllowedAt: response.resendAllowedAt,
    serverTimeOffsetMs: response.serverTime - Date.now(),
    version: 2,
  }),
  phoneOtpServerNow: (challenge: { serverTimeOffsetMs: number }, now = Date.now()) => now + challenge.serverTimeOffsetMs,
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
    jest.spyOn(AppState, 'addEventListener').mockReset().mockReturnValue({ remove: jest.fn() });
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    jest.mocked(Alert.alert).mockClear();
    mockParams = { slug: 'login' };
    const now = Date.now();
    const response = {
      accepted: true,
      challengeId: '10000000-0000-4000-8000-000000000010',
      expiresAt: now + 300_000,
      issuedAt: now,
      resendAllowedAt: now + 60_000,
      serverTime: now,
    };
    mockRequestPhoneOtp.mockReset().mockResolvedValue(response);
    mockRequestPasswordRecoveryOtp.mockReset().mockResolvedValue(response);
    mockVerifyPhoneOtp.mockReset().mockResolvedValue({
      user: { registrationPending: false },
    });
    mockSignInWithPhonePassword.mockReset().mockResolvedValue(undefined);
    mockSignInWithApple.mockReset().mockResolvedValue(undefined);
    mockSignInWithWechat.mockReset().mockResolvedValue(undefined);
    mockIsWechatSignInAvailable.mockReset().mockResolvedValue(true);
    mockConsumePendingPath.mockReset().mockReturnValue(undefined);
    mockReadPhoneOtpChallenge.mockReset().mockResolvedValue(undefined);
    mockWritePhoneOtpChallenge.mockReset().mockResolvedValue(true);
    mockClearPhoneOtpChallenge.mockReset().mockResolvedValue(undefined);
    mockBeginPhoneOtpChallengeMutation.mockReset().mockReturnValue(1);
    mockInvalidatePhoneOtpChallengeMutation.mockReset().mockReturnValue(2);
    mockBack.mockClear();
    mockCanGoBack.mockReset();
    mockPush.mockClear();
    mockReplace.mockClear();
  });

  it('does not show a back button or a welcome step at the mandatory login entry', async () => {
    mockCanGoBack.mockReturnValue(true);
    const screen = await renderLoginScreen();
    expect(screen.queryByLabelText('返回')).toBeNull();
    expect(screen.queryByText('开始使用')).toBeNull();
    expect(mockBack).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('returns from password recovery to the same login form', async () => {
    mockParams = { slug: 'login', mode: 'recovery' };
    const screen = await renderLoginScreen();
    await fireEvent.press(screen.getByLabelText('返回'));
    expect(screen.getByText('登录 / 注册')).toBeTruthy();
    expect(screen.queryByLabelText('返回')).toBeNull();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('offers Apple, WeChat, OTP, and password login with approved WeChat configuration', async () => {
    const screen = await renderLoginScreen();

    expect(screen.getByText('验证码登录')).toBeTruthy();
    expect(screen.getByText('密码登录')).toBeTruthy();
    expect(screen.getByTestId('apple-sign-in')).toBeTruthy();
    expect(screen.getByTestId('wechat-sign-in')).toBeTruthy();
    expect(screen.queryByText('未注册手机号验证成功后会自动创建账号。')).toBeNull();
    expect(screen.getByRole('checkbox')).toBeTruthy();
    expect(screen.getByText('我已年满16周岁，并同意用户协议与隐私政策')).toBeTruthy();

    await fireEvent.press(screen.getByRole('tab', { name: '密码登录' }));

    expect(screen.getByText('登录密码')).toBeTruthy();
    expect(screen.getByText('忘记密码')).toBeTruthy();
    expect(screen.getByRole('checkbox')).toBeTruthy();
    expect(screen.queryByText(/邀请码/u)).toBeNull();
  });

  it('keeps WeChat hidden until the first installation result without blocking other login methods', async () => {
    let finish!: (installed: boolean) => void;
    mockIsWechatSignInAvailable.mockImplementationOnce(() => new Promise<boolean>((resolve) => { finish = resolve; }));
    const screen = await renderLoginScreen();
    expect(screen.queryByTestId('wechat-sign-in')).toBeNull();
    expect(screen.getByTestId('apple-sign-in')).toBeTruthy();
    expect(screen.getByRole('tab', { name: '密码登录' })).toBeTruthy();
    await act(async () => finish(false));
    expect(screen.queryByTestId('wechat-sign-in')).toBeNull();
  });

  it('keeps an unknown initial installation state hidden when the native query fails', async () => {
    mockIsWechatSignInAvailable.mockRejectedValueOnce(new Error('query failed'));
    const screen = await renderLoginScreen();
    expect(screen.queryByTestId('wechat-sign-in')).toBeNull();
    expect(screen.getByTestId('apple-sign-in')).toBeTruthy();
    expect(screen.getByRole('tab', { name: '密码登录' })).toBeTruthy();
  });

  it('refreshes on foreground, ignores older results, and removes its subscription', async () => {
    let change!: (state: AppStateStatus) => void;
    const remove = jest.fn();
    const subscription = jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
      change = listener;
      return { remove };
    });
    const screen = await renderLoginScreen();
    expect(screen.getByTestId('wechat-sign-in')).toBeTruthy();
    let oldResult!: (installed: boolean) => void;
    mockIsWechatSignInAvailable.mockImplementationOnce(() => new Promise<boolean>((resolve) => { oldResult = resolve; }));
    await act(async () => { change('background'); change('active'); });
    mockIsWechatSignInAvailable.mockResolvedValueOnce(false);
    await act(async () => { change('background'); change('active'); });
    expect(screen.queryByTestId('wechat-sign-in')).toBeNull();
    await act(async () => oldResult(true));
    expect(screen.queryByTestId('wechat-sign-in')).toBeNull();
    mockIsWechatSignInAvailable.mockResolvedValueOnce(true);
    await act(async () => { change('background'); change('active'); });
    expect(screen.getByTestId('wechat-sign-in')).toBeTruthy();
    expect(subscription).toHaveBeenCalledTimes(1);
    await screen.unmount();
    expect(remove).toHaveBeenCalledTimes(1);
    subscription.mockRestore();
  });

  it('hides an uninstalled client discovered at click time and keeps other login options available', async () => {
    const screen = await renderLoginScreen();
    await fireEvent.press(screen.getByRole('checkbox'));
    mockIsWechatSignInAvailable.mockResolvedValueOnce(false);
    await fireEvent.press(screen.getByTestId('wechat-sign-in'));
    expect(mockSignInWithWechat).not.toHaveBeenCalled();
    expect(screen.queryByTestId('wechat-sign-in')).toBeNull();
    expect(screen.getByText('微信未安装，请使用其他方式登录')).toBeTruthy();
    expect(screen.getByTestId('apple-sign-in')).toBeTruthy();
  });

  it('also hides WeChat if it is uninstalled between the click check and native dispatch', async () => {
    const screen = await renderLoginScreen();
    await fireEvent.press(screen.getByRole('checkbox'));
    mockSignInWithWechat.mockRejectedValueOnce(new Error('wechat_not_installed'));
    await fireEvent.press(screen.getByTestId('wechat-sign-in'));
    expect(screen.queryByTestId('wechat-sign-in')).toBeNull();
    expect(screen.getByText('微信未安装，请使用其他方式登录')).toBeTruthy();
  });

  it('keeps a confirmed installed entry on query failure and reports a click failure without authorizing', async () => {
    const screen = await renderLoginScreen();
    await fireEvent.press(screen.getByRole('checkbox'));
    mockIsWechatSignInAvailable.mockRejectedValueOnce(new Error('query failed'));
    await fireEvent.press(screen.getByTestId('wechat-sign-in'));
    expect(screen.getByTestId('wechat-sign-in')).toBeTruthy();
    expect(mockSignInWithWechat).not.toHaveBeenCalled();
    expect(screen.getByText('暂时无法检查微信状态，请重试或使用其他方式登录。')).toBeTruthy();
  });

  it('does not interrupt an active authorization during foreground refresh or allow a second click', async () => {
    let change!: (state: AppStateStatus) => void;
    const subscription = jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
      change = listener;
      return { remove: jest.fn() };
    });
    let finish!: () => void;
    mockSignInWithWechat.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    const screen = await renderLoginScreen();
    await fireEvent.press(screen.getByRole('checkbox'));
    await fireEvent.press(screen.getByTestId('wechat-sign-in'));
    await act(async () => { change('background'); change('active'); });
    await fireEvent.press(screen.getByTestId('wechat-sign-in'));
    expect(mockSignInWithWechat).toHaveBeenCalledTimes(1);
    await act(async () => finish());
    await fireEvent.press(screen.getByTestId('wechat-sign-in'));
    expect(mockSignInWithWechat).toHaveBeenCalledTimes(2);
    subscription.mockRestore();
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
    expect(screen.getByText('60s')).toBeTruthy();

    const codeInput = screen.getByLabelText('短信验证码');
    expect(codeInput.props.keyboardType).toBe('number-pad');
    expect(codeInput.props.inputMode).toBe('numeric');
    expect(codeInput.props.textContentType).toBe('oneTimeCode');
    expect(codeInput.props.autoComplete).toBeUndefined();

    await act(async () => { fireEvent.changeText(codeInput, '123456'); });
    await act(async () => { fireEvent.press(screen.getByRole('button', { name: '登录 / 注册' })); });

    expect(mockVerifyPhoneOtp).toHaveBeenCalledWith(expect.objectContaining({ challengeId: '10000000-0000-4000-8000-000000000010', phone: '+8613800138000', purpose: 'login' }), '123456');
    expect(mockReplace).not.toHaveBeenCalledWith('/(tabs)');
  });

  it('requires consent and auto-registers with phone OTP without forcing password setup', async () => {
    const screen = await renderLoginScreen();
    await fireEvent.changeText(screen.getByPlaceholderText('请输入11位手机号'), '13800138000');
    await fireEvent.press(screen.getByText('获取验证码'));
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('请确认已满16周岁，并同意用户协议与隐私政策。')).toBeNull();
    expect(mockRequestPhoneOtp).not.toHaveBeenCalled();
    const actions = jest.mocked(Alert.alert).mock.calls[0][2]!;
    await act(async () => { actions.find(({ text }) => text === '同意并继续')!.onPress!(); });
    expect(screen.getByRole('checkbox').props.accessibilityState.checked).toBe(true);

    expect(mockRequestPhoneOtp).toHaveBeenCalledWith('+8613800138000');
    expect(screen.getByText('60s')).toBeTruthy();

    await act(async () => { fireEvent.changeText(screen.getByLabelText('短信验证码'), '123456'); });
    await act(async () => { fireEvent.press(screen.getByRole('button', { name: '登录 / 注册' })); });
    expect(mockVerifyPhoneOtp).toHaveBeenCalledWith(expect.objectContaining({ phone: '+8613800138000', purpose: 'login' }), '123456');
    expect(mockReplace).not.toHaveBeenCalledWith('/(tabs)');
    expect(mockReplace).not.toHaveBeenCalledWith('/account/password?mode=setup');
  });

  it('leaves the original action untouched when consent is cancelled and prevents duplicate prompts', async () => {
    const screen = await renderLoginScreen();
    await fireEvent.press(screen.getByTestId('apple-sign-in'));
    await fireEvent.press(screen.getByTestId('apple-sign-in'));
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    const actions = jest.mocked(Alert.alert).mock.calls[0][2]!;
    await act(async () => { actions.find(({ text }) => text === '取消')!.onPress!(); });
    expect(mockSignInWithApple).not.toHaveBeenCalled();
    expect(screen.getByRole('checkbox').props.accessibilityState.checked).toBe(false);
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

  it.each(['Old123', `${'a'.repeat(63)}1`])('keeps existing-password login compatible without applying new-password limits (%#)', async (password) => {
    const screen = await renderLoginScreen();
    await fireEvent.press(screen.getByRole('tab', { name: '密码登录' }));
    await fireEvent.changeText(screen.getByPlaceholderText('请输入11位手机号'), '13800138000');
    await fireEvent.changeText(screen.getByPlaceholderText('请输入登录密码'), password);
    await fireEvent.press(screen.getByRole('checkbox'));
    await fireEvent.press(screen.getByRole('button', { name: '密码登录' }));
    expect(mockSignInWithPhonePassword).toHaveBeenCalledWith('+8613800138000', password);
    expect(screen.queryByText('密码需为8–32位，并同时包含字母和数字。')).toBeNull();
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

    expect(mockVerifyPhoneOtp).toHaveBeenCalledWith(expect.objectContaining({ phone: '+8613800138000', purpose: 'recovery' }), '654321');
    expect(mockReplace).not.toHaveBeenCalledWith('/account/password?mode=recovery');
  });

  it('does not persist a late recovery challenge after returning to password login', async () => {
    let resolveRecovery!: (value: {
      accepted: true;
      challengeId: string;
      expiresAt: number;
      issuedAt: number;
      resendAllowedAt: number;
      serverTime: number;
    }) => void;
    mockRequestPasswordRecoveryOtp.mockImplementationOnce(() => new Promise((resolve) => {
      resolveRecovery = resolve;
    }));
    const screen = await renderLoginScreen();

    await fireEvent.press(screen.getByRole('tab', { name: '密码登录' }));
    await fireEvent.press(screen.getByText('忘记密码'));
    await fireEvent.changeText(screen.getByPlaceholderText('请输入11位手机号'), '13800138000');
    await fireEvent.press(screen.getByText('获取重置验证码'));
    await fireEvent.press(screen.getByText('返回密码登录'));
    const now = Date.now();
    await act(async () => {
      resolveRecovery({
        accepted: true,
        challengeId: '40000000-0000-4000-8000-000000000040',
        expiresAt: now + 300_000,
        issuedAt: now,
        resendAllowedAt: now + 60_000,
        serverTime: now,
      });
      await Promise.resolve();
    });

    expect(screen.getByPlaceholderText('请输入登录密码')).toBeTruthy();
    expect(mockWritePhoneOtpChallenge).not.toHaveBeenCalled();
  });

  it('restores an unexpired OTP challenge after the screen is reopened', async () => {
    const now = Date.now();
    mockReadPhoneOtpChallenge.mockResolvedValueOnce({
      challengeId: '10000000-0000-4000-8000-000000000011',
      expiresAt: now + 240_000,
      issuedAt: now - 60_000,
      phone: '+8613800138000',
      purpose: 'login',
      resendAllowedAt: now,
      serverTimeOffsetMs: 0,
      version: 2,
    });

    const screen = await renderLoginScreen();

    expect(screen.getByPlaceholderText('请输入11位手机号').props.value).toBe('13800138000');
    expect(screen.getByText('重新获取')).toBeTruthy();
    expect(mockRequestPhoneOtp).not.toHaveBeenCalled();
  });

  it('deduplicates rapid OTP requests before React can disable the button', async () => {
    let resolveRequest!: (value: { accepted: true; challengeId: string; expiresAt: number; issuedAt: number; resendAllowedAt: number; serverTime: number }) => void;
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
      await Promise.resolve();
      expect(mockRequestPhoneOtp).toHaveBeenCalledTimes(1);
      resolveRequest({
        accepted: true,
        challengeId: '10000000-0000-4000-8000-000000000012',
        expiresAt: now + 300_000,
        issuedAt: now,
        resendAllowedAt: now + 60_000,
        serverTime: now,
      });
      await Promise.all([firstRequest, secondRequest]);
    });
  });

  it('deduplicates rapid auth actions before React can disable the control', () => {
    const gate = createAuthActionGate();
    expect(gate.begin()).toBe(true);
    expect(gate.begin()).toBe(false);
    gate.end();
    expect(gate.begin()).toBe(true);
  });

  it('maps dual-auth failures to actionable and non-enumerating messages', () => {
    expect(loginErrorMessage('invalid_phone_number')).toContain('中国大陆手机号');
    expect(loginErrorMessage('invalid_phone_otp')).toContain('验证码错误或已过期');
    expect(loginErrorMessage('invalid_phone_password')).toContain('8–32位');
    expect(loginErrorMessage('invalid_phone_or_password')).toBe('手机号或密码不正确，请重新输入。');
    expect(loginErrorMessage('phone_account_not_found')).not.toContain('未注册');
    expect(loginErrorMessage('phone_not_confirmed')).not.toContain('尚未');
    expect(loginErrorMessage('supplier_private_failure')).toBe('登录失败，请稍后重试。');
    expect(loginErrorMessage('supplier_private_failure')).not.toContain('supplier_private_failure');
    expect(loginErrorMessage('phone_otp_rate_limited')).toContain('请求过于频繁');
    expect(loginErrorMessage('auth_network_error')).toBe('网络连接失败，请检查网络后重试。');
    expect(loginErrorMessage('auth_service_unavailable')).toBe('认证服务暂时不可用，请稍后重试。');
    expect(loginErrorMessage('wechat_auth_configuration_pending')).toContain('微信登录正在配置');
    expect(loginErrorMessage('wechat_not_installed')).toContain('微信');
  });
});
