/* eslint-disable import/first */
import { render } from '@testing-library/react-native';
import { Platform } from 'react-native';

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }));
jest.mock('../MembershipPage', () => ({
  MembershipPage: () => {
    const { Text } = jest.requireActual('react-native');
    return <Text>iOS membership page</Text>;
  },
}));

import { MembershipRoutePage } from '../MembershipRoutePage.native';

describe('<MembershipRoutePage />', () => {
  const originalPlatform = Platform.OS;

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform });
  });

  it('gates a direct Android route with release-ready platform copy', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    const screen = await render(<MembershipRoutePage />);

    expect(screen.getByText('Android 暂不提供应用内购买')).toBeTruthy();
    expect(screen.queryByText(/iPhone|TestFlight/u)).toBeNull();
    expect(screen.queryByText('iOS membership page')).toBeNull();
  });

  it('keeps the StoreKit membership page on iOS', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
    const screen = await render(<MembershipRoutePage />);

    expect(screen.getByText('iOS membership page')).toBeTruthy();
  });
});
