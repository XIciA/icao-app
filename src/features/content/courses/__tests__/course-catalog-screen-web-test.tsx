import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native';

import { CourseCatalogScreen } from '../CourseCatalogScreen.web';

const mockRouterBack = jest.fn();
type MockWebLayout = {
  contentWidth: number;
  height: number;
  isDesktop: boolean;
  isMobile: boolean;
  isTablet: boolean;
  mode: 'mobile' | 'tablet' | 'desktop';
  scale: number;
  fontScale: number;
  width: number;
};

let mockWebLayout: MockWebLayout = {
  contentWidth: 1280,
  height: 900,
  isDesktop: true,
  isMobile: false,
  isTablet: false,
  mode: 'desktop',
  scale: 1,
  fontScale: 1,
  width: 1440,
};

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

jest.mock('@/components/platform/web-layout', () => ({
  useWebLayout: () => mockWebLayout,
}));

function renderScreen() {
  return render(
    <SafeAreaProvider initialMetrics={{ frame: { height: 900, width: 1440, x: 0, y: 0 }, insets: { bottom: 0, left: 0, right: 0, top: 0 } }}>
      <CourseCatalogScreen />
    </SafeAreaProvider>,
  );
}

describe('<CourseCatalogScreen /> on web', () => {
  beforeEach(() => {
    mockRouterBack.mockClear();
    mockWebLayout = {
      contentWidth: 1280,
      height: 900,
      isDesktop: true,
      isMobile: false,
      isTablet: false,
      mode: 'desktop',
      scale: 1,
      fontScale: 1,
      width: 1440,
    };
  });

  it('renders the live promotion hierarchy and desktop grids', async () => {
    const screen = await renderScreen();

    expect(screen.getByText('飞猪 ICAO 体系课程')).toBeTruthy();
    expect(screen.getByText('ICAO 4 初考基础班')).toBeTruthy();
    expect(screen.getByText('ICAO 4 初考包过班')).toBeTruthy();
    expect(screen.getByText('ICAO 4 初考冲刺班')).toBeTruthy();
    expect(screen.getByText('ICAO 4 初考通过率 95%+，复考通过率 92%+，ICAO 5 通过率 90%+。')).toBeTruthy();
    expect(screen.queryByText('暑期特价小班基础班')).toBeNull();
    expect(screen.queryByText('7 大课程')).toBeNull();

    expect(StyleSheet.flatten(screen.getByTestId('course-promo-hero-grid-desktop').props.style)).toMatchObject({
      flexDirection: 'row',
      flexWrap: 'wrap',
    });
    expect(StyleSheet.flatten(screen.getByTestId('course-promo-advantages-grid-desktop').props.style)).toMatchObject({
      flexDirection: 'row',
      flexWrap: 'wrap',
    });
    expect(StyleSheet.flatten(screen.getByTestId('course-promo-plan-grid-desktop').props.style)).toMatchObject({
      flexDirection: 'row',
      flexWrap: 'wrap',
    });
  });

  it('switches all live course views and exposes the full details', async () => {
    const screen = await renderScreen();

    await fireEvent.press(screen.getByLabelText('选择复考课程'));
    expect(screen.getByText('ICAO 4 复考基础班')).toBeTruthy();
    expect(screen.getByLabelText('选择复考课程').props.accessibilityState).toEqual({ selected: true });

    await fireEvent.press(screen.getByLabelText('选择预习课程'));
    expect(screen.getAllByText('ICAO 4 预习课程')).toHaveLength(2);

    await fireEvent.press(screen.getByLabelText('选择专项培训'));
    expect(screen.getByText('OPI 专项深测')).toBeTruthy();
    expect(screen.getByText('全板块深测')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('ICAO 4 课程：初考、复考、预习与专项培训'));
    await fireEvent.press(screen.getByLabelText('查看ICAO 4 初考包过班详情'));
    expect(screen.getByLabelText('课程详情：ICAO 4 初考包过班')).toBeTruthy();
    expect(screen.getByText('课程大纲')).toBeTruthy();
    expect(screen.getByText('包过班特殊权限')).toBeTruthy();
    expect(screen.getByText('负责到底')).toBeTruthy();
  });

  it('includes the full story and keeps both consultation ids selectable', async () => {
    const screen = await renderScreen();

    expect(screen.getByText('15736231388').props.selectable).toBe(true);
    expect(screen.getByText('17367473982').props.selectable).toBe(true);
    await fireEvent.press(screen.getByLabelText('打开我们有话说'));
    expect(screen.getByLabelText('我们有话说')).toBeTruthy();
    expect(screen.getByText(/目前已帮助超过 100 名学员顺利通过 ICAO 考试/)).toBeTruthy();
    expect(screen.getByText(/我们自会顶峰相见/)).toBeTruthy();
  });

  it('stacks the marketing grids on a narrow viewport', async () => {
    mockWebLayout = {
      contentWidth: 390,
      height: 844,
      isDesktop: false,
      isMobile: true,
      isTablet: false,
      mode: 'mobile',
      scale: 1,
      fontScale: 1,
      width: 390,
    };
    const screen = await renderScreen();

    expect(StyleSheet.flatten(screen.getByTestId('course-promo-hero-grid-mobile').props.style).flexDirection).toBeUndefined();
    expect(StyleSheet.flatten(screen.getByTestId('course-promo-advantages-grid-mobile').props.style).flexDirection).toBeUndefined();
    expect(StyleSheet.flatten(screen.getByTestId('course-promo-plan-grid-mobile').props.style).flexDirection).toBeUndefined();
  });
});
