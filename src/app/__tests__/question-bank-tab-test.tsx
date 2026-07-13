import { fireEvent, render } from '@testing-library/react-native';

import QuestionBankTab from '../(tabs)';

jest.mock('lucide-react-native', () => {
  const { View } = jest.requireActual('react-native');
  const Icon = (props: object) => <View {...props} />;

  return {
    BookOpenText: Icon,
    Check: Icon,
    ChevronRight: Icon,
    ChevronsUpDown: Icon,
    GraduationCap: Icon,
    Headphones: Icon,
    MessageSquareQuote: Icon,
    Mic2: Icon,
    RadioTower: Icon,
    UserRound: Icon,
  };
});

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}));

describe('<QuestionBankTab />', () => {
  it('renders the navigation-shell content', async () => {
    const screen = await render(<QuestionBankTab />);

    expect(screen.getByText('稳步进阶，冲刺目标等级')).toBeTruthy();
    expect(screen.getByText('听力')).toBeTruthy();
    expect(screen.getByText('900 句')).toBeTruthy();
    expect(screen.getByText('陆空通话')).toBeTruthy();
    expect(screen.getByText('OPI')).toBeTruthy();
    expect(screen.queryByText('可练习')).toBeNull();
    expect(screen.queryByText('故事复诵')).toBeNull();

    await fireEvent.press(screen.getByLabelText('选择备考课程'));
    await fireEvent.press(screen.getByLabelText('选择ICAO 5 首考'));

    expect(screen.getByText('故事复诵')).toBeTruthy();
  });
});
