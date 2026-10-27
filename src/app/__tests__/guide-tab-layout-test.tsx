import { render } from '@testing-library/react-native';
import TabLayout from '../(tabs)/_layout';

let mockCurrent: string | null = null;
let mockFormal = true;
const mockNavigator = jest.fn((_props: unknown) => null);
jest.mock('@react-navigation/material-top-tabs', () => ({ createMaterialTopTabNavigator: () => ({ Navigator: mockNavigator }) }));
jest.mock('expo-router', () => ({ withLayoutContext: () => Object.assign((props: unknown) => mockNavigator(props), { Screen: () => null }) }));
jest.mock('@/features/usage-guide/GuideBindings', () => ({ useGuide: () => ({ current: mockCurrent }) }));
jest.mock('@/config/web-runtime', () => ({ isFormalAppSurface: () => mockFormal }));
jest.mock('@/components/navigation/FloatingTabBar', () => ({ FloatingTabBar: () => null }));

it.each([
  [true, 'setup', false],
  [true, 'study', false],
  [true, null, true],
  [false, 'setup', true],
  [false, null, true],
])('formal=%s guide=%s keeps animation=%s', async (formal, current, animationEnabled) => {
  mockFormal = formal;
  mockCurrent = current;
  mockNavigator.mockClear();
  await render(<TabLayout />);
  expect(mockNavigator).toHaveBeenCalledWith(expect.objectContaining({
    initialRouteName: 'index',
    backBehavior: 'history',
    screenOptions: expect.objectContaining({ animationEnabled, swipeEnabled: true }),
  }));
});
