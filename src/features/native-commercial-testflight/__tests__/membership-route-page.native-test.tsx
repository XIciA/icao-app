/* eslint-disable import/first */
import { render } from '@testing-library/react-native';
import { Platform } from 'react-native';

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }));
jest.mock('../MembershipPage', () => ({
  MembershipPage: () => {
    const { Text } = jest.requireActual('react-native');
    return <Text>Native membership page</Text>;
  },
}));

import { MembershipRoutePage } from '../MembershipRoutePage.native';

describe('<MembershipRoutePage />', () => {
  const originalPlatform = Platform.OS;

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform });
  });

  it('opens the shared membership page from the Android account route', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    const screen = await render(<MembershipRoutePage />);

    expect(screen.getByText('Native membership page')).toBeTruthy();
    expect(screen.queryByText('Android 暂不提供应用内购买')).toBeNull();
  });

  it('keeps the StoreKit membership page on iOS', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
    const screen = await render(<MembershipRoutePage />);

    expect(screen.getByText('Native membership page')).toBeTruthy();
  });
});
