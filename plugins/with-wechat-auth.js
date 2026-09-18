const { createHash } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  AndroidConfig,
  withAndroidManifest,
  withDangerousMod,
  withEntitlementsPlist,
  withGradleProperties,
  withInfoPlist,
} = require('expo/config-plugins');
const { normalizeWechatLoginCredentials } = require('../config/release/wechat-login-contract.cjs');

const SDK_URL = 'https://dldir1.qq.com/WechatWebDev/opensdk/XCFramework/OpenSDK2.0.7_NoPay.zip';
// Tencent republished the same 2.0.7 NoPay URL on 2026-09-02. Keep the archive
// and every materialized build input pinned together so a future silent update
// fails closed until it is reviewed again.
const SDK_SHA256 = 'ce1cb4736d56adb9423561c40504f6ffdf841024dc2196bd38542228fbd7587d';
const ARCHIVE_SDK_DIRECTORY = 'WechatOpenSDK-NoPay.xcframework';
// CocoaPods derives the linker framework name from the XCFramework directory.
// The approved NoPay archive's inner framework is named WechatOpenSDK, so the
// materialized directory must use that name even though the locked archive is
// explicitly the NoPay distribution.
const SDK_DIRECTORY = 'WechatOpenSDK.xcframework';
const ANDROID_APP_ID_METADATA_KEY = 'com.icao.wechatauth.APP_ID';
const MATERIALIZED_SDK_SHA256 = Object.freeze({
  'Info.plist': '73e7b04a733a6941c7af0664e2f4ded5d6247e18151dc9a6656052d1b0d8e9ee',
  'PrivacyInfo.xcprivacy': 'dc8d7e1f9a7da7f3381f30746b59206ee62ce225b69fe3bcbb66234f8459be35',
  'README.txt': '7e23dc1822b938a35e6365d869aa21f5041cae7208037cbf4282f5a9c654c89e',
  'ios-arm64/WechatOpenSDK.framework/Headers/WXApi.h': '124f15d10fece25f2517ac55a82d8dd17457bf3c79e901a7e710d40e6968778f',
  'ios-arm64/WechatOpenSDK.framework/Headers/WXApiObject.h': '140af3b6b76a0bacc5cb0ff0533175f1752a5c7c3f2e8af3730a535742536a4d',
  'ios-arm64/WechatOpenSDK.framework/Headers/WechatAuthSDK.h': '797e9cb595b590b961c3f85334d58e24f8f40698301c6c237b80a374604a03e7',
  'ios-arm64/WechatOpenSDK.framework/Headers/WechatOpenSDK.h': '4fe88232acfe06245a21a04f18959dd7e762af4947e711dba5df0ce222da5520',
  'ios-arm64/WechatOpenSDK.framework/Info.plist': 'bb08b10ae4a3ffa049761720f5c51a5c2979301a90e4531b86a2e45bb33894c1',
  'ios-arm64/WechatOpenSDK.framework/Modules/module.modulemap': '21b015268e0a8321610ba0cc57c226d68365f7e70110bb945f3f0f13d346158f',
  'ios-arm64/WechatOpenSDK.framework/WechatOpenSDK': '178b7b0cc71d044bd6c03bdf7704cdf916340fb1a553f7bcde03a4c3ad4dc2da',
  'ios-arm64_x86_64-simulator/WechatOpenSDK.framework/Headers/WXApi.h': '124f15d10fece25f2517ac55a82d8dd17457bf3c79e901a7e710d40e6968778f',
  'ios-arm64_x86_64-simulator/WechatOpenSDK.framework/Headers/WXApiObject.h': '140af3b6b76a0bacc5cb0ff0533175f1752a5c7c3f2e8af3730a535742536a4d',
  'ios-arm64_x86_64-simulator/WechatOpenSDK.framework/Headers/WechatAuthSDK.h': '797e9cb595b590b961c3f85334d58e24f8f40698301c6c237b80a374604a03e7',
  'ios-arm64_x86_64-simulator/WechatOpenSDK.framework/Headers/WechatOpenSDK.h': '4fe88232acfe06245a21a04f18959dd7e762af4947e711dba5df0ce222da5520',
  'ios-arm64_x86_64-simulator/WechatOpenSDK.framework/Info.plist': 'bb08b10ae4a3ffa049761720f5c51a5c2979301a90e4531b86a2e45bb33894c1',
  'ios-arm64_x86_64-simulator/WechatOpenSDK.framework/Modules/module.modulemap': '21b015268e0a8321610ba0cc57c226d68365f7e70110bb945f3f0f13d346158f',
  'ios-arm64_x86_64-simulator/WechatOpenSDK.framework/WechatOpenSDK': '1a3cda7b2efa735d895f78e9b94adebe580bd732a03517eee85a8b37430bdee4',
});

function addUnique(values, value) {
  return [...new Set([...(values || []), value])];
}

function normalizedConfiguration(properties = {}) {
  try {
    return normalizeWechatLoginCredentials(properties);
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'invalid';
    throw new Error(`Invalid WeChat login configuration: ${reason}`);
  }
}

function sha256File(file) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function verifyMaterializedNoPaySdk(destination) {
  for (const [relativePath, expected] of Object.entries(MATERIALIZED_SDK_SHA256)) {
    const file = path.join(destination, relativePath);
    if (!fs.existsSync(file)) throw new Error(`WeChat NoPay SDK materialized file is missing (${relativePath})`);
    const actual = sha256File(file);
    if (actual !== expected) throw new Error(`WeChat NoPay SDK materialized checksum mismatch (${relativePath}:${actual})`);
  }
}

async function materializeNoPaySdk(projectRoot) {
  const moduleRoot = path.join(projectRoot, 'modules', 'icao-wechat-auth', 'ios');
  const vendorRoot = path.join(moduleRoot, 'Vendor');
  const destination = path.join(vendorRoot, SDK_DIRECTORY);
  const existingBinary = path.join(destination, 'ios-arm64', 'WechatOpenSDK.framework', 'WechatOpenSDK');
  if (fs.existsSync(existingBinary)) {
    verifyMaterializedNoPaySdk(destination);
    return;
  }

  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'icao-wechat-nopay.'));
  try {
    const archive = process.env.ICAO_WECHAT_SDK_ARCHIVE
      ? path.resolve(process.env.ICAO_WECHAT_SDK_ARCHIVE)
      : path.join(temporaryRoot, 'OpenSDK2.0.7_NoPay.zip');
    if (!process.env.ICAO_WECHAT_SDK_ARCHIVE) {
      const response = await fetch(SDK_URL, { redirect: 'follow' });
      if (!response.ok) throw new Error(`WeChat NoPay SDK download failed (${response.status})`);
      fs.writeFileSync(archive, Buffer.from(await response.arrayBuffer()));
    }
    const digest = createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
    if (digest !== SDK_SHA256) throw new Error(`WeChat NoPay SDK checksum mismatch (${digest})`);
    const extracted = path.join(temporaryRoot, 'extracted');
    fs.mkdirSync(extracted, { recursive: true });
    const unzip = spawnSync('unzip', ['-q', archive, '-d', extracted], { encoding: 'utf8' });
    if (unzip.status !== 0) throw new Error(`WeChat NoPay SDK extraction failed: ${unzip.stderr}`);
    const source = path.join(extracted, ARCHIVE_SDK_DIRECTORY);
    if (!fs.existsSync(source)) throw new Error('WeChat NoPay SDK archive has an unexpected structure');
    fs.mkdirSync(vendorRoot, { recursive: true });
    fs.rmSync(destination, { force: true, recursive: true });
    fs.cpSync(source, destination, { recursive: true });
    verifyMaterializedNoPaySdk(destination);
  } finally {
    fs.rmSync(temporaryRoot, { force: true, recursive: true });
  }
}

function upsertAndroidManifestEntry(application, key, value) {
  const entries = application[key] || [];
  const name = value.$['android:name'];
  application[key] = [
    ...entries.filter((entry) => {
      const existingName = entry.$?.['android:name'];
      return existingName !== name && !(key === 'activity' && existingName?.startsWith('.') && name.endsWith(existingName));
    }),
    value,
  ];
}

function upsertGradleProperty(properties, key, value) {
  return [
    ...properties.filter((entry) => !(entry.type === 'property' && entry.key === key)),
    { type: 'property', key, value },
  ];
}

function androidCallbackSource(packageName) {
  return `package ${packageName}.wxapi

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import com.icao.wechatauth.IcaoWechatAuthCoordinator
import com.tencent.mm.opensdk.modelbase.BaseReq
import com.tencent.mm.opensdk.modelbase.BaseResp
import com.tencent.mm.opensdk.openapi.IWXAPIEventHandler

/** Generated by with-wechat-auth. WeChat requires this exact applicationId.wxapi class. */
class WXEntryActivity : Activity(), IWXAPIEventHandler {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    handleWechatIntent(intent)
  }

  override fun onNewIntent(intent: Intent?) {
    super.onNewIntent(intent)
    setIntent(intent)
    handleWechatIntent(intent)
  }

  private fun handleWechatIntent(intent: Intent?) {
    if (intent == null || IcaoWechatAuthCoordinator.api(this)?.handleIntent(intent, this) != true) {
      // An unrecognized or stale callback must not cancel a newer authorization generation.
      finish()
    }
  }

  override fun onReq(request: BaseReq?) = Unit

  override fun onResp(response: BaseResp?) {
    if (response != null) IcaoWechatAuthCoordinator.handleResponse(response)
    finish()
  }
}
`;
}

function androidPaymentCallbackSource(packageName) {
  return androidCallbackSource(packageName)
    .replace('class WXEntryActivity', 'class WXPayEntryActivity')
    .replace('import com.icao.wechatauth.IcaoWechatAuthCoordinator', 'import com.icao.wechatauth.IcaoWechatAuthCoordinator\nimport com.icao.wechatauth.IcaoWechatPayCoordinator')
    .replace('IcaoWechatAuthCoordinator.handleResponse(response)', 'IcaoWechatPayCoordinator.handleResponse(response)');
}

module.exports = function withWechatAuth(config, properties) {
  const configuration = normalizedConfiguration(properties);
  config = withDangerousMod(config, ['ios', async (mod) => {
    await materializeNoPaySdk(mod.modRequest.projectRoot);
    return mod;
  }]);
  config = withInfoPlist(config, (mod) => {
    if (!configuration.appId) return mod;
    mod.modResults.ICAOWechatAppId = configuration.appId;
    mod.modResults.ICAOWechatUniversalLink = configuration.universalLink;
    mod.modResults.LSApplicationQueriesSchemes = [
      ...new Set([...(mod.modResults.LSApplicationQueriesSchemes || []), 'wechat', 'weixin', 'weixinULAPI']),
    ];
    const urlTypes = mod.modResults.CFBundleURLTypes || [];
    const withoutWechat = urlTypes.filter((entry) => entry.CFBundleURLName !== 'icao.wechat.auth');
    mod.modResults.CFBundleURLTypes = [
      ...withoutWechat,
      { CFBundleTypeRole: 'Editor', CFBundleURLName: 'icao.wechat.auth', CFBundleURLSchemes: [configuration.appId] },
    ];
    return mod;
  });
  config = withEntitlementsPlist(config, (mod) => {
    if (!configuration.universalLink) return mod;
    const host = new URL(configuration.universalLink).host;
    mod.modResults['com.apple.developer.associated-domains'] = addUnique(
      mod.modResults['com.apple.developer.associated-domains'],
      `applinks:${host}`,
    );
    return mod;
  });
  config = withAndroidManifest(config, (mod) => {
    if (!configuration.appId) return mod;
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);
    upsertAndroidManifestEntry(application, 'meta-data', {
      $: {
        'android:name': ANDROID_APP_ID_METADATA_KEY,
        'android:value': configuration.appId,
      },
    });
    upsertAndroidManifestEntry(application, 'activity', {
      $: {
        'android:name': `${config.android.package}.wxapi.WXEntryActivity`,
        'android:exported': 'true',
        'android:launchMode': 'singleTop',
        'android:taskAffinity': config.android.package,
        'android:theme': '@android:style/Theme.Translucent.NoTitleBar',
      },
    });
    upsertAndroidManifestEntry(application, 'activity', {
      $: {
        'android:name': `${config.android.package}.wxapi.WXPayEntryActivity`,
        'android:exported': 'true',
        'android:launchMode': 'singleTop',
        'android:taskAffinity': config.android.package,
        'android:theme': '@android:style/Theme.Translucent.NoTitleBar',
      },
    });
    const manifest = mod.modResults.manifest;
    const queries = manifest.queries || [{ package: [] }];
    const packages = queries[0].package || [];
    queries[0].package = [
      ...packages.filter((entry) => entry.$?.['android:name'] !== 'com.tencent.mm'),
      { $: { 'android:name': 'com.tencent.mm' } },
    ];
    manifest.queries = queries;
    return mod;
  });
  config = withGradleProperties(config, (mod) => {
    mod.modResults = upsertGradleProperty(
      mod.modResults,
      'android.enableMinifyInReleaseBuilds',
      'true',
    );
    mod.modResults = upsertGradleProperty(
      mod.modResults,
      'android.enableShrinkResourcesInReleaseBuilds',
      'true',
    );
    return mod;
  });
  config = withDangerousMod(config, ['android', (mod) => {
    if (!configuration.appId) return mod;
    const packageName = config.android?.package;
    if (!packageName) throw new Error('Android package is required for WeChat login');
    const sourceRoot = path.join(
      mod.modRequest.platformProjectRoot,
      'app',
      'src',
      'main',
      'java',
      ...packageName.split('.'),
      'wxapi',
    );
    fs.mkdirSync(sourceRoot, { recursive: true });
    fs.writeFileSync(path.join(sourceRoot, 'WXEntryActivity.kt'), androidCallbackSource(packageName));
    fs.writeFileSync(path.join(sourceRoot, 'WXPayEntryActivity.kt'), androidPaymentCallbackSource(packageName));
    return mod;
  }]);
  return config;
};

module.exports.SDK_SHA256 = SDK_SHA256;
module.exports.SDK_URL = SDK_URL;
module.exports.MATERIALIZED_SDK_SHA256 = MATERIALIZED_SDK_SHA256;
module.exports.verifyMaterializedNoPaySdk = verifyMaterializedNoPaySdk;

module.exports.androidPaymentCallbackSource = androidPaymentCallbackSource;
