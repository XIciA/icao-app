import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { CourseCatalogScreen } from '../CourseCatalogScreen';
import { webCoursePromoCatalog } from '../course-promo-catalog.web-data';

const mockRouterBack = jest.fn();
let mockWidth = 390;

jest.mock('lucide-react-native', () => {
  const { View } = jest.requireActual('react-native');
  const Icon = (props: object) => <View {...props} />;
  return new Proxy({}, { get: () => Icon });
});
jest.mock('@/components/platform/web-layout', () => ({
  useWebLayout: () => ({ isDesktop: false, isMobile: true, mode: 'mobile', contentWidth: mockWidth }),
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockRouterBack, canGoBack: () => true, push: jest.fn(), replace: jest.fn() }),
}));

function renderScreen() {
  return render(
    <SafeAreaProvider initialMetrics={{ frame: { height: 844, width: mockWidth, x: 0, y: 0 }, insets: { bottom: 34, left: 0, right: 0, top: 47 } }}>
      <CourseCatalogScreen />
    </SafeAreaProvider>,
  );
}

describe('<CourseCatalogScreen /> in the App', () => {
  beforeEach(() => { mockRouterBack.mockClear(); mockWidth = 390; });

  it.each([320, 390])('renders the current content at width %s without the removed hero shortcuts', async (width) => {
    mockWidth = width;
    const screen = await renderScreen();
    expect(screen.getByText('飞猪 ICAO 体系课程')).toBeTruthy();
    expect(screen.getByText('超高性价比')).toBeTruthy();
    expect(screen.getByText('ICAO 4 初考基础班')).toBeTruthy();
    expect(screen.getByText('4500')).toBeTruthy();
    expect(screen.getByText('6999')).toBeTruthy();
    expect(screen.queryByText('暑期特价小班基础班')).toBeNull();
    expect(screen.queryByText('7 大课程')).toBeNull();
    expect(screen.queryByLabelText('ICAO 4 课程：初考、复考、预习与专项培训')).toBeNull();
    expect(screen.getByText('15736231388').props.selectable).toBe(true);
    expect(screen.getByText('17367473982').props.selectable).toBe(true);
  });

  it('switches all five course views in place', async () => {
    const screen = await renderScreen();
    await fireEvent.press(screen.getByLabelText('选择复考课程'));
    expect(screen.getByText('ICAO 4 复考基础班')).toBeTruthy();
    expect(screen.getByText('5999')).toBeTruthy();
    expect(screen.getByLabelText('选择复考课程').props.accessibilityState).toEqual({ selected: true });
    await fireEvent.press(screen.getByLabelText('选择预习课程'));
    expect(screen.getAllByText('ICAO 4 预习课程')).toHaveLength(2);
    await fireEvent.press(screen.getByLabelText('选择专项培训'));
    expect(screen.getByText('全板块深测')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('选择ICAO 5 课程'));
    expect(screen.getByText('ICAO 5 包过班')).toBeTruthy();
    expect(screen.getByText('8999')).toBeTruthy();
    expect(screen.queryByLabelText('选择初考课程')).toBeNull();
    await fireEvent.press(screen.getByLabelText('选择ICAO 4 课程'));
    expect(screen.getByText('ICAO 4 初考基础班')).toBeTruthy();
  });

  it('shows complete details and privileges, preserving the category after closing', async () => {
    const screen = await renderScreen();
    await fireEvent.press(screen.getByLabelText('选择复考课程'));
    await fireEvent.press(screen.getByLabelText('查看ICAO 4 复考包过班详情'));
    expect(screen.getByLabelText('课程详情：ICAO 4 复考包过班')).toBeTruthy();
    expect(screen.getByText('标准课程内容安排')).toBeTruthy();
    expect(screen.getByText('课程大纲')).toBeTruthy();
    expect(screen.getByText('包过班特殊权限')).toBeTruthy();
    expect(screen.getByText('负责到底')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('关闭课程详情'));
    await waitFor(() => expect(screen.queryByText('包过班特殊权限')).toBeNull());
    expect(screen.getByLabelText('选择复考课程').props.accessibilityState).toEqual({ selected: true });
  });

  it('supports introduction-only and privileges-only plans without an empty outline', async () => {
    const screen = await renderScreen();
    await fireEvent.press(screen.getByLabelText('选择预习课程'));
    await fireEvent.press(screen.getByLabelText('查看ICAO 4 预习课程详情'));
    expect(screen.queryByText('课程大纲')).toBeNull();
    await fireEvent.press(screen.getByLabelText('关闭课程详情'));
    await waitFor(() => expect(screen.queryByLabelText('课程详情：ICAO 4 预习课程')).toBeNull());
    await fireEvent.press(screen.getByLabelText('选择ICAO 5 课程'));
    await fireEvent.press(screen.getByLabelText('查看ICAO 5 包过班详情'));
    expect(screen.queryByText('课程大纲')).toBeNull();
    expect(screen.getByText('负责到底')).toBeTruthy();
    await fireEvent.press(screen.getByText('咨询该课程'));
    await waitFor(() => expect(screen.queryByText('包过班特殊权限')).toBeNull());
    expect(screen.getByText('咨询请添加微信：')).toBeTruthy();
  });

  it('shows the entire original story and closes back to the promotion', async () => {
    const screen = await renderScreen();
    await fireEvent.press(screen.getByLabelText('打开我们有话说'));
    for (const paragraph of webCoursePromoCatalog.story.paragraphs) expect(screen.getByText(paragraph)).toBeTruthy();
    expect(screen.getByText(webCoursePromoCatalog.story.quote)).toBeTruthy();
    await fireEvent.press(screen.getByText('我知道了'));
    await waitFor(() => expect(screen.queryByLabelText('我们有话说')).toBeNull());
    expect(screen.getByLabelText('打开我们有话说')).toBeTruthy();
  });

  it('keeps the existing native back navigation', async () => {
    const screen = await renderScreen();
    await fireEvent.press(screen.getByLabelText('返回'));
    expect(mockRouterBack).toHaveBeenCalledTimes(1);
  });
});
