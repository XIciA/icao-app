import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LoginScreen } from '../login-screen.web';

const mockRequestPhoneOtp = jest.fn(async () => undefined);
const mockVerifyPhoneOtp = jest.fn(async () => undefined);
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: jest.fn(),
    canGoBack: () => false,
    push: jest.fn(),
    replace: mockReplace,
  }),
}));

jest.mock('@/features/auth/AuthProvider.web', () => ({
  useAuth: () => ({
    consumePendingPath: () => undefined,
    enterUiAcceptanceMode: jest.fn(),
    mode: 'phone-otp',
    requestPhoneOtp: mockRequestPhoneOtp,
    signIn: jest.fn(),
    uiAcceptanceAvailable: false,
    verifyPhoneOtp: mockVerifyPhoneOtp,
  }),
}));

describe('<LoginScreen /> on EdgeOne', () => {
  beforeEach(() => {
    mockRequestPhoneOtp.mockClear();
    mockVerifyPhoneOtp.mockClear();
    mockReplace.mockClear();
  });

  it('uses phone OTP and enters the same authenticated app routes', async () => {
    const screen = await render(
      <SafeAreaProvider initialMetrics={{ frame: { height: 812, width: 375, x: 0, y: 0 }, insets: { bottom: 34, left: 0, right: 0, top: 47 } }}>
        <LoginScreen />
      </SafeAreaProvider>,
    );

    await fireEvent.changeText(screen.getByPlaceholderText('请输入手机号'), '13800138000');
    await fireEvent.press(screen.getByText('获取短信验证码'));
    await waitFor(() => expect(mockRequestPhoneOtp).toHaveBeenCalledWith('13800138000'));

    await fireEvent.changeText(screen.getByLabelText('短信验证码'), '123456');
    await fireEvent.press(screen.getByText('登录 / 自动注册'));
    await waitFor(() => expect(mockVerifyPhoneOtp).toHaveBeenCalledWith('13800138000', '123456'));
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)');
    expect(screen.getByText(/iOS、Android 自动同步/u)).toBeTruthy();
  });
});
