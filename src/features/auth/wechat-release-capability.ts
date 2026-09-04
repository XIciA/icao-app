import releaseConfiguration from '../../../config/release/wechat-login.json';
import { resolveWechatLoginReleaseCapability } from '../../../config/release/wechat-login-contract.cjs';

type WechatReleaseConfiguration = Readonly<{
  appId?: unknown;
  schemaVersion?: unknown;
  status?: unknown;
  universalLink?: unknown;
}>;

export function isWechatLoginReleaseEnabled(configuration: WechatReleaseConfiguration): boolean {
  try {
    return resolveWechatLoginReleaseCapability(configuration).enabled;
  } catch {
    return false;
  }
}

export const WECHAT_LOGIN_ENABLED = isWechatLoginReleaseEnabled(releaseConfiguration);
