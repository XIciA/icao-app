import { access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const fromExpo = createRequire(require.resolve('expo/package.json'));
const fromConfigPlugins = createRequire(fromExpo.resolve('@expo/config-plugins/package.json'));
const { parseStringPromise } = fromConfigPlugins('xml2js');
const { resolveWechatLoginReleaseCapability } = require('../config/release/wechat-login-contract.cjs');
const appIdMetadata = 'com.icao.wechatauth.APP_ID';

function fail(reason) {
  throw new Error(`wechat_login_runtime:${reason}`);
}

export async function assertAndroidReleaseWechatArtifact({ bundle, manifestXml, applicationId, releaseConfiguration }) {
  const capability = resolveWechatLoginReleaseCapability(releaseConfiguration);
  // Android's approved SDK includes APP payment. Public PayReq/merchant identifiers
  // are legitimate runtime inputs; credentials and alternate SDKs remain forbidden.
  if (/WECHAT_APP_SECRET|EXPO_PUBLIC_[A-Z0-9_]*WECHAT[A-Z0-9_]*SECRET|WECHAT_PAY_(?:API_V3_KEY|MERCHANT_PRIVATE_KEY)|-----BEGIN (?:RSA |EC |ENCRYPTED )?PRIVATE KEY-----/u.test(`${bundle}\n${manifestXml}`)) {
    fail('candidate_android_client_secret_marker');
  }
  if (/wechat-sdk-android-with-mta\b|WechatOpenSDK_WithPay/iu.test(bundle)) {
    fail('candidate_android_unapproved_sdk_marker');
  }
  const { manifest } = await parseStringPromise(manifestXml);
  const approvedPackage = releaseConfiguration.android?.packageName;
  if (!approvedPackage || applicationId !== approvedPackage || manifest?.$?.package !== approvedPackage) {
    fail('candidate_android_application_id_mismatch');
  }
  if (manifest.application?.length !== 1) fail('candidate_android_application_invalid');
  const application = manifest.application[0];
  const metadata = (application['meta-data'] || []).filter(entry => entry.$?.['android:name'] === appIdMetadata);
  const components = [...(application.activity || []), ...(application['activity-alias'] || [])];
  const callbacks = components.filter(entry => /WX(?:Pay)?EntryActivity/u.test(JSON.stringify(entry.$)));
  if (/merchant[_-]?(?:id|key)|mch[_-]?id/iu.test(manifestXml)) {
    fail('candidate_android_payment_credentials_in_manifest');
  }
  if (!capability.enabled) {
    if (manifestXml.includes(appIdMetadata) || /WX(?:Pay)?EntryActivity/u.test(manifestXml)) {
      fail('pending_android_artifact_exposes_wechat_configuration');
    }
    return;
  }
  if (metadata.length !== 1 || metadata[0].$?.['android:value'] !== capability.appId) {
    fail('candidate_android_wechat_app_id_mismatch');
  }
  const expectedNames = ['WXEntryActivity', 'WXPayEntryActivity'].map(name => `${approvedPackage}.wxapi.${name}`);
  if (callbacks.length !== expectedNames.length) fail('candidate_android_wechat_callback_mismatch');
  for (const name of expectedNames) {
    const matches = (application.activity || []).filter(entry => entry.$?.['android:name'] === name);
    if (matches.length !== 1) fail('candidate_android_wechat_callback_mismatch');
    const callback = matches[0];
    const attributes = callback.$;
    if (attributes['android:exported'] !== 'true' || attributes['android:launchMode'] !== 'singleTop'
        || attributes['android:taskAffinity'] !== approvedPackage || attributes['android:enabled'] === 'false'
        || attributes['android:permission'] || callback['intent-filter']?.length) {
      fail('candidate_android_wechat_callback_attributes_mismatch');
    }
  }
}

export async function verifyAndroidReleaseWechatArtifact(artifactPath, { analyzer, releaseConfiguration }) {
  const artifact = path.resolve(artifactPath);
  await access(artifact);
  const entries = execFileSync('unzip', ['-Z1', artifact], { encoding: 'utf8' }).split('\n');
  const bundles = entries.filter(entry => /(^|\/)index\.android\.bundle$/u.test(entry));
  if (bundles.length !== 1) fail('candidate_android_javascript_bundle_missing_or_ambiguous');
  const bundle = execFileSync('unzip', ['-p', artifact, bundles[0]], { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });
  if (!analyzer) fail('candidate_android_apkanalyzer_missing');
  const manifestXml = execFileSync(analyzer, ['manifest', 'print', artifact], { encoding: 'utf8' });
  const applicationId = execFileSync(analyzer, ['manifest', 'application-id', artifact], { encoding: 'utf8' }).trim();
  await assertAndroidReleaseWechatArtifact({ bundle, manifestXml, applicationId, releaseConfiguration });
}
