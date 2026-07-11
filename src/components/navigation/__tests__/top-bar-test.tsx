import { fireEvent, render } from '@testing-library/react-native';

import { TopBar } from '../TopBar';

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn();

jest.mock('expo-router', () => ({ useRouter: () => ({ back: mockBack, canGoBack: mockCanGoBack, replace: mockReplace }) }));
jest.mock('lucide-react-native', () => {
  const { View } = jest.requireActual('react-native');
  const Icon = (props: object) => <View {...props} />;
  return { ArrowLeft: Icon, X: Icon };
});

describe('<TopBar />', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns to the tab root when a direct deep link has no history stack', async () => {
    mockCanGoBack.mockReturnValue(false);
    const screen = await render(<TopBar title="听力" />);

    fireEvent.press(screen.getByLabelText('返回'));

    expect(mockBack).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)');
  });

  it('uses the existing navigator history when it is available', async () => {
    mockCanGoBack.mockReturnValue(true);
    const screen = await render(<TopBar title="听力" />);

    fireEvent.press(screen.getByLabelText('返回'));

    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});
