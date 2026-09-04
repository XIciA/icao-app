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

const SDK_URL = 'https://dldir1.qq.com/WechatWebDev/opensdk/XCFramework/OpenSDK2.0.7_NoPay.zip';
const SDK_SHA256 = '882d99dabd26aceb6ad3e7a12c4b7da8a37626e68a04c8b89740c2275db24258';
const ARCHIVE_SDK_DIRECTORY = 'WechatOpenSDK-NoPay.xcframework';
// CocoaPods derives the linker framework name from the XCFramework directory.
// The approved NoPay archive's inner framework is named WechatOpenSDK, so the
// materialized directory must use that name even though the locked archive is
// explicitly the NoPay distribution.
const SDK_DIRECTORY = 'WechatOpenSDK.xcframework';
const ANDROID_APP_ID_METADATA_KEY = 'com.icao.wechatauth.APP_ID';
const MATERIALIZED_SDK_SHA256 = Object.freeze({
  'Info.plist': 'f8da2753bcf3448b3dce6813137b6e7e5850a6af52f08d07c9f449b4e25dbb8d',
  'PrivacyInfo.xcprivacy': 'dc8d7e1f9a7da7f3381f30746b59206ee62ce225b69fe3bcbb66234f8459be35',
  'README.txt': 'c67913985038c1024343beb0ed94ae2042947f3f1748e55d1b182ca29e85275b',
  'ios-arm64/WechatOpenSDK.framework/WechatOpenSDK': 'd762a75ab8129fe5331de39c3a01370dc3f0284897baefb6339422c56c668e45',
  'ios-arm64_x86_64-simulator/WechatOpenSDK.framework/WechatOpenSDK': '8bc77e5a56f9bdbaab69c51fae7b003f28ce64e21befcf0255fc8fde8a2b4b07',
});

function addUnique(values, value) {
  return [...new Set([...(values || []), value])];
}

function normalizedConfiguration(properties = {}) {
  const appId = String(properties.appId || '').trim();
  const universalLink = String(properties.universalLink || '').trim();
  if (Boolean(appId) !== Boolean(universalLink)) {
    throw new Error('ICAO_WECHAT_APP_ID and ICAO_WECHAT_UNIVERSAL_LINK must be configured together');
  }
  if (appId && !/^wx[0-9a-z]+$/iu.test(appId)) throw new Error('ICAO_WECHAT_APP_ID is invalid');
  if (universalLink) {
    const parsed = new URL(universalLink);
    if (parsed.protocol !== 'https:') throw new Error('ICAO_WECHAT_UNIVERSAL_LINK must use https');
    if (!parsed.pathname.endsWith('/') || parsed.search || parsed.hash) {
      throw new Error('ICAO_WECHAT_UNIVERSAL_LINK must be a query-free HTTPS directory ending in /');
    }
  }
  return { appId, universalLink };
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
    ...entries.filter((entry) => entry.$?.['android:name'] !== name),
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
    return mod;
  }]);
  return config;
};

module.exports.SDK_SHA256 = SDK_SHA256;
module.exports.SDK_URL = SDK_URL;
module.exports.MATERIALIZED_SDK_SHA256 = MATERIALIZED_SDK_SHA256;
module.exports.verifyMaterializedNoPaySdk = verifyMaterializedNoPaySdk;
