import { Platform } from 'react-native';
import {
  assertWechatChallengeMatchesNativeApp,
  createWechatNativeAuthBoundary,
  type NativeWechatAuthModule,
} from '../wechat-native-auth';

describe('WeChat native authorization boundary', () => {
  beforeEach(() => {
    jest.useRealTimers();
  });

  it('returns the audited native capability status', () => {
    const nativeModule = nativeModuleDouble();
    expect(createWechatNativeAuthBoundary(nativeModule).getStatus()).toEqual({
      appId: 'wx12345678',
      configured: true,
      installed: true,
      supported: true,
    });
  });

  it('rechecks installation before authorization and never opens an absent client', async () => {
    const nativeModule = nativeModuleDouble();
    const boundary = createWechatNativeAuthBoundary(nativeModule);
    expect(boundary.getStatus().installed).toBe(true);
    nativeModule.getStatus.mockReturnValue({ appId: 'wx12345678', configured: true, installed: false, supported: true });
    await expect(boundary.authorize('state')).rejects.toThrow('wechat_not_installed');
    expect(nativeModule.authorize).not.toHaveBeenCalled();
  });

  it.each([
    [{ configured: false, installed: true, supported: true }, 'wechat_auth_configuration_pending'],
    [{ configured: true, installed: true, supported: false }, 'wechat_auth_unavailable'],
  ])('keeps installed-client capability errors distinct from missing installation', async (status, error) => {
    const nativeModule = nativeModuleDouble();
    nativeModule.getStatus.mockReturnValue(status);
    await expect(createWechatNativeAuthBoundary(nativeModule).authorize('state')).rejects.toThrow(error);
    expect(nativeModule.authorize).not.toHaveBeenCalled();
  });

  it('does not launch on an installation query failure', async () => {
    const nativeModule = nativeModuleDouble();
    nativeModule.getStatus.mockImplementation(() => { throw new Error('native query failed'); });
    await expect(createWechatNativeAuthBoundary(nativeModule).authorize('state')).rejects.toThrow('wechat_status_unavailable');
    expect(nativeModule.authorize).not.toHaveBeenCalled();
  });

  it('keeps the pre-existing Android authorization contract unchanged', async () => {
    const originalOS = Platform.OS;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    try {
      const nativeModule = nativeModuleDouble();
      nativeModule.getStatus.mockReturnValue({ configured: true, installed: false, supported: true });
      nativeModule.authorize.mockResolvedValue({ code: 'android-code', state: 'android-state' });
      await expect(createWechatNativeAuthBoundary(nativeModule).authorize('android-state')).resolves.toEqual({
        code: 'android-code', state: 'android-state',
      });
    } finally {
      Object.defineProperty(Platform, 'OS', { configurable: true, value: originalOS });
    }
  });

  it('rejects a production challenge from an App ID other than the one compiled into the app', () => {
    const status = nativeModuleDouble().getStatus();
    expect(() => assertWechatChallengeMatchesNativeApp('wx-different-app', status)).toThrow(
      'wechat_auth_configuration_mismatch',
    );
    expect(() => assertWechatChallengeMatchesNativeApp(undefined, status)).toThrow(
      'wechat_auth_configuration_mismatch',
    );
    expect(() => assertWechatChallengeMatchesNativeApp('wx12345678', status)).not.toThrow();
  });

  it('cancels only the timed-out request generation and a later request still succeeds', async () => {
    jest.useFakeTimers();
    const nativeModule = nativeModuleDouble();
    const authorize = nativeModule.authorize as jest.MockedFunction<NativeWechatAuthModule['authorize']>;
    authorize
      .mockImplementationOnce(() => new Promise(() => undefined))
      .mockResolvedValueOnce({ code: 'fresh-code', state: 'generation-b' });
    const boundary = createWechatNativeAuthBoundary(nativeModule, 1_000);

    const generationA = boundary.authorize('generation-a');
    const rejection = expect(generationA).rejects.toThrow('wechat_auth_timeout');
    await jest.advanceTimersByTimeAsync(1_000);
    await rejection;
    expect(nativeModule.cancelAuthorization).toHaveBeenCalledTimes(1);
    expect(nativeModule.cancelAuthorization).toHaveBeenCalledWith('generation-a');

    await expect(boundary.authorize('generation-b')).resolves.toEqual({
      code: 'fresh-code',
      state: 'generation-b',
    });
    expect(nativeModule.cancelAuthorization).not.toHaveBeenCalledWith('generation-b');
  });

  it('normalizes an exact native cancellation without retrying or changing state', async () => {
    const nativeModule = nativeModuleDouble();
    (nativeModule.authorize as jest.MockedFunction<NativeWechatAuthModule['authorize']>)
      .mockRejectedValueOnce({ code: 'social_auth_cancelled' });
    await expect(createWechatNativeAuthBoundary(nativeModule).authorize('generation-c')).rejects.toThrow('social_auth_cancelled');
    expect(nativeModule.cancelAuthorization).not.toHaveBeenCalled();
  });
});

function nativeModuleDouble(): jest.Mocked<NativeWechatAuthModule> {
  return {
    authorize: jest.fn(),
    cancelAuthorization: jest.fn(),
    getStatus: jest.fn(() => ({
      appId: 'wx12345678',
      configured: true,
      installed: true,
      supported: true,
    })),
  };
}
