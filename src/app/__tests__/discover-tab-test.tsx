import { render } from '@testing-library/react-native';

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
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));

describe('<DiscoverTab />', () => {
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
