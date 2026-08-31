import { requireOptionalNativeModule } from 'expo-modules-core';

export type WechatNativeAuthorization = { code: string; state: string };
export type WechatNativeStatus = { configured: boolean; installed: boolean; supported: boolean };

export type IcaoWechatAuthNativeModule = {
  authorize(state: string): Promise<WechatNativeAuthorization>;
  getStatus(): WechatNativeStatus;
};

export const IcaoWechatAuth = requireOptionalNativeModule<IcaoWechatAuthNativeModule>('IcaoWechatAuth');
