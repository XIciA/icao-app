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

for (const versionPath of [
  'src/config/app-version.ts',
  'src/config/app-version.ios.ts',
  'src/config/app-version.android.ts',
]) {
  const source = await readFile(versionPath, 'utf8');
  const displayVersion = source.match(/APP_DISPLAY_VERSION\s*=\s*['"]([^'"]+)['"]/u)?.[1];
  if (displayVersion !== app.expo.version) {
    throw new Error(`${versionPath} must match the ${app.expo.version} marketing version.`);
  }
}

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
  productionConfig.name !== app.expo.name ||
  productionConfig.ios.usesAppleSignIn !== true ||
  !productionConfig.plugins.includes('expo-apple-authentication')
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
const aliyunSmsOverlay = await readFile('infra/supabase/docker-compose.aliyun-sms.yml', 'utf8');
const nativeAuthService = await readFile('src/features/auth/auth-service.ts', 'utf8');
const iosRelease = await readFile('scripts/release-ios.sh', 'utf8');
const iosTestFlightRelease = await readFile('scripts/release-ios-testflight.sh', 'utf8');
const iosAppStoreRelease = await readFile('scripts/release-ios-app-store.sh', 'utf8');
const androidRelease = await readFile('scripts/release-android.sh', 'utf8');
const iosStandalone = await readFile('scripts/build-standalone-ios.sh', 'utf8');
const iosTestFlightArchive = await readFile('scripts/archive-ios-testflight.sh', 'utf8');
const iosReleaseProduct = await readFile('scripts/lib/ios-release-product.sh', 'utf8');
const androidStandalone = await readFile('scripts/build-standalone-android.sh', 'utf8');
const releaseCommon = await readFile('scripts/lib/release-common.sh', 'utf8');
const packageJsonSource = await readFile('package.json', 'utf8');
const iosDevelopment = await readFile('scripts/run-ios-development.sh', 'utf8');
const criticalReleaseEvidence = await readFile('tools/critical-capability-release-evidence.mjs', 'utf8');
const mainlineReleaseGuard = await readFile('tools/check-mainline-release.mjs', 'utf8');
const prepareRelease = await readFile('tools/prepare-release.mjs', 'utf8');
const apiRelease = await readFile('scripts/deploy-api-release.sh', 'utf8');
const apiDockerfile = await readFile('infra/api/Dockerfile', 'utf8');
const apiConfig = await readFile('services/api/src/config.ts', 'utf8');
const apiConfigPreflight = await readFile('services/api/src/config-preflight.ts', 'utf8');
const apiAiRuntimeSources = (await Promise.all([
  'services/api/src/config.ts',
  'services/api/src/app.module.ts',
  'services/api/src/ai/ai.controller.ts',
  'services/api/src/ai/ai.service.ts',
  'services/api/src/ai/deepseek-review-provider.service.ts',
  'services/api/src/ai/tencent-asr.service.ts',
].map((file) => readFile(file, 'utf8')))).join('\n');
if (!caddy.includes('api.readyoufife.com') || !caddy.includes('cloud.readyoufife.com')) {
  throw new Error('The production gateway is missing the Read You 5 API or Supabase host.');
}
if (caddy.includes('api.feizhuicao.com') || caddy.includes('cloud.feizhuicao.com')) {
  throw new Error('The production gateway must not restore retired legacy API hosts.');
}
if (/download\./.test(caddy) || /file_server/.test(caddy)) {
  throw new Error('The production gateway must not expose a website or APK download host.');
}
for (const protectedAuthPath of ['/auth/v1/otp', '/auth/v1/resend', '/auth/v1/signup']) {
  if (!caddy.includes(protectedAuthPath)) {
    throw new Error(`The production gateway must block direct Native Auth start route: ${protectedAuthPath}`);
  }
}
if (
  !caddy.includes('method PUT PATCH')
  || !caddy.includes('/auth/v1/user')
  || !caddy.includes('header_up -Sb-Forwarded-For')
) {
  throw new Error('The production gateway is missing Auth mutation or forwarded-IP hardening.');
}
if (!aliyunSmsOverlay.includes('GOTRUE_SECURITY_SB_FORWARDED_FOR_ENABLED: "true"')) {
  throw new Error('The real-SMS Auth overlay must trust only the API-supplied Sb-Forwarded-For header.');
}
if (
  !nativeAuthService.includes("'/v1/auth/phone/otp/start'")
  || !nativeAuthService.includes("'/v1/auth/phone/recovery/start'")
  || !nativeAuthService.includes("'/v1/account/password'")
) {
  throw new Error('Native phone OTP and password mutations must use the server-owned routes.');
}
if (!iosRelease.includes('audio-sensitive-fingerprint.mjs verify ios')) {
  throw new Error('The iOS release is missing its audio E2E fingerprint gate.');
}
if (!androidRelease.includes('audio-sensitive-fingerprint.mjs verify android')) {
  throw new Error('The Android release is missing its audio E2E fingerprint gate.');
}
if (!androidRelease.includes('critical-capability-release-evidence.mjs verify android android')) {
  throw new Error('The Android release is missing its critical-capability evidence gate.');
}
for (const [name, source] of [
  ['iOS release', iosRelease],
  ['iOS standalone', iosStandalone],
  ['TestFlight release', iosTestFlightRelease],
  ['TestFlight archive', iosTestFlightArchive],
  ['App Store handoff', iosAppStoreRelease],
  ['Android release', androidRelease],
  ['Android standalone', androidStandalone],
  ['API release', apiRelease],
]) {
  if (!source.includes('check-mainline-release.mjs')) {
    throw new Error(`${name} must reject release sources outside origin/main.`);
  }
}
if (
  !mainlineReleaseGuard.includes("branch !== 'main'")
  || !mainlineReleaseGuard.includes('release_source_not_origin_main')
  || !mainlineReleaseGuard.includes("status', '--porcelain', '--untracked-files=all")
) {
  throw new Error('The shared mainline release guard is incomplete.');
}
if (
  !prepareRelease.includes('release_prepare_requires_task_branch')
  || !prepareRelease.includes("process.argv.includes('--materialize')")
  || !packageJsonSource.includes('release:materialize')
) {
  throw new Error('Version preparation must be committed before mainline release materialization.');
}
if (apiRelease.includes('ICAO_API_RELEASE_ALLOW_DIRTY')) {
  throw new Error('The API release must not retain a dirty-source escape hatch.');
}
if (
  !apiRelease.includes('.generated/release/current.json')
  || apiRelease.includes('.generated/release/current-manifest.json')
) {
  throw new Error('The API release must use materialized current release metadata.');
}
if (
  !apiRelease.includes('ICAO_API_BUILD_NPM_REGISTRY')
  || !apiRelease.includes('--build-arg "ICAO_NPM_REGISTRY=$build_npm_registry"')
  || !apiDockerfile.includes('ARG ICAO_NPM_REGISTRY=')
  || !apiDockerfile.includes('COREPACK_NPM_REGISTRY="$ICAO_NPM_REGISTRY"')
  || !apiDockerfile.includes('pnpm install --registry "$ICAO_NPM_REGISTRY" --frozen-lockfile')
) {
  throw new Error('The API image build must use its explicit HTTPS registry with locked dependencies.');
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
  ['iOS Release product verifier', iosReleaseProduct],
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
  !iosStandalone.includes('find_ios_release_app') ||
  !iosStandalone.includes('verify_ios_release_app')
) {
  throw new Error('The standalone iOS build is missing its generated-project or product integrity gate.');
}
if (
  !iosReleaseProduct.includes('assert_release_plist_value CFBundleVersion') ||
  !iosReleaseProduct.includes('EXDevLauncher.bundle') ||
  !iosReleaseProduct.includes('_expo._tcp') ||
  !iosReleaseProduct.includes('TeamIdentifier=') ||
  !iosReleaseProduct.includes('application-identifier') ||
  !iosReleaseProduct.includes('com.apple.developer.applesignin')
) {
  throw new Error('The shared iOS Release product integrity gate is incomplete.');
}
if (
  !iosTestFlightArchive.includes("-destination 'generic/platform=iOS'") ||
  !iosTestFlightArchive.includes('archivePath') ||
  !iosTestFlightArchive.includes('audio-sensitive-fingerprint.mjs verify ios') ||
  !iosTestFlightArchive.includes('verify_ios_release_app') ||
  !iosTestFlightArchive.includes('ApplicationProperties:Team') ||
  !iosTestFlightArchive.includes('check_release_runtime apple') ||
  !iosTestFlightArchive.includes('EXPO_PUBLIC_ICAO_AUDIO_E2E is forbidden') ||
  !iosTestFlightArchive.includes('check-mainline-release.mjs')
) {
  throw new Error('The TestFlight archive is missing its production identity or product integrity gate.');
}
if (
  !releaseCommon.includes('settings.external?.phone !== true') ||
  !releaseCommon.includes('settings.phone_autoconfirm === true') ||
  !releaseCommon.includes('settings.external?.[process.env.CHECK_SOCIAL_PROVIDER] !== true')
) {
  throw new Error('The Release runtime gate must verify enabled phone and required social providers.');
}
if (iosTestFlightArchive.includes('ICAO_SKIP_AUDIO_E2E')) {
  throw new Error('The TestFlight archive must not allow its audio evidence gate to be bypassed.');
}
if (
  !iosTestFlightRelease.includes('critical-capability-release-evidence.mjs verify testflight ios')
  || !iosTestFlightArchive.includes('critical-capability-release-evidence.mjs verify testflight ios')
) {
  throw new Error('The TestFlight release is missing its critical-capability evidence gate.');
}
if (
  !iosAppStoreRelease.includes('critical-capability-release-evidence.mjs verify app-store ios')
  || !iosAppStoreRelease.includes('.generated/last-testflight-archive.txt')
  || !iosAppStoreRelease.includes('CFBundleVersion')
  || !iosAppStoreRelease.includes('No build was created and no upload or store submission was performed.')
) {
  throw new Error('The App Store handoff is missing its exact TestFlight build or critical-capability gate.');
}
for (const forbiddenBypass of ['skip', 'bypass', 'IGNORE_CRITICAL', 'SKIP_CRITICAL']) {
  if (criticalReleaseEvidence.includes(`--${forbiddenBypass}`) || criticalReleaseEvidence.includes(`ICAO_${forbiddenBypass}`)) {
    throw new Error(`The critical-capability gate must not expose a bypass: ${forbiddenBypass}`);
  }
}
for (const requiredContract of [
  'devRealDevice',
  'aiLive',
  'testflightRealDevice',
  'record-device-check',
  'finalize-device',
  'run-ai-live',
  'device_check_not_passed',
  'ai_live_requires_production_api',
  'ai_live_verifier_changed',
  'device_observation_digest_mismatch',
  'production_api_version_changed_after_ai_live',
  'runbooks_changed_after_acknowledgement',
  'commit_changed',
  'releaseSourceFingerprint',
  'criticalFingerprint',
  "channel === 'app-store'",
  'freshHours: 7 * 24',
  "const devEvidenceRequired = channel === 'android'",
]) {
  if (!criticalReleaseEvidence.includes(requiredContract)) {
    throw new Error(`The critical-capability evidence contract is incomplete: ${requiredContract}`);
  }
}
if (
  criticalReleaseEvidence.includes("const devEvidenceRequired = channel === 'testflight'")
  || criticalReleaseEvidence.includes('devEvidenceRequired: true')
) {
  throw new Error('TestFlight must not require Development Build real-device evidence before upload.');
}
if (
  !apiRelease.includes('migration-plan.mjs --require-current')
  || !apiRelease.includes('candidate API deployment was blocked before cutover')
  || !apiRelease.includes('config-preflight.js')
  || !apiRelease.includes('Candidate API production configuration is incomplete')
  || !apiRelease.includes('x-icao-api-version:')
) {
  throw new Error('The production API candidate must verify configuration, migration state, and release identity before cutover.');
}
for (const requiredAiRuntimeField of [
  'AI_TEXT_PROVIDER',
  'DEEPSEEK_API_KEY',
  'DEEPSEEK_BASE_URL',
  'AI_GRAMMAR_MODEL',
  'AI_POLISH_MODEL',
  'TENCENT_CLOUD_SECRET_ID',
  'TENCENT_CLOUD_SECRET_KEY',
  'TENCENT_ASR_ENDPOINT',
  'AI_ASR_STAGING_BUCKET',
]) {
  if (!apiConfig.includes(requiredAiRuntimeField)) {
    throw new Error(`The production AI runtime guard is missing: ${requiredAiRuntimeField}`);
  }
}
for (const retiredAiRuntime of ['DASHSCOPE_', 'dashscope', 'qwen', '通义千问']) {
  if (apiAiRuntimeSources.toLowerCase().includes(retiredAiRuntime.toLowerCase())) {
    throw new Error(`The production Native API still references a retired AI runtime: ${retiredAiRuntime}`);
  }
}
if (
  !apiConfig.includes("AI_TEXT_PROVIDER: z.literal('deepseek')")
  || apiAiRuntimeSources.includes("@Post('word-lookup')")
) {
  throw new Error('The production Native API must use DeepSeek text AI and local static word lookup only.');
}
if (
  !apiConfig.includes('validateProductionAiRuntime')
  || !apiConfig.includes("parsed.data.NODE_ENV === 'production'")
  || !apiConfigPreflight.includes('loadConfig()')
  || apiConfigPreflight.includes('deepseekApiKey')
  || apiConfigPreflight.includes('tencentCloudSecret')
) {
  throw new Error('The production AI configuration preflight is incomplete or unsafe.');
}
for (const forbiddenEvidencePath of ['import-ai-live', 'function deviceChecks()']) {
  if (criticalReleaseEvidence.includes(forbiddenEvidencePath)) {
    throw new Error(`The critical-capability gate exposes a forgeable evidence path: ${forbiddenEvidencePath}`);
  }
}
if (!androidStandalone.includes('EXPO_PUBLIC_ICAO_AUDIO_E2E is forbidden')) {
  throw new Error('The Android Release build is missing its deterministic-audio guard.');
}

console.log('release configuration verified');
