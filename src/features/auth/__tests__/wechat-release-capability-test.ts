import {
  isWechatLoginReleaseEnabled,
  WECHAT_LOGIN_ENABLED,
} from '../wechat-release-capability';

describe('WeChat release capability', () => {
  it('keeps the current release entry hidden while Open Platform approval is pending', () => {
    expect(WECHAT_LOGIN_ENABLED).toBe(false);
  });

  it('enables the entry only with a complete approved mobile application configuration', () => {
    expect(isWechatLoginReleaseEnabled({
      appId: 'wx1234567890abcdef',
      schemaVersion: 1,
      status: 'approved',
      universalLink: 'https://api.readyoufife.com/wechat-auth/',
    })).toBe(true);
    expect(isWechatLoginReleaseEnabled({
      appId: null,
      schemaVersion: 1,
      status: 'WAITING_HUMAN',
      universalLink: null,
    })).toBe(false);
    expect(isWechatLoginReleaseEnabled({
      appId: 'wx1234567890abcdef',
      schemaVersion: 1,
      status: 'approved',
      universalLink: 'http://api.readyoufife.com/wechat-auth/',
    })).toBe(false);
    expect(isWechatLoginReleaseEnabled({
      appId: 'wx1234567890abcdef',
      schemaVersion: 1,
      status: 'approved',
      universalLink: 'https://user:password@api.readyoufife.com/wechat-auth/',
    })).toBe(false);
    expect(isWechatLoginReleaseEnabled({
      appId: 'wxshort',
      schemaVersion: 1,
      status: 'approved',
      universalLink: 'https://api.readyoufife.com/wechat-auth/',
    })).toBe(false);
  });
});
