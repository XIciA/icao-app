import { createWechatNativeAuthBoundary, type NativeWechatAuthModule } from '../wechat-native-auth';

describe('WeChat native authorization boundary', () => {
  beforeEach(() => {
    jest.useRealTimers();
  });

  it('returns the audited native capability status', () => {
    const nativeModule = nativeModuleDouble();
    expect(createWechatNativeAuthBoundary(nativeModule).getStatus()).toEqual({ configured: true, installed: true, supported: true });
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
    getStatus: jest.fn(() => ({ configured: true, installed: true, supported: true })),
  };
}
