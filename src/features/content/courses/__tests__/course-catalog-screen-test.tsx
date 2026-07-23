import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { CourseCatalogScreen } from '../CourseCatalogScreen';

const mockRouterBack = jest.fn();

jest.mock('lucide-react-native', () => {
  const { View } = jest.requireActual('react-native');
  const Icon = (props: object) => <View {...props} />;
  return new Proxy({}, { get: () => Icon });
});

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockRouterBack,
    canGoBack: () => true,
    push: jest.fn(),
    replace: jest.fn(),
  }),
}));

function renderScreen() {
  return render(
    <SafeAreaProvider initialMetrics={{ frame: { height: 812, width: 375, x: 0, y: 0 }, insets: { bottom: 34, left: 0, right: 0, top: 47 } }}>
      <CourseCatalogScreen />
    </SafeAreaProvider>,
  );
}

describe('<CourseCatalogScreen />', () => {
  beforeEach(() => {
    mockRouterBack.mockClear();
  });

  it('renders the verified promotion content and defaults to the summer category', async () => {
    const screen = await renderScreen();

    expect(screen.getByText('飞猪 ICAO 体系课程')).toBeTruthy();
    expect(screen.getByText('7 大课程')).toBeTruthy();
    expect(screen.getByText('超高性价比')).toBeTruthy();
    expect(screen.getByText('暑期特价小班基础班')).toBeTruthy();
    expect(screen.queryByText('ICAO 4 基础班')).toBeNull();
    expect(screen.queryByText('课程咨询演示')).toBeNull();

    expect(screen.getByText('15736231388').props.selectable).toBe(true);
    expect(screen.getByText('17367473982').props.selectable).toBe(true);
  });

  it('switches all course categories without changing the route', async () => {
    const screen = await renderScreen();

    await fireEvent.press(screen.getByLabelText('选择ICAO 4 备考'));
    expect(screen.getByText('ICAO 4 基础班')).toBeTruthy();
    expect(screen.getByLabelText('选择ICAO 4 备考').props.accessibilityState).toEqual({ selected: true });

    await fireEvent.press(screen.getByLabelText('选择ICAO 5 进阶'));
    expect(screen.getByText('ICAO 5 冲刺班')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('选择专项深测'));
    expect(screen.getByText('全板块深测')).toBeTruthy();
  });

  it('shows full outlines and guaranteed privileges in a native bottom sheet', async () => {
    const screen = await renderScreen();

    await fireEvent.press(screen.getByLabelText('选择ICAO 4 备考'));
    await fireEvent.press(screen.getByLabelText('查看ICAO 4 包过班详情'));

    expect(screen.getByLabelText('课程详情：ICAO 4 包过班')).toBeTruthy();
    expect(screen.getByText('标准课程内容安排')).toBeTruthy();
    expect(screen.getByText('课程大纲')).toBeTruthy();
    expect(screen.getByText('包过班特殊权限')).toBeTruthy();
    expect(screen.getByText('负责到底')).toBeTruthy();

    await fireEvent.press(screen.getByText('咨询该课程'));
    expect(screen.queryByText('包过班特殊权限')).toBeNull();
    expect(screen.getByText('咨询请添加微信：')).toBeTruthy();
  });

  it('keeps the existing native back navigation', async () => {
    const screen = await renderScreen();

    await fireEvent.press(screen.getByLabelText('返回'));

    expect(mockRouterBack).toHaveBeenCalledTimes(1);
  });
});
