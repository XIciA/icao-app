import { access, readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const TOOL_PATH = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(TOOL_PATH), '..');
const require = createRequire(import.meta.url);
const {
  normalizeWechatLoginCredentials,
  resolveWechatLoginReleaseCapability,
} = require('../config/release/wechat-login-contract.cjs');
const EXPECTED_IOS_SDK_URL = 'https://dldir1.qq.com/WechatWebDev/opensdk/XCFramework/OpenSDK2.0.7_NoPay.zip';
const EXPECTED_IOS_SDK_SHA256 = 'ce1cb4736d56adb9423561c40504f6ffdf841024dc2196bd38542228fbd7587d';
const EXPECTED_ANDROID_DEPENDENCY = 'com.tencent.mm.opensdk:wechat-sdk-android-without-mta:6.8.0';
const APPROVED_RELEASE_CONFIG_PATH = 'config/release/wechat-login.json';
const candidateConfiguration = process.argv.some((value) => [
  '--candidate',
  '--candidate-config',
  '--candidate-android-project',
  '--candidate-android-artifact',
  '--candidate-ios-artifact',
].includes(value));

function argumentAfter(flag) {
  const index = process.argv.indexOf(flag);
  return index < 0 ? undefined : process.argv[index + 1];
}

function fail(message) {
  throw new Error(`wechat_login_runtime:${message}`);
}

function hasRequiredIOSSendAuthRuntime(objectiveCMetadata) {
  return [
    /\bSendAuthReq\b/u,
    /sendAuthReq:viewController:delegate:completion:/u,
    /IcaoWechatAuthModule/u,
  ].every((marker) => marker.test(objectiveCMetadata));
}

function hasRequiredIOSSendAuthSource(source) {
  return [
    'let request = SendAuthReq()',
    'WXApi.sendAuthReq(request, viewController: controller, delegate: self)',
  ].every((anchor) => source.includes(anchor));
}

if (process.argv.includes('--self-test-ios-macho-metadata')) {
  const completeMetadata = [
    'name _TtC14IcaoWechatAuth20IcaoWechatAuthModule',
    'type @"SendAuthReq"',
    'sendAuthReq:viewController:delegate:completion:',
  ].join('\n');
  if (!hasRequiredIOSSendAuthRuntime(completeMetadata)) fail('ios_macho_metadata_positive_self_test');
  for (const missingMarker of [
    /IcaoWechatAuthModule/u,
    /SendAuthReq/u,
    /sendAuthReq:viewController:delegate:completion:/u,
  ]) {
    if (hasRequiredIOSSendAuthRuntime(completeMetadata.replace(missingMarker, ''))) {
      fail('ios_macho_metadata_negative_self_test');
    }
  }
  const completeSource = [
    'let request = SendAuthReq()',
    'WXApi.sendAuthReq(request, viewController: controller, delegate: self)',
  ].join('\n');
  if (!hasRequiredIOSSendAuthSource(completeSource)) fail('ios_sendauth_source_positive_self_test');
  for (const missingAnchor of [
    'let request = SendAuthReq()',
    'WXApi.sendAuthReq(request, viewController: controller, delegate: self)',
  ]) {
    if (hasRequiredIOSSendAuthSource(completeSource.replace(missingAnchor, ''))) {
      fail('ios_sendauth_source_negative_self_test');
    }
  }
  process.stdout.write('iOS WeChat source and Mach-O metadata self-test passed.\n');
  process.exit(0);
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
  'src/components/auth/login-screen.native.tsx',
  'src/features/auth/wechat-native-auth.ts',
  'src/features/auth/wechat-release-capability.ts',
  'src/features/info/legal-release-surface.native.ts',
];
for (const file of requiredFiles) {
  if (!await exists(file)) fail(`required_file_missing:${file}`);
}

const baseLoginScreen = await readFile(path.join(ROOT, 'src/components/auth/login-screen.tsx'), 'utf8');
const nativeLoginScreen = await readFile(path.join(ROOT, 'src/components/auth/login-screen.native.tsx'), 'utf8');
const capabilityImportAnchor = "import { resolveLoginAgeCopy } from '@/features/auth/login-release-surface';\n";
const capabilityStateAnchor = "  const loginAgeCopy = resolveLoginAgeCopy(Platform.OS);\n";
const baseSocialSurface = `      <Divider label="第三方快捷登录" />
      <View style={styles.socialSection}>
        {Platform.OS === 'ios' ? (
          <SocialButton accessibilityLabel="通过 Apple 登录" kind="apple" onPress={() => void socialLogin('apple')} />
        ) : null}
        <SocialButton accessibilityLabel="通过微信登录" kind="wechat" onPress={() => void socialLogin('wechat')} />
      </View>
      <AppText style={styles.scopeNote} variant="caption">第三方账号无需绑定手机号；可稍后在账号安全中添加其他登录方式。</AppText>`;
if (
  !baseLoginScreen.includes(capabilityImportAnchor)
  || !baseLoginScreen.includes(capabilityStateAnchor)
  || !baseLoginScreen.includes(baseSocialSurface)
) fail('native_login_parity_anchor_missing');
const expectedNativeLoginScreen = baseLoginScreen
  .replace(capabilityImportAnchor, `${capabilityImportAnchor}import { WECHAT_LOGIN_ENABLED } from '@/features/auth/wechat-release-capability';\n`)
  .replace(capabilityStateAnchor, `${capabilityStateAnchor}  const thirdPartyLoginAvailable = Platform.OS === 'ios' || WECHAT_LOGIN_ENABLED;\n`)
  .replace(baseSocialSurface, `{thirdPartyLoginAvailable ? (
        <>
          <Divider label="第三方快捷登录" />
          <View style={styles.socialSection}>
            {Platform.OS === 'ios' ? (
              <SocialButton accessibilityLabel="通过 Apple 登录" kind="apple" onPress={() => void socialLogin('apple')} />
            ) : null}
            {WECHAT_LOGIN_ENABLED ? (
              <SocialButton accessibilityLabel="通过微信登录" kind="wechat" onPress={() => void socialLogin('wechat')} />
            ) : null}
          </View>
          <AppText style={styles.scopeNote} variant="caption">第三方账号无需绑定手机号；可稍后在账号安全中添加其他登录方式。</AppText>
        </>
      ) : null}`);
if (nativeLoginScreen !== expectedNativeLoginScreen) fail('native_login_surface_drift');

const capabilitySource = await readFile(path.join(ROOT, 'src/features/auth/wechat-release-capability.ts'), 'utf8');
if (
  !capabilitySource.includes('config/release/wechat-login.json')
  || !capabilitySource.includes('resolveWechatLoginReleaseCapability')
) {
  fail('native_release_capability_not_config_owned');
}
const nativeLegalSurface = await readFile(path.join(ROOT, 'src/features/info/legal-release-surface.native.ts'), 'utf8');
if (!nativeLegalSurface.includes('WECHAT_LOGIN_ENABLED')) fail('native_legal_surface_not_capability_gated');
const iosReleaseProduct = await readFile(path.join(ROOT, 'scripts/lib/ios-release-product.sh'), 'utf8');
if (
  !iosReleaseProduct.includes("wechat_release_mode=\$(\"\${NODE_BINARY:-node}\" -p")
  || !iosReleaseProduct.includes('wechat-login-contract.cjs')
  || !iosReleaseProduct.includes("[ \"$wechat_release_mode\" = 'approved' ]")
  || !iosReleaseProduct.includes("[ \"$wechat_release_mode\" = 'pending' ]")
  || !iosReleaseProduct.includes('The pending Release app must not contain a WeChat associated domain.')
) fail('ios_release_associated_domain_not_capability_gated');

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
if (!iosBridge.includes('takePending(expectedState: state)')) fail('ios_timeout_generation_guard_missing');
if (!iosBridge.includes('takePending(expectedState: state)')) fail('ios_callback_generation_guard_missing');
if (!hasRequiredIOSSendAuthSource(iosBridge)) fail('ios_sendauth_call_chain_missing');
if (!androidBridge.includes('takePending(responseState)')) fail('android_callback_generation_guard_missing');
if (!androidBridge.includes('takePending(state)')) fail('android_timeout_generation_guard_missing');
if (/takePending\(\s*\)/u.test(`${iosBridge}\n${androidBridge}`)) fail('native_unguarded_pending_take_present');

const packageJson = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'));
if (packageJson.dependencies?.['@icao/wechat-auth'] !== 'file:modules/icao-wechat-auth') {
  fail('native_module_dependency_missing');
}
if (packageJson.dependencies?.['expo-native-wechat'] || packageJson.devDependencies?.['expo-native-wechat']) {
  fail('unapproved_wechat_wrapper_present');
}

const appJson = JSON.parse(await readFile(path.join(ROOT, 'app.json'), 'utf8'));
const approvedRelease = JSON.parse(await readFile(path.join(ROOT, APPROVED_RELEASE_CONFIG_PATH), 'utf8'));
let releaseCapability;
try {
  releaseCapability = resolveWechatLoginReleaseCapability(approvedRelease);
} catch (error) {
  fail(`approved_release_configuration_invalid:${error instanceof Error ? error.message : 'unknown'}`);
}
if (
  approvedRelease?.ios?.teamId !== '3FX69S3S8P'
  || approvedRelease?.ios?.bundleId !== appJson.expo.ios.bundleIdentifier
  || approvedRelease?.android?.packageName !== appJson.expo.android.package
) fail('approved_release_identity_invalid');
const wechatEnabledForRelease = releaseCapability.enabled;
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
  /\bPayResp\b/u,
  /\bWXPay\b/u,
  /WXPayEntryActivity/u,
  /\bmerchant[_-]?(?:id|key)\b/iu,
  /\bmch[_-]?id\b/iu,
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

if (candidateConfiguration) {
  let candidateCredentials;
  try {
    candidateCredentials = normalizeWechatLoginCredentials({
      appId: process.env.ICAO_WECHAT_APP_ID,
      universalLink: process.env.ICAO_WECHAT_UNIVERSAL_LINK,
    });
  } catch (error) {
    fail(`candidate_configuration_invalid:${error instanceof Error ? error.message : 'unknown'}`);
  }
  const { appId, universalLink } = candidateCredentials;
  const productionApiUrl = (process.env.EXPO_PUBLIC_ICAO_API_URL || process.env.API_URL)?.trim();
  const archive = process.env.ICAO_WECHAT_SDK_ARCHIVE?.trim();
  const teamId = (process.env.ICAO_APPLE_TEAM_ID || process.env.ICAO_IOS_TEAM_ID)?.trim();
  if (wechatEnabledForRelease) {
    if (!appId) fail('candidate_app_id_missing');
    if (!universalLink) fail('candidate_universal_link_missing');
    if (releaseCapability.appId !== appId) fail('tracked_candidate_app_id_mismatch');
    if (releaseCapability.universalLink !== universalLink) {
      fail('tracked_candidate_universal_link_mismatch');
    }
    if (!productionApiUrl || new URL(universalLink).origin !== new URL(productionApiUrl).origin) {
      fail('candidate_universal_link_api_origin_mismatch');
    }
  } else if (appId || universalLink) {
    fail('pending_release_must_not_embed_wechat_configuration');
  }
  if (archive) {
    const archiveDigest = createHash('sha256').update(await readFile(path.resolve(archive))).digest('hex');
    if (archiveDigest !== EXPECTED_IOS_SDK_SHA256) fail('candidate_sdk_archive_checksum_mismatch');
  }
  if (!teamId) fail('WAITING_HUMAN:candidate_apple_team_id_missing');
  if (teamId !== approvedRelease.ios.teamId) fail('candidate_apple_team_id_not_approved');
  if (
    (process.argv.includes('--candidate') || process.argv.includes('--candidate-config') || process.argv.includes('--candidate-ios-artifact'))
    && !await exists('modules/icao-wechat-auth/ios/Vendor/WechatOpenSDK.xcframework')
  ) {
    fail('candidate_materialized_official_sdk_missing');
  }
  if (process.argv.includes('--candidate') || process.argv.includes('--candidate-config') || process.argv.includes('--candidate-ios-artifact')) {
    plugin.verifyMaterializedNoPaySdk(materializedSdk);
  }

  if (wechatEnabledForRelease) {
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
      && entry.paths.length === 1
      && entry.paths[0] === expectedPath
    ))) fail('candidate_aasa_application_or_path_mismatch');
  }
}

if (process.argv.includes('--candidate') || process.argv.includes('--candidate-android-project')) {
  if (!await exists('android/gradlew')) fail('candidate_android_project_missing');
  const dependencyReport = execFileSync('./gradlew', [':app:dependencies', '--configuration', 'releaseRuntimeClasspath'], {
    cwd: path.join(ROOT, 'android'),
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  if (!dependencyReport.includes(EXPECTED_ANDROID_DEPENDENCY)) fail('candidate_android_resolved_nopay_sdk_missing');
  if (/wechat-sdk-android-with-mta(?!:)/u.test(dependencyReport)) fail('candidate_android_tracking_sdk_resolved');
  const gradleProperties = await readFile(path.join(ROOT, 'android/gradle.properties'), 'utf8');
  if (!/^android\.enableMinifyInReleaseBuilds=true$/mu.test(gradleProperties)) fail('candidate_android_release_minify_disabled');
  if (!/^android\.enableShrinkResourcesInReleaseBuilds=true$/mu.test(gradleProperties)) fail('candidate_android_release_resource_shrink_disabled');
}

const androidArtifact = argumentAfter('--candidate-android-artifact');
if (androidArtifact) {
  const artifact = path.resolve(androidArtifact);
  await access(artifact);
  const entries = execFileSync('unzip', ['-Z1', artifact], { encoding: 'utf8' }).split('\n');
  const bundleEntry = entries.find((entry) => /(^|\/)index\.android\.bundle$/u.test(entry));
  if (!bundleEntry) fail('candidate_android_javascript_bundle_missing');
  const bundle = execFileSync('unzip', ['-p', artifact, bundleEntry], { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });
  for (const marker of forbiddenPaymentMarkers) {
    if (marker.test(bundle)) fail('candidate_android_reachable_payment_marker');
  }
  const analyzer = process.env.ICAO_APKANALYZER?.trim();
  if (!analyzer) fail('candidate_android_apkanalyzer_missing');
  const manifest = execFileSync(analyzer, ['manifest', 'print', artifact], { encoding: 'utf8' });
  if (/WXPayEntryActivity|merchant[_-]?(?:id|key)|mch[_-]?id/iu.test(manifest)) {
    fail('candidate_android_payment_manifest_present');
  }
  const applicationId = execFileSync(analyzer, ['manifest', 'application-id', artifact], { encoding: 'utf8' }).trim();
  if (wechatEnabledForRelease) {
    const expectedAppId = process.env.ICAO_WECHAT_APP_ID?.trim();
    if (!expectedAppId || !new RegExp(
      `<meta-data[^>]+android:name=["']com\\.icao\\.wechatauth\\.APP_ID["'][^>]+android:value=["']${expectedAppId}["']`,
      'iu',
    ).test(manifest)) fail('candidate_android_wechat_app_id_mismatch');
    const expectedCallback = `${applicationId}.wxapi.WXEntryActivity`;
    if (!manifest.includes(expectedCallback) || !/WXEntryActivity[^>]+android:exported=["']true["']/iu.test(manifest)) {
      fail('candidate_android_wechat_callback_mismatch');
    }
  } else if (/com\.icao\.wechatauth\.APP_ID|\.wxapi\.WXEntryActivity/iu.test(manifest)) {
    fail('pending_android_artifact_exposes_wechat_configuration');
  }
}

const iosArtifact = argumentAfter('--candidate-ios-artifact');
if (iosArtifact) {
  const app = path.resolve(iosArtifact);
  const infoPlist = path.join(app, 'Info.plist');
  const executableName = execFileSync('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleExecutable', infoPlist], { encoding: 'utf8' }).trim();
  const optionalPlistValue = (key) => {
    try {
      return execFileSync('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, infoPlist], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
      return '';
    }
  };
  const configuredAppId = optionalPlistValue('ICAOWechatAppId');
  const configuredLink = optionalPlistValue('ICAOWechatUniversalLink');
  if (wechatEnabledForRelease) {
    if (configuredAppId !== process.env.ICAO_WECHAT_APP_ID?.trim() || configuredLink !== process.env.ICAO_WECHAT_UNIVERSAL_LINK?.trim()) {
      fail('candidate_ios_wechat_configuration_mismatch');
    }
  } else if (configuredAppId || configuredLink) {
    fail('pending_ios_artifact_exposes_wechat_configuration');
  }
  // Release archives strip local Objective-C method names from the exported symbol table.
  // The source-level bridge call chain is checked above; the final Mach-O metadata must
  // independently retain the bridge, request class, and concrete login selector.
  const objectiveCMetadata = execFileSync('otool', ['-ov', path.join(app, executableName)], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (!hasRequiredIOSSendAuthRuntime(objectiveCMetadata)) fail('candidate_ios_sendauth_symbol_missing');
  const unresolvedSymbols = execFileSync('nm', ['-u', path.join(app, executableName)], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (/PayReq|PayResp|WXPay|WXNontaxPay|WXJointPay/u.test(unresolvedSymbols)) fail('candidate_ios_application_payment_reference');
  const bundle = await readFile(path.join(app, 'main.jsbundle'), 'utf8');
  for (const marker of forbiddenPaymentMarkers) {
    if (marker.test(bundle)) fail('candidate_ios_reachable_payment_marker');
  }
}

const releaseMode = wechatEnabledForRelease ? 'enabled' : 'hidden-pending-approval';
process.stdout.write(`Official WeChat SendAuth runtime verified (${candidateConfiguration ? 'candidate' : 'static'} gate; ${releaseMode}; no application-reachable payment capability).\n`);
