import { redirectNativeAuthIntent } from '../native-auth-intent';

describe('Native WeChat callback routing', () => {
  it.each([
    'readyoufife://wechat-auth/wx0123456789abcdef/oauth?code=fixture&state=fixture',
    'readyoufife:///wechat-auth/wx0123456789abcdef/oauth?errCode=-2',
    '/wechat-auth/wx0123456789abcdef/oauth?state=fixture',
    'https://api.readyoufife.com/wechat-auth/wx0123456789abcdef/oauth?code=fixture',
    'wx0123456789abcdef://oauth?code=fixture&state=fixture',
  ])('keeps an in-progress native authorization mounted for %s', (path) => {
    expect(redirectNativeAuthIntent({ path, initial: false })).toBeNull();
    expect(redirectNativeAuthIntent({ path, initial: true })).toBe('/');
  });

  it.each([
    'readyoufife://account/security',
    '/account/bind-phone',
    'https://other.example/wechat-auth/wx0123456789abcdef/oauth',
    'https://api.readyoufife.com/resources/article',
    'readyoufife://wechat-auth/unknown-route',
    'readyoufife://account/wechat-auth/wx0123456789abcdef/oauth',
    'https://api.readyoufife.com/wechat-auth/help',
    'http://[invalid',
  ])('preserves unrelated routing for %s', (path) => {
    expect(redirectNativeAuthIntent({ path, initial: false })).toBe(path);
    expect(redirectNativeAuthIntent({ path, initial: true })).toBe(path);
  });
});
