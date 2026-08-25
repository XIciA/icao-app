import { getIcaoDistributionEnvironment } from '@icao/distribution-environment';
import { Platform } from 'react-native';
import Storage from '@/platform/storage';

import {
  activateNativeCommerceEnvironment,
  clearNativeCommerceEnvironment,
  confirmNativeCommerceEnvironment,
  detectNativeDistributionEnvironment,
  getNativeCommerceEnvironment,
} from '../commerce-environment.native';

const ACCOUNT_ID = '00000000-0000-4000-8000-000000000001';
const mockedDistributionEnvironment = jest.mocked(getIcaoDistributionEnvironment);
const originalPlatform = Platform.OS;

describe('Native commerce environment isolation', () => {
  beforeEach(async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
    mockedDistributionEnvironment.mockReturnValue('production');
    await clearNativeCommerceEnvironment();
  });

  afterAll(() => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform });
  });

  it('detects TestFlight from the native sandbox receipt signal', () => {
    mockedDistributionEnvironment.mockReturnValue('sandbox');
    expect(detectNativeDistributionEnvironment()).toBe('sandbox');
  });

  it('never resolves the Apple-only distribution module on Android', () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    mockedDistributionEnvironment.mockClear();

    expect(detectNativeDistributionEnvironment()).toBe('production');
    expect(mockedDistributionEnvironment).not.toHaveBeenCalled();
  });

  it('restores Sandbox only inside a TestFlight distribution', async () => {
    await Storage.setItem(`icao.commerce.environment.v1.${ACCOUNT_ID}`, 'sandbox');
    await expect(activateNativeCommerceEnvironment(ACCOUNT_ID, 'sandbox')).resolves.toBe('sandbox');
    expect(getNativeCommerceEnvironment()).toBe('sandbox');

    await expect(activateNativeCommerceEnvironment(ACCOUNT_ID, 'production')).resolves.toBe('production');
    expect(getNativeCommerceEnvironment()).toBe('production');
    await expect(Storage.getItem(`icao.commerce.environment.v1.${ACCOUNT_ID}`)).resolves.toBe('production');
  });

  it('rejects a transaction environment that does not match the installed distribution', async () => {
    await activateNativeCommerceEnvironment(ACCOUNT_ID, 'production');
    await expect(confirmNativeCommerceEnvironment(ACCOUNT_ID, 'sandbox')).resolves.toBe(false);
    expect(getNativeCommerceEnvironment()).toBe('production');
  });

  it('detects the Sandbox receipt created by a first TestFlight purchase before confirmation', async () => {
    await activateNativeCommerceEnvironment(ACCOUNT_ID, 'production');
    mockedDistributionEnvironment.mockReturnValue('sandbox');

    await expect(confirmNativeCommerceEnvironment(ACCOUNT_ID, 'sandbox')).resolves.toBe(true);
    expect(getNativeCommerceEnvironment()).toBe('sandbox');
  });
});
