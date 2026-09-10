/** Native OpenSDK owns these callbacks. Never route, log, or persist their query values. */
export function redirectNativeAuthIntent({ path, initial }: { path: string; initial: boolean }): string | null {
  try {
    const url = new URL(path, 'readyoufife://app');
    const callbackPath = /^\/wechat-auth\/wx[a-f0-9]{16}\/oauth\/?$/iu;
    const appCallback = url.protocol === 'readyoufife:'
      && (url.hostname === 'wechat-auth'
        ? /^\/wx[a-f0-9]{16}\/oauth\/?$/iu.test(url.pathname)
        : (url.hostname === '' || url.hostname === 'app') && callbackPath.test(url.pathname));
    const universalCallback = url.protocol === 'https:' && url.hostname === 'api.readyoufife.com'
      && callbackPath.test(url.pathname);
    const sdkCallback = /^wx[a-f0-9]{16}:$/iu.test(url.protocol)
      && ((url.hostname === 'oauth' && (url.pathname === '' || url.pathname === '/'))
        || (url.hostname === '' && url.pathname === '/oauth'));
    if (appCallback || universalCallback || sdkCallback) {
      // Warm callbacks must not unmount the pending login/binding UI. On cold
      // launch, its JS promise no longer exists: start through the normal auth gate.
      return initial ? '/' : null;
    }
  } catch { /* Leave unrelated or malformed links to the router's existing handling. */ }
  return path;
}
