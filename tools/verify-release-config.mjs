import { access, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const app = JSON.parse(await readFile('app.json', 'utf8'));
const appConfig = require('../app.config.js');
const plugin = require('../plugins/with-android-release-signing');
const iosIntegrityPlugin = require('../plugins/with-ios-release-integrity');
const sample = `android {
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            signingConfig signingConfigs.debug
        }
    }
}
`;
const first = plugin.applySigning(sample);
const second = plugin.applySigning(first);

if (process.env.EXPO_PUBLIC_ICAO_AUDIO_E2E === '1') {
  throw new Error('The deterministic audio E2E adapter must never be enabled for Release builds.');
}

if (app.expo.name !== '听你五个' || app.expo.slug !== 'readyoufife' || app.expo.scheme !== 'readyoufife') {
  throw new Error('The formal Read You 5 name, slug, or URL scheme is inconsistent.');
}
if (app.expo.ios.bundleIdentifier !== 'com.readyoufife.ios') {
  throw new Error('The iOS Bundle ID must be com.readyoufife.ios.');
}
if (app.expo.android.package !== 'com.readyoufife.app') {
  throw new Error('The Android release package must be com.readyoufife.app.');
}
if (!app.expo.plugins.includes('./plugins/with-ios-release-integrity')) {
  throw new Error('The iOS Release integrity config plugin is missing.');
}
const originalVariant = process.env.ICAO_APP_VARIANT;
process.env.ICAO_APP_VARIANT = 'development';
const developmentConfig = appConfig({ config: app.expo });
process.env.ICAO_APP_VARIANT = 'production';
const productionConfig = appConfig({ config: app.expo });
if (originalVariant === undefined) delete process.env.ICAO_APP_VARIANT;
else process.env.ICAO_APP_VARIANT = originalVariant;
if (
  developmentConfig.ios.bundleIdentifier !== appConfig.DEVELOPMENT_IOS_BUNDLE_IDENTIFIER ||
  developmentConfig.ios.bundleIdentifier === app.expo.ios.bundleIdentifier ||
  developmentConfig.name !== '听你五个 Dev'
) {
  throw new Error('The iOS Development Build must use its own app identity.');
}
if (
  productionConfig.ios.bundleIdentifier !== app.expo.ios.bundleIdentifier ||
  productionConfig.name !== app.expo.name
) {
  throw new Error('The production app identity must remain unchanged.');
}
const iosIntegrityScript = iosIntegrityPlugin.createShellScript({
  version: app.expo.version,
  buildNumber: app.expo.ios.buildNumber,
});
if (
  !iosIntegrityScript.includes('CFBundleVersion') ||
  !iosIntegrityScript.includes('_expo._tcp') ||
  !iosIntegrityScript.includes('Expo Dev Launcher') ||
  iosIntegrityPlugin.INFO_PLIST_INPUT !== '"$(TARGET_BUILD_DIR)/$(INFOPLIST_PATH)"'
) {
  throw new Error('The iOS Release metadata or local-network integrity gate is incomplete.');
}
const audioPlugin = app.expo.plugins.find((entry) => Array.isArray(entry) && entry[0] === 'expo-audio');
if (!audioPlugin?.[1]?.microphonePermission?.includes('口语练习')) {
  throw new Error('The production microphone purpose disclosure is missing.');
}
if (first !== second) throw new Error('The Android signing config plugin must be idempotent.');
if (!/release \{\s*signingConfig signingConfigs\.release/.test(first)) {
  throw new Error('The Android release build is not connected to release signing.');
}
if (!/debug \{\s*signingConfig signingConfigs\.debug/.test(first)) {
  throw new Error('The Android debug build signing was unexpectedly changed.');
}
if (!first.includes('Missing Android release signing environment')) {
  throw new Error('The release signing environment guard is missing.');
}

const caddy = await readFile('infra/gateway/Caddyfile', 'utf8');
const iosRelease = await readFile('scripts/release-ios.sh', 'utf8');
const androidRelease = await readFile('scripts/release-android.sh', 'utf8');
const iosStandalone = await readFile('scripts/build-standalone-ios.sh', 'utf8');
const androidStandalone = await readFile('scripts/build-standalone-android.sh', 'utf8');
const releaseCommon = await readFile('scripts/lib/release-common.sh', 'utf8');
const packageJsonSource = await readFile('package.json', 'utf8');
const iosDevelopment = await readFile('scripts/run-ios-development.sh', 'utf8');
if (!caddy.includes('api.readyoufife.com') || !caddy.includes('cloud.readyoufife.com')) {
  throw new Error('The production gateway is missing the Read You 5 API or Supabase host.');
}
if (caddy.includes('api.feizhuicao.com') || caddy.includes('cloud.feizhuicao.com')) {
  throw new Error('The production gateway must not restore retired legacy API hosts.');
}
if (/download\./.test(caddy) || /file_server/.test(caddy)) {
  throw new Error('The production gateway must not expose a website or APK download host.');
}
if (!iosRelease.includes('audio-sensitive-fingerprint.mjs verify ios')) {
  throw new Error('The iOS release is missing its audio E2E fingerprint gate.');
}
if (!androidRelease.includes('audio-sensitive-fingerprint.mjs verify android')) {
  throw new Error('The Android release is missing its audio E2E fingerprint gate.');
}
for (const retiredReference of [
  '47.109.132.161',
  'download.feizhuicao.com',
  'ICAO_DOWNLOAD_ECS_HOST',
  'publish-android-release.sh',
  'deploy-api-release.sh',
]) {
  if (androidRelease.includes(retiredReference)) {
    throw new Error(`The Android release must not use the retired download flow: ${retiredReference}`);
  }
}
if (packageJsonSource.includes('scripts/publish-android-release.sh')) {
  throw new Error('The retired Android download-site publisher is still registered in package.json.');
}
if (
  !iosDevelopment.includes('ICAO_APP_VARIANT=development') ||
  !iosDevelopment.includes('expo prebuild --platform ios --no-install') ||
  !iosStandalone.includes('ICAO_APP_VARIANT=production') ||
  !packageJsonSource.includes('ICAO_APP_VARIANT=development expo start --dev-client')
) {
  throw new Error('The iOS development and standalone build variants are not isolated.');
}
for (const [name, source] of [
  ['iOS standalone', iosStandalone],
  ['Android standalone', androidStandalone],
]) {
  for (const retiredRuntime of ['47\\.109\\.132\\.161', 'api\\.feizhuicao\\.com', 'cloud\\.feizhuicao\\.com']) {
    if (!source.includes(retiredRuntime)) {
      throw new Error(`${name} must reject retired runtime reference: ${retiredRuntime}`);
    }
  }
}
for (const retiredRuntime of ['47\\.109\\.132\\.161', '(api|cloud)\\.feizhuicao\\.com']) {
  if (!releaseCommon.includes(retiredRuntime)) {
    throw new Error(`Shared release runtime must reject retired runtime reference: ${retiredRuntime}`);
  }
}
for (const retiredPath of [
  'scripts/publish-android-release.sh',
  'infra/download-site/index.html',
  'infra/download-site/styles.css',
  'infra/download-site/release.js',
]) {
  const stillExists = await access(retiredPath).then(
    () => true,
    (error) => {
      if (error?.code === 'ENOENT') return false;
      throw error;
    },
  );
  if (stillExists) throw new Error(`Retired Android download-site source still exists: ${retiredPath}`);
}
if (!iosStandalone.includes('EXPO_PUBLIC_ICAO_AUDIO_E2E is forbidden')) {
  throw new Error('The iOS Release build is missing its deterministic-audio guard.');
}
if (
  !iosStandalone.includes('expo prebuild --platform ios --no-install') ||
  !iosStandalone.includes("Expected exactly one iOS Release app") ||
  !iosStandalone.includes('assert_plist_value CFBundleVersion') ||
  !iosStandalone.includes('EXDevLauncher.bundle') ||
  !iosStandalone.includes('_expo._tcp')
) {
  throw new Error('The standalone iOS build is missing its generated-project or product integrity gate.');
}
if (!androidStandalone.includes('EXPO_PUBLIC_ICAO_AUDIO_E2E is forbidden')) {
  throw new Error('The Android Release build is missing its deterministic-audio guard.');
}

console.log('release configuration verified');
