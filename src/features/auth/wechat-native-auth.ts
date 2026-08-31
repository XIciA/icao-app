import { requireOptionalNativeModule } from 'expo-modules-core';

type NativeWechatAuthResult = { code: string; state: string };
type NativeWechatAuthStatus = {
  configured: boolean;
  installed: boolean;
  supported: boolean;
};

type NativeWechatAuthModule = {
  authorize(state: string): Promise<NativeWechatAuthResult>;
  cancelAuthorization(): void;
  getStatus(): NativeWechatAuthStatus;
};

const nativeModule = requireOptionalNativeModule<NativeWechatAuthModule>('IcaoWechatAuth');
const AUTHORIZATION_TIMEOUT_MS = 125_000;

export function getWechatNativeStatus(): NativeWechatAuthStatus {
  return nativeModule?.getStatus() ?? { configured: false, installed: false, supported: false };
}

export async function authorizeWithWechatNative(state: string) {
  if (!nativeModule) throw new Error('wechat_auth_unavailable');
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      nativeModule.authorize(state),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          nativeModule.cancelAuthorization();
          reject(new Error('wechat_auth_timeout'));
        }, AUTHORIZATION_TIMEOUT_MS);
      }),
    ]);
  } catch (error) {
    const code = (error as { code?: string }).code ?? (error as Error).message;
    if (/cancel/iu.test(code)) throw new Error('social_auth_cancelled');
    if (/not_installed/iu.test(code)) throw new Error('wechat_not_installed');
    if (/configuration/iu.test(code)) throw new Error('wechat_auth_configuration_pending');
    if (/timeout/iu.test(code)) throw new Error('wechat_auth_timeout');
    throw new Error('wechat_auth_failed');
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
