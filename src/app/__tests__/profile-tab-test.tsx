import { render } from '@testing-library/react-native';

import ProfileTab from '../(tabs)/profile';

jest.mock('lucide-react-native', () => {
  const { View } = jest.requireActual('react-native');
  const Icon = (props: object) => <View {...props} />;
  return {
    Bookmark: Icon,
    ChevronRight: Icon,
    History: Icon,
    MessageCircle: Icon,
    Settings: Icon,
    UserRound: Icon,
  };
});
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/features/question-bank/platform/learning-store', () => ({
  sqliteLearningStore: { getRecords: jest.fn().mockResolvedValue([]) },
}));

describe('<ProfileTab />', () => {
  it('matches the empty profile baseline content', async () => {
    const screen = await render(<ProfileTab />);

    expect(screen.getByText('飞行学员')).toBeTruthy();
    expect(screen.getAllByText('0')).toHaveLength(2);
    expect(screen.getByText('© 2026 飞猪 ICAO · 咨询微信 15736231388')).toBeTruthy();
  });
});
