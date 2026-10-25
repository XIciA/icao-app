jest.mock('@/features/native-commercial-testflight/CommerceRuntimeProvider', () => ({useCommerceRuntime:()=>({phase:'ready', entitlement:{membership:{active:false}}})}));
import { fireEvent, render } from '@testing-library/react-native';

import DiscoverTab from '../(tabs)/discover';

jest.mock('lucide-react-native', () => {
  const { View } = jest.requireActual('react-native');
  const Icon = (props: object) => <View {...props} />;
  return {
    BookMarked: Icon,
    Bot: Icon,
    ChevronRight: Icon,
    FileText: Icon,
    Flame: Icon,
    FolderOpen: Icon,
    GraduationCap: Icon,
    Radio: Icon,
  };
});
const mockPush = jest.fn();
const mockRememberPendingPath = jest.fn();
let mockCanAccessApp = true;
jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ canAccessApp: mockCanAccessApp, rememberPendingPath: mockRememberPendingPath }) }));
jest.mock('expo-router', () => ({ usePathname: () => '/discover', useRouter: () => ({ push: mockPush }) }));

describe('<DiscoverTab />', () => {
  beforeEach(() => { jest.clearAllMocks(); mockCanAccessApp = true; });
  it('lets guests open free discovery features without login', async () => {
    mockCanAccessApp = false;
    const screen = await render(<DiscoverTab />);
    expect(mockPush).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText('打开单词学习'));
    expect(mockRememberPendingPath).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith('/content/vocab');
  });
  it('lets a guest open the course promotion without login', async () => {
    mockCanAccessApp = false;
    const screen = await render(<DiscoverTab />);
    await fireEvent.press(screen.getByLabelText('打开体系课程'));
    expect(mockPush).toHaveBeenCalledWith('/content/courses');
    expect(mockRememberPendingPath).not.toHaveBeenCalled();
  });
  it('exposes the course catalog below learning resources', async () => {
    const screen = await render(<DiscoverTab />);
    ['单词学习', '随身听', '模拟练习', 'OPI 热点', '资源分享', '体系课程'].forEach((label) => {
      expect(screen.getByText(label)).toBeTruthy();
    });
    expect(screen.queryByText('AI 模考')).toBeNull();
    expect(screen.queryByText('学习报告')).toBeNull();
    expect(screen.getByText('飞猪 ICAO · 从入门到冲刺')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('打开体系课程'));
    expect(mockPush).toHaveBeenCalledWith('/content/courses');
  });
});

it('sends a guest to membership only when choosing mock practice', async () => {
  mockCanAccessApp = false;
  const screen = await render(<DiscoverTab />);
  await fireEvent.press(screen.getByLabelText('打开模拟练习'));
  expect(mockPush).toHaveBeenCalledWith('/account/membership?next=%2Fcontent%2Fmock-exam');
});
