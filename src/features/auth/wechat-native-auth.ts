import { requireOptionalNativeModule } from 'expo-modules-core';

export type NativeWechatAuthResult = { code: string; state: string };
export type NativeWechatAuthStatus = {
  appId?: string;
  configured: boolean;
  installed: boolean;
  supported: boolean;
};

export type NativeWechatAuthModule = {
  authorize(state: string): Promise<NativeWechatAuthResult>;
  cancelAuthorization(state: string): void;
  getStatus(): NativeWechatAuthStatus;
};

const AUTHORIZATION_TIMEOUT_MS = 125_000;

export function createWechatNativeAuthBoundary(
  nativeModule: NativeWechatAuthModule | null,
  authorizationTimeoutMs = AUTHORIZATION_TIMEOUT_MS,
) {
  return {
    getStatus(): NativeWechatAuthStatus {
      return nativeModule?.getStatus() ?? { appId: undefined, configured: false, installed: false, supported: false };
    },
    async authorize(state: string) {
      if (!nativeModule) throw new Error('wechat_auth_unavailable');
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          nativeModule.authorize(state),
          new Promise<never>((_, reject) => {
            timeout = setTimeout(() => {
              nativeModule.cancelAuthorization(state);
              reject(new Error('wechat_auth_timeout'));
            }, authorizationTimeoutMs);
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
    },
  };
}

const nativeBoundary = createWechatNativeAuthBoundary(
  requireOptionalNativeModule<NativeWechatAuthModule>('IcaoWechatAuth'),
);

export function getWechatNativeStatus() {
  return nativeBoundary.getStatus();
}

export function authorizeWithWechatNative(state: string) {
  return nativeBoundary.authorize(state);
}

/**
 * Bind a server-created challenge to the App ID compiled into this exact binary. This prevents a
 * valid challenge from a differently configured API deployment from being handed to OpenSDK.
 */
export function assertWechatChallengeMatchesNativeApp(
  challengeAppId: string | undefined,
  status: NativeWechatAuthStatus = getWechatNativeStatus(),
) {
  const nativeAppId = status.appId?.trim();
  if (!challengeAppId || !nativeAppId || challengeAppId !== nativeAppId) {
    throw new Error('wechat_auth_configuration_mismatch');
  }
}
