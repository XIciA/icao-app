import { render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthScreen } from '@/features/auth/AuthScreen';

jest.mock('lucide-react-native', () => {
  const { View } = jest.requireActual('react-native');
  const Icon = (props: object) => <View {...props} />;
  return { ArrowLeft: Icon, CheckCircle2: Icon, KeyRound: Icon, Plane: Icon, ShieldCheck: Icon, X: Icon };
});

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ slug: 'login' }),
  useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn() }),
}));

describe('<AuthScreen />', () => {
  it('renders the login demo boundary and all recovery entries', async () => {
    const screen = await render(
      <SafeAreaProvider initialMetrics={{ frame: { height: 812, width: 375, x: 0, y: 0 }, insets: { bottom: 34, left: 0, right: 0, top: 47 } }}>
        <AuthScreen />
      </SafeAreaProvider>,
    );

    expect(screen.getByText('当前为认证交互演示，不发送验证码、不创建真实账户。')).toBeTruthy();
    expect(screen.getByText('登录演示账户')).toBeTruthy();
    expect(screen.getByText('手机验证码登录')).toBeTruthy();
    expect(screen.getByText('忘记密码')).toBeTruthy();
    expect(screen.getByText('注册账户')).toBeTruthy();
  });
});
