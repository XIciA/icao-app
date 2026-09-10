import { cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AccountScreen } from '@/features/account/AccountScreen';
import { APP_DISPLAY_VERSION } from '@/config/app-version';
import { InfoScreen } from '@/features/info/InfoScreen';

let mockParams: Record<string, string> = { slug: '' };
const mockSubmitFeedback = jest.fn();
const mockLaunchImageLibrary = jest.fn();
const mockUpdatePassword = jest.fn();
const mockSignOut = jest.fn();
const mockRequestPhoneBindingOtp = jest.fn();
const mockResendPhoneBindingOtp = jest.fn();
const mockVerifyPhoneBindingOtp = jest.fn();
const mockAuthorizePhoneBinding = jest.fn();
const mockRouterReplace = jest.fn();
const mockRouterPush = jest.fn();
let mockAuthSession: { user: { hasPassword: boolean; id: string; phone?: string; providers?: ('phone' | 'apple' | 'wechat')[]; registrationPending: boolean } } | undefined;
let mockAccount: { accountId: string; hasPassword?: boolean; phone?: string; phoneBound: boolean; providers: ('phone' | 'apple' | 'wechat')[] } | undefined;
let mockPasswordChangePurpose: 'recovery' | 'setup' | undefined;

jest.mock('lucide-react-native', () => {
  const { View } = jest.requireActual('react-native');
  const Icon = (props: object) => <View {...props} />;
  return new Proxy({}, { get: () => Icon });
});

jest.mock('@/features/question-bank/recording/expo-recorder-adapter', () => ({
  getMicrophonePermission: jest.fn(async () => ({ granted: false })),
  requestMicrophonePermission: jest.fn(async () => ({ granted: false })),
}));

jest.mock('@/features/question-bank/recording/recording-repository', () => ({
  recordingRepository: { clearAll: jest.fn() },
}));

jest.mock('@/features/radio-player/radio-player-storage', () => ({
  clearRadioPlayerAccountData: jest.fn(),
}));

jest.mock('@/features/ai/ai-client', () => ({
  getCachedAiConsentHint: jest.fn().mockResolvedValue(false),
  hasAiConsent: jest.fn().mockResolvedValue(false),
  withdrawAiConsent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/features/account/privacy-self-service.native', () => ({
  clearLearningData: jest.fn(),
  deleteAllAiResults: jest.fn(),
}));

jest.mock('@/features/feedback/feedback-client', () => ({
  createClientSubmissionId: () => '00000000-0000-4000-8000-000000000123',
  submitFeedback: (...args: unknown[]) => mockSubmitFeedback(...args),
}));

jest.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({
    account: mockAccount,
    session: mockAuthSession,
    passwordChangePurpose: mockPasswordChangePurpose,
    passwordChangeReturnPath: '/account/security',
    deleteAccount: jest.fn(),
    signOut: (...args: unknown[]) => mockSignOut(...args),
    signOutAll: jest.fn(),
    requestPhoneBindingOtp: (...args: unknown[]) => mockRequestPhoneBindingOtp(...args),
    resendPhoneBindingOtp: (...args: unknown[]) => mockResendPhoneBindingOtp(...args),
    verifyPhoneBindingOtp: (...args: unknown[]) => mockVerifyPhoneBindingOtp(...args),
    updatePassword: (...args: unknown[]) => mockUpdatePassword(...args),
    authorizePhoneBinding: (...args: unknown[]) => mockAuthorizePhoneBinding(...args),
  }),
}));

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchImageLibraryAsync: (...args: unknown[]) => mockLaunchImageLibrary(...args),
}));

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback: () => void) => { const React = jest.requireActual('react'); React.useEffect(callback, [callback]); },
  useNavigation: () => ({ dispatch: jest.fn() }),
  usePreventRemove: jest.fn(),
}));

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ back: jest.fn(), canGoBack: () => true, push: mockRouterPush, replace: mockRouterReplace }),
}));

function withSafeArea(node: React.ReactNode) {
  return <SafeAreaProvider initialMetrics={{ frame: { height: 812, width: 375, x: 0, y: 0 }, insets: { bottom: 34, left: 0, right: 0, top: 47 } }}>{node}</SafeAreaProvider>;
}

describe('base flow parity screens', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockParams = { slug: '' };
    mockAuthSession = undefined;
    mockAccount = undefined;
    mockPasswordChangePurpose = undefined;
    mockSubmitFeedback.mockReset();
    mockLaunchImageLibrary.mockReset();
    mockUpdatePassword.mockReset();
    mockUpdatePassword.mockResolvedValue(undefined);
    mockSignOut.mockReset();
    mockSignOut.mockResolvedValue(undefined);
    mockRouterReplace.mockReset();
    mockRouterPush.mockReset();
    mockRequestPhoneBindingOtp.mockReset();
    mockAuthorizePhoneBinding.mockReset().mockResolvedValue('verified-current-account-grant');
    mockVerifyPhoneBindingOtp.mockReset().mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await cleanup();
    const unexpectedErrors = consoleErrorSpy.mock.calls.map((args) => args.map(String).join(' '));
    consoleErrorSpy.mockRestore();
    if (unexpectedErrors.length > 0) {
      throw new Error(`Unexpected console.error during base flow test:\n${unexpectedErrors.join('\n')}`);
    }
  });

  it('covers the account security and future-service boundary', async () => {
    mockParams = { slug: 'security' };
    const screen = await render(withSafeArea(<AccountScreen />));
    expect(screen.getByText('账号安全')).toBeTruthy();
    expect(screen.queryByText('正在同步')).toBeNull();
    expect(screen.getByText('Apple 登录')).toBeTruthy();
    expect(screen.getByText('设置登录密码')).toBeTruthy();
    expect(screen.getAllByText('未绑定').length).toBeGreaterThan(0);
    expect(screen.getByText('注销账号')).toBeTruthy();
  });

  it('lets a multi-identity user explicitly choose a phone fallback for account deletion', async () => {
    mockParams = { slug: 'delete-account' };
    mockAuthSession = {
      user: {
        hasPassword: false,
        id: 'apple-auth-1',
        providers: ['apple'],
        registrationPending: false,
      },
    };
    mockAccount = {
      accountId: 'account-multi',
      hasPassword: true,
      phone: '+8613800138000',
      phoneBound: true,
      providers: ['phone', 'apple'],
    };
    const screen = await render(withSafeArea(<AccountScreen />));

    expect(screen.getByText('Apple')).toBeTruthy();
    expect(screen.getByText('登录密码')).toBeTruthy();
    expect(screen.getByText('短信验证码')).toBeTruthy();
    await fireEvent.press(screen.getByText('登录密码'));
    expect(screen.getByLabelText('登录密码')).toBeTruthy();
    expect(screen.queryByText('提交时将由 Apple 弹窗再次验证你的身份。')).toBeNull();
  });

  it('requires SMS verification before an OTP-only account sets its first password', async () => {
    mockParams = { slug: 'security' };
    mockAuthSession = {
      user: {
        hasPassword: false,
        id: 'user-1',
        phone: '+8613800138000',
        registrationPending: false,
      },
    };
    mockAccount = { accountId: 'user-1', phone: '+8613800138000', phoneBound: true, providers: ['phone'] };
    const screen = await render(withSafeArea(<AccountScreen />));

    expect(screen.getByText('短信验证后设置，可使用手机号和密码登录')).toBeTruthy();
    await fireEvent.press(screen.getByText('设置登录密码'));

    expect(mockSignOut).not.toHaveBeenCalled();
    expect(mockRouterPush).toHaveBeenCalledWith('/account/password?mode=verify');
  });

  it('verifies the existing account before sending an OTP to a replacement number', async () => {
    mockParams = { slug: 'bind-phone' };
    mockAccount = { accountId: 'current-account', phone: '+8613800138000', hasPassword: true, phoneBound: true, providers: ['phone'] };
    mockRequestPhoneBindingOtp.mockResolvedValue({ phone: '+8613900139000' });
    const screen = await render(withSafeArea(<AccountScreen />));
    expect(screen.getByText(/原登录密码需重新设置/u)).toBeTruthy();
    await fireEvent.changeText(screen.getByPlaceholderText('请输入11位手机号'), '13900139000');
    await fireEvent.press(screen.getByText('获取验证码'));
    expect(mockRequestPhoneBindingOtp).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('登录密码'), 'currentpassword10');
    await fireEvent.press(screen.getByText('验证并继续'));
    expect(mockAuthorizePhoneBinding).toHaveBeenCalledWith(expect.objectContaining({ method: 'password', password: 'currentpassword10' }));
    expect(mockRequestPhoneBindingOtp).toHaveBeenCalledWith('13900139000', 'verified-current-account-grant');
    await fireEvent.changeText(screen.getByLabelText('短信验证码'), '123456');
    await fireEvent.press(screen.getByText('验证并完成绑定'));
    expect(mockVerifyPhoneBindingOtp).toHaveBeenCalledWith({ phone: '+8613900139000' }, '123456');
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(mockRouterReplace).toHaveBeenCalledWith('/account/security');
  });

  it('cancels replacement verification without sending an OTP or changing the original binding', async () => {
    mockParams = { slug: 'bind-phone' };
    mockAccount = { accountId: 'current-account', phone: '+8613800138000', hasPassword: true, phoneBound: true, providers: ['phone'] };
    const screen = await render(withSafeArea(<AccountScreen />));
    await fireEvent.changeText(screen.getByPlaceholderText('请输入11位手机号'), '13900139000');
    await fireEvent.press(screen.getByText('获取验证码'));
    await fireEvent.press(screen.getByText('取消'));
    expect(mockRequestPhoneBindingOtp).not.toHaveBeenCalled();
    expect(mockVerifyPhoneBindingOtp).not.toHaveBeenCalled();
    expect(mockRouterReplace).not.toHaveBeenCalled();
  });

  it('keeps an occupied phone neutral until its SMS code is verified', async () => {
    mockParams = { slug: 'bind-phone' };
    mockAuthSession = {
      user: { hasPassword: false, id: 'apple-auth-1', registrationPending: false },
    };
    mockAccount = { accountId: 'account-apple', phoneBound: false, providers: ['apple'] };
    mockRequestPhoneBindingOtp.mockResolvedValue({
      phone: '+8613800138000',
    });
    const screen = await render(withSafeArea(<AccountScreen />));

    await fireEvent.changeText(screen.getByPlaceholderText('请输入11位手机号'), '13800138000');
    await fireEvent.press(screen.getByText('获取验证码'));
    expect(screen.getByText('验证码已发送至 +86 138****8000')).toBeTruthy();
    expect(screen.getByText(/学习记录与权益保持不变/u)).toBeTruthy();
    expect(screen.queryByText(/已有账号|归并|合并/u)).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('短信验证码'), '123456');
    await fireEvent.press(screen.getByText('验证并完成绑定'));
    expect(mockVerifyPhoneBindingOtp).toHaveBeenCalledWith({ phone: '+8613800138000' }, '123456');
    expect(mockRouterReplace).toHaveBeenCalledWith('/account/security');
  });

  it('asks for fresh social verification without revealing phone occupancy', async () => {
    mockParams = { slug: 'bind-phone' };
    mockAuthSession = {
      user: { hasPassword: false, id: 'apple-auth-1', registrationPending: false },
    };
    mockAccount = { accountId: 'account-apple', phoneBound: false, providers: ['apple'] };
    mockRequestPhoneBindingOtp.mockRejectedValue(new Error('recent_social_auth_required'));
    const screen = await render(withSafeArea(<AccountScreen />));

    await fireEvent.changeText(screen.getByPlaceholderText('请输入11位手机号'), '13800138000');
    await fireEvent.press(screen.getByText('获取验证码'));

    expect(screen.getByText(/请先验证当前账号/u)).toBeTruthy();
    expect(screen.getByText('重新验证身份')).toBeTruthy();
    expect(screen.queryByText(/已有账号|归并/u)).toBeNull();
  });

  it('keeps the Apple account active on an occupied phone until the user explicitly signs out', async () => {
    mockParams = { slug: 'bind-phone' };
    mockAuthSession = {
      user: { hasPassword: false, id: 'apple-auth-1', registrationPending: false },
    };
    mockAccount = { accountId: 'account-apple', phoneBound: false, providers: ['apple'] };
    mockRequestPhoneBindingOtp.mockResolvedValue({ phone: '+8613800138000' });
    mockVerifyPhoneBindingOtp.mockRejectedValueOnce(new Error('phone_already_registered'));
    const screen = await render(withSafeArea(<AccountScreen />));

    await fireEvent.changeText(screen.getByPlaceholderText('请输入11位手机号'), '13800138000');
    await fireEvent.press(screen.getByText('获取验证码'));
    await fireEvent.changeText(screen.getByLabelText('短信验证码'), '123456');
    await fireEvent.press(screen.getByText('验证并完成绑定'));

    expect(screen.getByText('该手机号已有账号，请退出后使用手机号登录')).toBeTruthy();
    expect(screen.getByText('退出并使用手机号登录')).toBeTruthy();
    expect(mockSignOut).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('退出并使用手机号登录'));
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockRouterReplace).toHaveBeenCalledWith('/auth/login');
  });

  it('validates the first password before enabling save', async () => {
    mockParams = { slug: 'password', mode: 'recovery' };
    mockPasswordChangePurpose = 'recovery';
    const screen = await render(withSafeArea(<AccountScreen />));
    const submit = screen.getByTestId('password-submit');

    expect(screen.getByText('重置登录密码')).toBeTruthy();
    expect(screen.queryByText('当前密码')).toBeNull();
    expect(submit.props.accessibilityState?.disabled).toBe(true);

    await fireEvent.changeText(screen.getByPlaceholderText('请输入 8–32 位新密码'), '😀😀😀😀a1');
    await fireEvent.changeText(screen.getByPlaceholderText('请再次输入新密码'), '😀😀😀😀a1');
    await waitFor(() => expect(screen.getByText('密码长度需要为 8–32 位')).toBeTruthy());
    expect(screen.getByTestId('password-submit').props.accessibilityState?.disabled).toBe(true);

    await fireEvent.changeText(screen.getByPlaceholderText('请输入 8–32 位新密码'), 'abcdefghij');
    await fireEvent.changeText(screen.getByPlaceholderText('请再次输入新密码'), 'abcdefghij');
    await waitFor(() => expect(screen.getByText('密码必须同时包含字母和数字')).toBeTruthy());
    expect(screen.getByTestId('password-submit').props.accessibilityState?.disabled).toBe(true);

    await fireEvent.changeText(screen.getByPlaceholderText('请输入 8–32 位新密码'), 'flightdeck1');
    await fireEvent.changeText(screen.getByPlaceholderText('请再次输入新密码'), 'flightdeck2');
    await waitFor(() => expect(screen.getByText('两次输入的密码不一致')).toBeTruthy());

    await fireEvent.changeText(screen.getByPlaceholderText('请再次输入新密码'), 'flightdeck1');
    await waitFor(() => expect(screen.queryByText('两次输入的密码不一致')).toBeNull());
    expect(screen.getByTestId('password-submit').props.accessibilityState?.disabled).toBe(false);

    for (const password of ['FlightA1', `${'a'.repeat(31)}1`]) {
      await fireEvent.changeText(screen.getByPlaceholderText('请输入 8–32 位新密码'), password);
      await fireEvent.changeText(screen.getByPlaceholderText('请再次输入新密码'), password);
      expect(screen.getByTestId('password-submit').props.accessibilityState?.disabled).toBe(false);
    }
    const tooLong = `${'a'.repeat(32)}1`;
    await fireEvent.changeText(screen.getByPlaceholderText('请输入 8–32 位新密码'), tooLong);
    await fireEvent.changeText(screen.getByPlaceholderText('请再次输入新密码'), tooLong);
    expect(screen.getByText('密码长度需要为 8–32 位')).toBeTruthy();
    expect(screen.getByTestId('password-submit').props.accessibilityState?.disabled).toBe(true);
  });

  it('rejects a setup or recovery URL without a fresh in-memory SMS authorization', async () => {
    mockParams = { slug: 'password', mode: 'recovery' };
    mockAuthSession = {
      user: {
        hasPassword: true,
        id: 'user-1',
        phone: '+8613800138000',
        registrationPending: false,
      },
    };

    await render(withSafeArea(<AccountScreen />));

    await waitFor(() => expect(mockRouterReplace).toHaveBeenCalledWith('/account/security'));
  });

  it('keeps the current login while opening SMS recovery for a forgotten password', async () => {
    mockParams = { slug: 'password' };
    mockAuthSession = {
      user: {
        hasPassword: true,
        id: 'user-1',
        phone: '+8613800138000',
        registrationPending: false,
      },
    };
    mockAccount = { accountId: 'user-1', phone: '+8613800138000', hasPassword: true, phoneBound: true, providers: ['phone'] };
    const screen = await render(withSafeArea(<AccountScreen />));

    expect(screen.getByText('当前密码')).toBeTruthy();
    await fireEvent.press(screen.getByText('忘记当前密码？使用短信验证'));

    expect(screen.getByText('验证当前账号手机号')).toBeTruthy();
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(mockRouterReplace).not.toHaveBeenCalled();
  });

  it('saves an optional first password and returns to security without an acknowledgment page', async () => {
    mockParams = { slug: 'password', mode: 'verify' };
    mockPasswordChangePurpose = 'recovery';
    mockAccount = { accountId: 'user-1', phone: '+8613800138000', phoneBound: true, providers: ['phone'] };
    const screen = await render(withSafeArea(<AccountScreen />));

    expect(screen.queryByText('注册完成')).toBeNull();
    expect(screen.queryByText('当前密码')).toBeNull();

    await fireEvent.changeText(screen.getByPlaceholderText('请输入 8–32 位新密码'), 'flightdeck1');
    await fireEvent.changeText(screen.getByPlaceholderText('请再次输入新密码'), 'flightdeck1');
    await fireEvent.press(screen.getByTestId('password-submit'));

    await waitFor(() => expect(mockUpdatePassword).toHaveBeenCalledWith('flightdeck1', undefined));
    expect(mockRouterReplace).toHaveBeenCalledWith('/account/security');
    expect(screen.queryByText('我知道了')).toBeNull();
  });

  it('routes the removed information hub to the help center', async () => {
    mockParams = { slug: 'hub' };
    const screen = await render(withSafeArea(<InfoScreen />));
    expect(screen.queryByText('信息与帮助')).toBeNull();
    expect(screen.getByText('帮助中心')).toBeTruthy();
    expect(screen.queryByText('法律条款')).toBeNull();
  });

  it('shows the shared task timestamp version in settings', async () => {
    mockParams = { slug: 'settings' };
    const screen = await render(withSafeArea(<AccountScreen />));
    expect(screen.getByText(`听你五个 · ${APP_DISPLAY_VERSION}`)).toBeTruthy();
  });

  it('keeps only data controls and policies in Native privacy settings', async () => {
    mockParams = { slug: 'privacy' };
    mockAccount = { accountId: 'user-1', phone: '+8613800138000', phoneBound: true, providers: ['phone'] };
    const screen = await render(withSafeArea(<AccountScreen />));

    expect(screen.getByText('隐私与数据')).toBeTruthy();
    expect(screen.queryByText('导出账号和学习数据')).toBeNull();
    expect(screen.getByText('删除全部 AI 结果')).toBeTruthy();
    expect(screen.getByText('清除全部学习数据')).toBeTruthy();
    expect(screen.getByText('第三方服务清单')).toBeTruthy();
    expect(screen.queryByText('注销整个账号')).toBeNull();
    expect(screen.queryByText('账号安全')).toBeNull();
    expect(screen.getByText('privacy@yunqihangke.com')).toBeTruthy();
  });

  it('limits the formal in-app agreement to the iOS and Android App', async () => {
    mockParams = { slug: 'agreement' };
    const screen = await render(withSafeArea(<InfoScreen />));

    expect(screen.getByText(/iOS、Android 正式 App 及其相关服务/u)).toBeTruthy();
    expect(screen.queryByText(/iOS、Android、Web 产品/u)).toBeNull();
  });

  it('discloses current Native data controls and AI use without a removed export feature', async () => {
    mockParams = { slug: 'privacy' };
    const screen = await render(withSafeArea(<InfoScreen />));

    expect(screen.queryByText(/导出账号和学习数据/u)).toBeNull();
    expect(screen.getByText(/删除学习记录/u)).toBeTruthy();
    expect(screen.getByText(/清除学习数据仍保留账号、会员和订单/u)).toBeTruthy();
    expect(screen.getAllByText(/DeepSeek-V4-Flash-0731/u).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Beijing-DeepseekChat-202404280016/u).length).toBeGreaterThan(0);
    expect(screen.getByText(/即时结果区和学习记录中持续显示“AI 辅助生成”/u)).toBeTruthy();
  });

  it('routes the removed About page to help without update, rating or sharing buttons', async () => {
    mockParams = { slug: 'about' };
    const screen = await render(withSafeArea(<InfoScreen />));
    expect(screen.getByText('帮助中心')).toBeTruthy();
    expect(screen.queryByText('检查更新')).toBeNull();
    expect(screen.queryByText('给我们评分')).toBeNull();
    expect(screen.queryByText('分享给朋友')).toBeNull();
  });

  it('submits a profile feedback form and shows only the ticket number', async () => {
    mockParams = { slug: 'feedback', source: 'profile', sourceRoute: '/profile' };
    mockSubmitFeedback.mockResolvedValue({
      ticketNumber: 'FB-260723-A8K4Q2',
      status: 'received',
      createdAt: '2026-07-23T05:00:00.000Z',
    });
    const screen = await render(withSafeArea(<InfoScreen />));

    expect(screen.getByText('功能建议')).toBeTruthy();
    await fireEvent.changeText(screen.getByPlaceholderText('请详细描述你的建议或遇到的问题。'), '希望优化题库检索体验');
    await waitFor(() => expect(screen.getByTestId('feedback-submit').props.accessibilityState?.disabled).toBe(false));
    await fireEvent.press(screen.getByTestId('feedback-submit'));

    await waitFor(() => expect(mockSubmitFeedback).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText('FB-260723-A8K4Q2')).toBeTruthy());
    expect(mockSubmitFeedback).toHaveBeenCalledWith(expect.objectContaining({
      category: 'feature_suggestion',
      description: '希望优化题库检索体验',
      source: 'profile',
    }));
  });

  it('discloses and submits only an explicitly requested recording diagnostic', async () => {
    mockParams = {
      slug: 'feedback',
      source: 'profile',
      sourceRoute: '/question-bank/study',
      feature: 'recording',
      correlationId: 'R-FLOW-01',
    };
    mockSubmitFeedback.mockResolvedValue({
      ticketNumber: 'FB-DIAGNOSTIC',
      status: 'received',
      createdAt: '2026-08-14T00:00:00.000Z',
    });
    const screen = await render(withSafeArea(<InfoScreen />));

    expect(screen.getByText('将附带本次故障的脱敏诊断')).toBeTruthy();
    expect(screen.getByDisplayValue('录音功能出现异常，请协助排查。')).toBeTruthy();
    expect(screen.getByText(/不包含录音、回答、文件地址、Token 或账号信息/u)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('feedback-submit'));

    await waitFor(() => expect(mockSubmitFeedback).toHaveBeenCalledWith(expect.objectContaining({
      category: 'other',
      description: '录音功能出现异常，请协助排查。',
      diagnosticFeature: 'recording',
      diagnosticCorrelationId: 'R-FLOW-01',
    })));
  });

  it('defaults study feedback to correction and keeps image selection removable', async () => {
    mockParams = {
      slug: 'feedback',
      source: 'study',
      sourceRoute: '/question-bank/listening/study/a/topic-a',
      bankId: 'listening',
      categoryId: 'a',
      topicId: 'topic-a',
      cardId: 'card-a',
    };
    mockLaunchImageLibrary.mockResolvedValue({
      canceled: false,
      assets: [{
        uri: 'file:///feedback.png',
        fileName: 'feedback.png',
        fileSize: 1024,
        mimeType: 'image/png',
        width: 100,
        height: 100,
      }],
    });
    const screen = await render(withSafeArea(<InfoScreen />));

    expect(screen.getByText('已关联当前题目')).toBeTruthy();
    expect(screen.getByText('内容纠错')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('添加反馈图片'));
    await waitFor(() => expect(screen.getByLabelText('反馈图片 1')).toBeTruthy());
    await fireEvent.press(screen.getByLabelText('移除反馈图片 1'));
    await waitFor(() => expect(screen.queryByLabelText('反馈图片 1')).toBeNull());
  });
});
