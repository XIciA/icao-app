import { fireEvent, render } from '@testing-library/react-native';
import { UserGuideScreen } from '../UserGuideScreen';
import { GUIDE_ENTRIES } from '../guide-flows';
const mockStart = jest.fn();
jest.mock('../GuideBindings', () => ({ useGuide: () => ({ start: mockStart, ready: true }) }));
jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn(), canGoBack: () => true }) }));
beforeEach(() => mockStart.mockClear());
it('exposes a visible restart path for every real feature, including the catalog export entrance', async () => {
  const screen = await render(<UserGuideScreen />);
  expect(screen.queryByText('选择一项功能，重新查看教程。')).toBeNull();
  for (const {id,title} of GUIDE_ENTRIES) {
    await fireEvent.press(screen.getByRole('button', { name: title }));
    expect(mockStart).toHaveBeenLastCalledWith(id,true);
  }
});
