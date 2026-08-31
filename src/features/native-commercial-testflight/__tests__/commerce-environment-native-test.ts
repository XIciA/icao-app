import { getIcaoDistributionEnvironment } from '@icao/distribution-environment';
import { Platform } from 'react-native';
import Storage from '@/platform/storage';

import {
  activateNativeCommerceEnvironment,
  clearNativeCommerceEnvironment,
  confirmNativeCommerceEnvironment,
  detectNativeDistributionEnvironment,
  getNativeCommerceEnvironment,
  getNativeCommerceEnvironmentState,
} from '../commerce-environment.native';

const ACCOUNT_ID = '00000000-0000-4000-8000-000000000001';
const OTHER_ACCOUNT_ID = '00000000-0000-4000-8000-000000000002';
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

  it('does not let a delayed activation from an old account replace the current environment', async () => {
    const originalGetItem = jest.mocked(Storage.getItem).getMockImplementation();
    expect(originalGetItem).toBeDefined();
    let releaseOldRead: ((value: string | null) => void) | undefined;
    const getItem = jest.mocked(Storage.getItem)
      .mockImplementationOnce(() => new Promise((resolve) => {
        releaseOldRead = resolve;
      }))
      .mockImplementation((key) => originalGetItem?.(key) ?? Promise.resolve(null));
    getItem.mockClear();
    try {
      const oldActivation = activateNativeCommerceEnvironment(ACCOUNT_ID, 'sandbox');
      const currentActivation = activateNativeCommerceEnvironment(OTHER_ACCOUNT_ID, 'production');

      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(releaseOldRead).toBeDefined();
      releaseOldRead?.('sandbox');
      await expect(oldActivation).resolves.toBe('sandbox');
      await expect(currentActivation).resolves.toBe('production');

      expect(getNativeCommerceEnvironment()).toBe('production');
      expect(getItem).toHaveBeenCalledTimes(2);
    } finally {
      if (originalGetItem) getItem.mockImplementation(originalGetItem);
      getItem.mockClear();
    }
  });

  it('does not let a hung storage read for one account block a different account', async () => {
    const originalGetItem = jest.mocked(Storage.getItem).getMockImplementation();
    expect(originalGetItem).toBeDefined();
    let releaseHungRead!: (value: string | null) => void;
    const getItem = jest.mocked(Storage.getItem)
      .mockImplementationOnce(() => new Promise((resolve) => { releaseHungRead = resolve; }))
      .mockImplementation((key) => originalGetItem?.(key) ?? Promise.resolve(null));
    getItem.mockClear();
    try {
      const oldActivation = activateNativeCommerceEnvironment(ACCOUNT_ID, 'sandbox');
      await expect(activateNativeCommerceEnvironment(OTHER_ACCOUNT_ID, 'production'))
        .resolves.toBe('production');
      expect(getNativeCommerceEnvironment()).toBe('production');
      releaseHungRead('sandbox');
      await expect(oldActivation).resolves.toBe('sandbox');
    } finally {
      if (originalGetItem) getItem.mockImplementation(originalGetItem);
      getItem.mockClear();
    }
  });

  it('publishes the new owner with a Production-safe view before its Sandbox read settles', async () => {
    mockedDistributionEnvironment.mockReturnValue('sandbox');
    await Storage.setItem(`icao.commerce.environment.v1.${ACCOUNT_ID}`, 'sandbox');
    await activateNativeCommerceEnvironment(ACCOUNT_ID, 'sandbox');
    expect(getNativeCommerceEnvironment()).toBe('sandbox');

    let releaseRead!: (value: string | null) => void;
    const originalGetItem = jest.mocked(Storage.getItem).getMockImplementation();
    jest.mocked(Storage.getItem).mockImplementationOnce(
      () => new Promise((resolve) => { releaseRead = resolve; }),
    );
    try {
      const activation = activateNativeCommerceEnvironment(OTHER_ACCOUNT_ID, 'sandbox');

      expect(getNativeCommerceEnvironment()).toBe('production');
      expect(getNativeCommerceEnvironmentState()).toMatchObject({
        accountId: OTHER_ACCOUNT_ID,
        environment: 'production',
        status: 'activating',
      });

      await new Promise((resolve) => setTimeout(resolve, 0));
      releaseRead('sandbox');
      await expect(activation).resolves.toBe('sandbox');
      expect(getNativeCommerceEnvironment()).toBe('sandbox');
    } finally {
      if (originalGetItem) jest.mocked(Storage.getItem).mockImplementation(originalGetItem);
    }
  });

  it('keeps the new owner fail-closed when activation storage rejects', async () => {
    mockedDistributionEnvironment.mockReturnValue('sandbox');
    await Storage.setItem(`icao.commerce.environment.v1.${ACCOUNT_ID}`, 'sandbox');
    await activateNativeCommerceEnvironment(ACCOUNT_ID, 'sandbox');
    const originalGetItem = jest.mocked(Storage.getItem).getMockImplementation();
    jest.mocked(Storage.getItem).mockRejectedValueOnce(new Error('storage unavailable'));
    try {
      const activation = activateNativeCommerceEnvironment(OTHER_ACCOUNT_ID, 'sandbox');
      expect(getNativeCommerceEnvironment()).toBe('production');
      await expect(activation).rejects.toThrow('storage unavailable');
      expect(getNativeCommerceEnvironmentState()).toMatchObject({
        accountId: OTHER_ACCOUNT_ID,
        environment: 'production',
        status: 'inactive',
      });
    } finally {
      if (originalGetItem) jest.mocked(Storage.getItem).mockImplementation(originalGetItem);
    }
  });

  it('keeps an aborted activation inactive and ignores its late Sandbox read', async () => {
    mockedDistributionEnvironment.mockReturnValue('sandbox');
    let releaseRead!: (value: string | null) => void;
    const originalGetItem = jest.mocked(Storage.getItem).getMockImplementation();
    jest.mocked(Storage.getItem).mockImplementationOnce(
      () => new Promise((resolve) => { releaseRead = resolve; }),
    );
    try {
      const abortController = new AbortController();
      const activation = activateNativeCommerceEnvironment(
        OTHER_ACCOUNT_ID,
        'sandbox',
        { signal: abortController.signal },
      );
      abortController.abort();
      expect(getNativeCommerceEnvironmentState()).toMatchObject({
        accountId: OTHER_ACCOUNT_ID,
        environment: 'production',
        status: 'inactive',
      });

      await new Promise((resolve) => setTimeout(resolve, 0));
      releaseRead('sandbox');
      await expect(activation).resolves.toBe('sandbox');
      expect(getNativeCommerceEnvironment()).toBe('production');
    } finally {
      if (originalGetItem) jest.mocked(Storage.getItem).mockImplementation(originalGetItem);
    }
  });

  it('serializes a delayed confirmation so an old generation cannot overwrite a new one', async () => {
    mockedDistributionEnvironment.mockReturnValue('sandbox');
    await activateNativeCommerceEnvironment(ACCOUNT_ID, 'sandbox');
    const originalSetItem = jest.mocked(Storage.setItem).getMockImplementation();
    expect(originalSetItem).toBeDefined();
    let releaseOldWrite: (() => void) | undefined;
    const setItem = jest.mocked(Storage.setItem)
      .mockImplementationOnce(() => new Promise<void>((resolve) => {
        releaseOldWrite = resolve;
      }))
      .mockImplementation((key, value) => originalSetItem?.(key, value) ?? Promise.resolve());
    setItem.mockClear();
    try {
      const oldConfirmation = confirmNativeCommerceEnvironment(ACCOUNT_ID, 'sandbox');
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(releaseOldWrite).toBeDefined();
      const currentActivation = activateNativeCommerceEnvironment(ACCOUNT_ID, 'production');
      releaseOldWrite?.();
      await expect(oldConfirmation).resolves.toBe(false);
      await expect(currentActivation).resolves.toBe('production');

      expect(getNativeCommerceEnvironment()).toBe('production');
      await expect(Storage.getItem(`icao.commerce.environment.v1.${ACCOUNT_ID}`))
        .resolves.not.toBe('sandbox');
    } finally {
      if (originalSetItem) setItem.mockImplementation(originalSetItem);
      setItem.mockClear();
    }
  });

  it('rolls back a delayed confirmation when its operation is aborted', async () => {
    mockedDistributionEnvironment.mockReturnValue('sandbox');
    const storageKey = `icao.commerce.environment.v1.${ACCOUNT_ID}`;
    await Storage.setItem(storageKey, 'production');
    await activateNativeCommerceEnvironment(ACCOUNT_ID, 'sandbox');
    const originalSetItem = jest.mocked(Storage.setItem).getMockImplementation();
    expect(originalSetItem).toBeDefined();
    let releaseWrite!: () => void;
    const setItem = jest.mocked(Storage.setItem)
      .mockImplementationOnce(() => new Promise<void>((resolve) => { releaseWrite = resolve; }))
      .mockImplementation((key, value) => originalSetItem?.(key, value) ?? Promise.resolve());
    setItem.mockClear();
    try {
      const abortController = new AbortController();
      const confirmation = confirmNativeCommerceEnvironment(
        ACCOUNT_ID,
        'sandbox',
        { signal: abortController.signal },
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
      abortController.abort();
      releaseWrite();

      await expect(confirmation).resolves.toBe(false);
      await expect(Storage.getItem(storageKey)).resolves.toBe('production');
      expect(getNativeCommerceEnvironment()).toBe('production');
    } finally {
      if (originalSetItem) setItem.mockImplementation(originalSetItem);
      setItem.mockClear();
    }
  });
});
