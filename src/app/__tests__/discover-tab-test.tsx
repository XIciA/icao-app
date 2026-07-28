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
    GraduationCap: Icon,
    LineChart: Icon,
    Radio: Icon,
  };
});
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));

describe('<DiscoverTab />', () => {
  it('exposes every phase-four content entry', async () => {
    const screen = await render(<DiscoverTab />);
    ['单词学习', '随身听', 'AI 模考', '学习报告', 'OPI 热点', '资源分享', '体系课程'].forEach((label) => {
      expect(screen.getByText(label)).toBeTruthy();
    });
  });
});
