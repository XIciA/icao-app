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
  it('lets guests browse feature descriptions and requests login only when opening one', async () => {
    mockCanAccessApp = false;
    const screen = await render(<DiscoverTab />);
    expect(mockPush).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText('打开单词学习'));
    expect(mockRememberPendingPath).toHaveBeenCalledWith('/content/vocab');
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/auth/[slug]', params: { slug: 'login', next: '/content/vocab', returnTo: '/discover', reason: '登录后查看会员功能' } });
  });
  it('exposes launch learning entries without the course catalog', async () => {
    const screen = await render(<DiscoverTab />);
    ['单词学习', '随身听', '模拟练习', 'OPI 热点', '资源分享'].forEach((label) => {
      expect(screen.getByText(label)).toBeTruthy();
    });
    expect(screen.queryByText('AI 模考')).toBeNull();
    expect(screen.queryByText('学习报告')).toBeNull();
    expect(screen.queryByText('体系课程')).toBeNull();
    expect(screen.queryByText('从入门到冲刺的系统化课程体系')).toBeNull();
  });
});
