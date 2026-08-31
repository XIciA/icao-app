import { access, readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = process.cwd();
const require = createRequire(import.meta.url);
const EXPECTED_IOS_SDK_URL = 'https://dldir1.qq.com/WechatWebDev/opensdk/XCFramework/OpenSDK2.0.7_NoPay.zip';
const EXPECTED_IOS_SDK_SHA256 = '882d99dabd26aceb6ad3e7a12c4b7da8a37626e68a04c8b89740c2275db24258';
const EXPECTED_ANDROID_DEPENDENCY = 'com.tencent.mm.opensdk:wechat-sdk-android-without-mta:6.8.0';

function fail(message) {
  throw new Error(`wechat_login_runtime:${message}`);
}

async function exists(relativePath) {
  return access(path.join(ROOT, relativePath)).then(() => true, (error) => {
    if (error?.code === 'ENOENT') return false;
    throw error;
  });
}

async function filesBelow(relativeDirectory) {
  const result = [];
  async function visit(relativePath) {
    for (const entry of await readdir(path.join(ROOT, relativePath), { withFileTypes: true })) {
      const child = path.join(relativePath, entry.name);
      // The approved vendored XCFramework is verified by its locked archive SHA above. Scanning
      // its bundled README/binaries for source markers creates false positives and adds no signal.
      if (entry.isDirectory() && entry.name !== 'Vendor') await visit(child);
      else if (entry.isFile()) result.push(child);
    }
  }
  await visit(relativeDirectory);
  return result;
}

const requiredFiles = [
  'modules/icao-wechat-auth/ios/IcaoWechatAuthModule.swift',
  'modules/icao-wechat-auth/android/src/main/java/com/icao/wechatauth/IcaoWechatAuthModule.kt',
  'plugins/with-wechat-auth.js',
  'services/api/src/auth/wechat-auth.controller.ts',
  'services/api/src/auth/wechat-auth.service.ts',
  'services/api/src/wechat-universal-link.controller.ts',
  'src/features/auth/wechat-native-auth.ts',
];
for (const file of requiredFiles) {
  if (!await exists(file)) fail(`required_file_missing:${file}`);
}

const plugin = require('../plugins/with-wechat-auth.js');
if (plugin.SDK_URL !== EXPECTED_IOS_SDK_URL) fail('ios_nopay_sdk_url_unlocked');
if (plugin.SDK_SHA256 !== EXPECTED_IOS_SDK_SHA256) fail('ios_nopay_sdk_checksum_unlocked');
const materializedSdk = path.join(ROOT, 'modules/icao-wechat-auth/ios/Vendor/WechatOpenSDK.xcframework');
if (await exists('modules/icao-wechat-auth/ios/Vendor/WechatOpenSDK.xcframework')) {
  plugin.verifyMaterializedNoPaySdk(materializedSdk);
}

const androidBuild = await readFile(path.join(ROOT, 'modules/icao-wechat-auth/android/build.gradle'), 'utf8');
if (!androidBuild.includes(EXPECTED_ANDROID_DEPENDENCY)) fail('android_sdk_dependency_unlocked');
if (/wechat-sdk-android-with-mta(?!:)/u.test(androidBuild)) fail('android_tracking_sdk_present');
const iosBridge = await readFile(path.join(ROOT, 'modules/icao-wechat-auth/ios/IcaoWechatAuthModule.swift'), 'utf8');
const androidBridge = await readFile(path.join(ROOT, 'modules/icao-wechat-auth/android/src/main/java/com/icao/wechatauth/IcaoWechatAuthModule.kt'), 'utf8');
for (const [platform, source] of [['ios', iosBridge], ['android', androidBridge]]) {
  if (!source.includes('cancelAuthorization')) fail(`${platform}_authorization_cancel_missing`);
  if (!source.includes('wechat_auth_timeout')) fail(`${platform}_authorization_timeout_missing`);
}

const packageJson = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'));
if (packageJson.dependencies?.['@icao/wechat-auth'] !== 'file:modules/icao-wechat-auth') {
  fail('native_module_dependency_missing');
}
if (packageJson.dependencies?.['expo-native-wechat'] || packageJson.devDependencies?.['expo-native-wechat']) {
  fail('unapproved_wechat_wrapper_present');
}

const appJson = JSON.parse(await readFile(path.join(ROOT, 'app.json'), 'utf8'));
const appConfig = require('../app.config.js');
const previous = {
  appId: process.env.ICAO_WECHAT_APP_ID,
  link: process.env.ICAO_WECHAT_UNIVERSAL_LINK,
};
try {
  process.env.ICAO_WECHAT_APP_ID = 'wx1234567890abcdef';
  process.env.ICAO_WECHAT_UNIVERSAL_LINK = 'https://api.example.com/wechat-auth/';
  const configured = appConfig({ config: appJson.expo });
  const plugins = configured.plugins.map((entry) => Array.isArray(entry) ? entry[0] : entry);
  if (!plugins.includes('./plugins/with-wechat-auth')) fail('config_plugin_missing');
  if (configured.ios?.usesAppleSignIn !== true) fail('apple_sign_in_capability_missing');
} finally {
  if (previous.appId === undefined) delete process.env.ICAO_WECHAT_APP_ID;
  else process.env.ICAO_WECHAT_APP_ID = previous.appId;
  if (previous.link === undefined) delete process.env.ICAO_WECHAT_UNIVERSAL_LINK;
  else process.env.ICAO_WECHAT_UNIVERSAL_LINK = previous.link;
}

const clientFiles = [
  'app.config.js',
  '.env.example',
  ...(await filesBelow('src')),
  ...(await filesBelow('modules/icao-wechat-auth')),
  ...(await filesBelow('plugins')),
];
const forbiddenClientSecrets = [/WECHAT_APP_SECRET/u, /EXPO_PUBLIC_[A-Z0-9_]*WECHAT[A-Z0-9_]*SECRET/u];
const forbiddenPaymentMarkers = [
  /\bPayReq\b/u,
  /\bWXPay\b/u,
  /wechat-sdk-android-with-mta(?:['":]|$)/u,
  /WechatOpenSDK_WithPay/iu,
  /\bwechat[_-]?pay\b/iu,
  /\bwx[_-]?pay\b/iu,
];
for (const relativePath of clientFiles) {
  const source = await readFile(path.join(ROOT, relativePath), 'utf8');
  for (const marker of forbiddenClientSecrets) {
    if (marker.test(source)) fail(`client_secret_marker:${relativePath}`);
  }
  for (const marker of forbiddenPaymentMarkers) {
    if (marker.test(source)) fail(`payment_marker:${relativePath}`);
  }
}

const serverConfig = await readFile(path.join(ROOT, 'services/api/src/config.ts'), 'utf8');
if (!serverConfig.includes('WECHAT_APP_SECRET')) fail('server_secret_configuration_missing');
const aasaController = await readFile(path.join(ROOT, 'services/api/src/wechat-universal-link.controller.ts'), 'utf8');
if (!aasaController.includes("@Get('apple-app-site-association')")) fail('aasa_endpoint_missing');
if (!aasaController.includes("header('content-type', 'application/json')")) fail('aasa_content_type_missing');

if (process.argv.includes('--candidate')) {
  const appId = process.env.ICAO_WECHAT_APP_ID?.trim();
  const universalLink = process.env.ICAO_WECHAT_UNIVERSAL_LINK?.trim();
  const archive = process.env.ICAO_WECHAT_SDK_ARCHIVE?.trim();
  const teamId = process.env.ICAO_APPLE_TEAM_ID?.trim();
  if (!appId || !/^wx[0-9a-z]+$/iu.test(appId)) fail('candidate_app_id_missing');
  if (!universalLink || !universalLink.startsWith('https://') || !universalLink.endsWith('/')) {
    fail('candidate_universal_link_missing');
  }
  if (!archive) fail('candidate_sdk_archive_missing');
  const archiveDigest = createHash('sha256').update(await readFile(path.resolve(archive))).digest('hex');
  if (archiveDigest !== EXPECTED_IOS_SDK_SHA256) fail('candidate_sdk_archive_checksum_mismatch');
  if (!teamId) fail('candidate_apple_team_id_missing');

  const aasaUrl = new URL('/.well-known/apple-app-site-association', universalLink);
  const aasaResponse = await fetch(aasaUrl, { redirect: 'manual', signal: AbortSignal.timeout(10_000) });
  if (!aasaResponse.ok || aasaResponse.status >= 300 && aasaResponse.status < 400) fail('candidate_aasa_unreachable_or_redirected');
  if (!aasaResponse.headers.get('content-type')?.toLowerCase().includes('application/json')) fail('candidate_aasa_content_type_invalid');
  const association = await aasaResponse.json().catch(() => undefined);
  const expectedApplicationId = `${teamId}.${appJson.expo.ios.bundleIdentifier}`;
  const expectedPath = `${new URL(universalLink).pathname}*`;
  const details = association?.applinks?.details;
  if (!Array.isArray(details) || !details.some((entry) => (
    entry?.appID === expectedApplicationId
    && Array.isArray(entry.paths)
    && entry.paths.includes(expectedPath)
  ))) fail('candidate_aasa_application_or_path_mismatch');

  if (!await exists('android/gradlew')) fail('candidate_android_project_missing');
  const dependencyReport = execFileSync('./gradlew', [':app:dependencies', '--configuration', 'releaseRuntimeClasspath'], {
    cwd: path.join(ROOT, 'android'),
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  if (!dependencyReport.includes(EXPECTED_ANDROID_DEPENDENCY)) fail('candidate_android_resolved_nopay_sdk_missing');
  if (/wechat-sdk-android-with-mta(?!:)/u.test(dependencyReport)) fail('candidate_android_tracking_sdk_resolved');
}

process.stdout.write(`WeChat NoPay login runtime verified (${process.argv.includes('--candidate') ? 'candidate' : 'static'} gate).\n`);
