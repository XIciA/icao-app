import { requireOptionalNativeModule } from 'expo-modules-core';

type NativeWechatAuthResult = { code: string; state: string };
type NativeWechatAuthStatus = {
  configured: boolean;
  installed: boolean;
  supported: boolean;
};

type NativeWechatAuthModule = {
  authorize(state: string): Promise<NativeWechatAuthResult>;
  getStatus(): NativeWechatAuthStatus;
};

const nativeModule = requireOptionalNativeModule<NativeWechatAuthModule>('IcaoWechatAuth');

export function getWechatNativeStatus(): NativeWechatAuthStatus {
  return nativeModule?.getStatus() ?? { configured: false, installed: false, supported: false };
}

export async function authorizeWithWechatNative(state: string) {
  if (!nativeModule) throw new Error('wechat_auth_unavailable');
  try {
    return await nativeModule.authorize(state);
  } catch (error) {
    const code = (error as { code?: string }).code ?? (error as Error).message;
    if (/cancel/iu.test(code)) throw new Error('social_auth_cancelled');
    if (/not_installed/iu.test(code)) throw new Error('wechat_not_installed');
    if (/configuration/iu.test(code)) throw new Error('wechat_auth_configuration_pending');
    throw new Error('wechat_auth_failed');
  }
}
