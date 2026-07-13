import { render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LoginScreen } from '@/components/auth/login-screen';

jest.mock('lucide-react-native', () => {
  const { View } = jest.requireActual('react-native');
  const Icon = (props: object) => <View {...props} />;
  return { ArrowLeft: Icon, Check: Icon, Eye: Icon, EyeOff: Icon, KeyRound: Icon, Mail: Icon, Plane: Icon, Smartphone: Icon };
});

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ slug: 'login' }),
  useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn() }),
}));

describe('<LoginScreen />', () => {
  it('renders the controlled email and password login entries', async () => {
    const screen = await render(
      <SafeAreaProvider initialMetrics={{ frame: { height: 812, width: 375, x: 0, y: 0 }, insets: { bottom: 34, left: 0, right: 0, top: 47 } }}>
        <LoginScreen />
      </SafeAreaProvider>,
    );

    expect(screen.getByText('欢迎回来')).toBeTruthy();
    expect(screen.getByText('登录以继续你的 ICAO 备考进度')).toBeTruthy();
    expect(screen.getByText('当前受控内测仅开放邮箱密码登录。')).toBeTruthy();
    expect(screen.getByText('登录状态安全保存在本机')).toBeTruthy();
    expect(screen.getByText('忘记密码')).toBeTruthy();
    expect(screen.getByText('立即注册')).toBeTruthy();
  });
});
