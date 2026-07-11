import { render } from '@testing-library/react-native';

import QuestionBankTab from '../(tabs)';

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
  };
});

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

describe('<QuestionBankTab />', () => {
  it('renders the navigation-shell content', async () => {
    const screen = await render(<QuestionBankTab />);

    expect(screen.getByText('稳步进阶，冲刺目标等级')).toBeTruthy();
    expect(screen.getByText('听力')).toBeTruthy();
    expect(screen.getByText('900 句')).toBeTruthy();
    expect(screen.getByText('陆空通话')).toBeTruthy();
    expect(screen.getByText('OPI')).toBeTruthy();
    expect(screen.getByText('故事复诵')).toBeTruthy();
  });
});
