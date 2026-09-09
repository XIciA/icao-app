import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const fromExpo = createRequire(require.resolve('expo/package.json'));
const plist = fromExpo('@expo/plist').default;
const { IOSConfig } = require('expo/config-plugins');
const { resolveWechatLoginReleaseCapability } = require('../config/release/wechat-login-contract.cjs');

export function assertIosReleaseWechatPlist(info, scheme, releaseConfiguration) {
  const capability = resolveWechatLoginReleaseCapability(releaseConfiguration);
  const expected = capability.enabled ? [scheme, capability.appId] : [scheme];
  const urlTypes = info.CFBundleURLTypes;
  if (!Array.isArray(urlTypes) || urlTypes.some(entry => !Array.isArray(entry?.CFBundleURLSchemes))) {
    throw new Error('candidate_ios_url_schemes_invalid');
  }
  const actual = urlTypes.flatMap(entry => entry.CFBundleURLSchemes);
  if (actual.length !== expected.length || actual.some(value => typeof value !== 'string')
      || [...actual].sort().join('\n') !== [...expected].sort().join('\n')) {
    throw new Error('candidate_ios_url_schemes_mismatch');
  }
  if (capability.enabled) {
    if (info.ICAOWechatAppId !== capability.appId || info.ICAOWechatUniversalLink !== capability.universalLink) {
      throw new Error('candidate_ios_wechat_configuration_mismatch');
    }
    if (!['wechat', 'weixin', 'weixinULAPI'].every(value => info.LSApplicationQueriesSchemes?.includes(value))) {
      throw new Error('candidate_ios_wechat_query_schemes_missing');
    }
  } else if (info.ICAOWechatAppId || info.ICAOWechatUniversalLink) {
    throw new Error('pending_ios_artifact_exposes_wechat_configuration');
  }
}

// This reads the generated project on disk after prebuild. Checking app.config
// alone misses later plugins overwriting another plugin's Info.plist changes.
export async function verifyGeneratedIosWechatPlist(projectRoot) {
  const app = JSON.parse(await readFile(path.join(projectRoot, 'app.json'), 'utf8'));
  const release = JSON.parse(await readFile(path.join(projectRoot, 'config/release/wechat-login.json'), 'utf8'));
  const infoPath = IOSConfig.Paths.getInfoPlistPath(projectRoot);
  if (!infoPath) throw new Error('candidate_ios_generated_info_plist_missing');
  const info = plist.parse(await readFile(infoPath, 'utf8'));
  assertIosReleaseWechatPlist(info, app.expo.scheme, release);
  return infoPath;
}
