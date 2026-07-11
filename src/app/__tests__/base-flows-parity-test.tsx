import { render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AccountScreen } from '@/features/account/AccountScreen';
import { InfoScreen } from '@/features/info/InfoScreen';
import { SystemStateScreen } from '@/features/states/SystemStateScreen';

let mockSlug = '';

jest.mock('lucide-react-native', () => {
  const { View } = jest.requireActual('react-native');
  const Icon = (props: object) => <View {...props} />;
  return new Proxy({}, { get: () => Icon });
});

jest.mock('expo-audio', () => ({
  getRecordingPermissionsAsync: jest.fn(async () => ({ granted: false })),
  requestRecordingPermissionsAsync: jest.fn(async () => ({ granted: false })),
}));

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ slug: mockSlug }),
  useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn() }),
}));

function withSafeArea(node: React.ReactNode) {
  return <SafeAreaProvider initialMetrics={{ frame: { height: 812, width: 375, x: 0, y: 0 }, insets: { bottom: 34, left: 0, right: 0, top: 47 } }}>{node}</SafeAreaProvider>;
}

describe('base flow parity screens', () => {
  it('covers the account security and future-service boundary', async () => {
    mockSlug = 'security';
    const screen = await render(withSafeArea(<AccountScreen />));
    expect(screen.getByText('账号安全')).toBeTruthy();
    expect(screen.getByText('手机号')).toBeTruthy();
    expect(screen.getByText('注销账号')).toBeTruthy();
  });

  it('renders the information hub instead of skipping directly to help', async () => {
    mockSlug = 'hub';
    const screen = await render(withSafeArea(<InfoScreen />));
    expect(screen.getByText('信息与帮助')).toBeTruthy();
    expect(screen.getByText('帮助与反馈')).toBeTruthy();
    expect(screen.getByText('法律条款')).toBeTruthy();
  });

  it('lists permission and failure states from the state hub', async () => {
    mockSlug = 'gallery';
    const screen = await render(withSafeArea(<SystemStateScreen />));
    expect(screen.getByText('麦克风权限说明')).toBeTruthy();
    expect(screen.getByText('麦克风被拒绝')).toBeTruthy();
    expect(screen.getByText('全局加载页')).toBeTruthy();
  });
});
