import { fireEvent, render } from '@testing-library/react-native';

import QuestionBankTab from '../(tabs)';

const mockPush = jest.fn();

jest.mock('lucide-react-native', () => {
  const { View } = jest.requireActual('react-native');
  const Icon = (props: object) => <View {...props} />;

  return {
    BookOpenText: Icon,
    ChevronRight: Icon,
    Headphones: Icon,
    MessageSquareQuote: Icon,
    Mic2: Icon,
    RadioTower: Icon,
    UserRound: Icon,
  };
});

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}));

describe('<QuestionBankTab />', () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  it('shows all five question banks without course selection or filtering', async () => {
    const screen = await render(<QuestionBankTab />);

    expect(screen.getByText('航空英语题库')).toBeTruthy();
    expect(screen.getByText('五类题库集中呈现，按自己的节奏开始练习。')).toBeTruthy();
    expect(screen.getByText('听力')).toBeTruthy();
    expect(screen.getByText('4 题组 / 1223 题')).toBeTruthy();
    expect(screen.getByText('900 句')).toBeTruthy();
    expect(screen.getByText('陆空通话')).toBeTruthy();
    expect(screen.getByText('186 场景 / 3216 卡')).toBeTruthy();
    expect(screen.getByText('OPI')).toBeTruthy();
    expect(screen.getByText('144 话题 / 1090 卡')).toBeTruthy();
    expect(screen.getByText('故事复诵')).toBeTruthy();
    expect(screen.getByText('4 子库 / 436 卡')).toBeTruthy();
    expect(screen.queryByText('可练习')).toBeNull();
    expect(screen.queryByLabelText('选择备考课程')).toBeNull();
    expect(screen.queryByText('ICAO 4 复考')).toBeNull();
    expect(screen.queryByText('ICAO 4 首考')).toBeNull();
    expect(screen.queryByText('ICAO 5 首考')).toBeNull();
    expect(screen.queryByText('跟着课程计划，逐个攻克核心模块。')).toBeNull();
  });

  it('keeps profile and question-bank navigation available', async () => {
    const screen = await render(<QuestionBankTab />);

    await fireEvent.press(screen.getByLabelText('打开个人资料'));
    expect(mockPush).toHaveBeenCalledWith('/account/profile');

    await fireEvent.press(screen.getByLabelText('故事复诵，打开'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/question-bank/[bankId]',
      params: { bankId: 'storytelling' },
    });
  });
});
