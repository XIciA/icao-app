import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { assertAndroidReleaseWechatArtifact, verifyAndroidReleaseWechatArtifact } from './android-release-wechat-contract.mjs';

const require = createRequire(import.meta.url);
const fromExpo = createRequire(require.resolve('expo/package.json'));
const fromConfigPlugins = createRequire(fromExpo.resolve('@expo/config-plugins/package.json'));
const { Builder } = fromConfigPlugins('xml2js');
const wechat = require('../plugins/with-wechat-auth.js');
const release = require('../config/release/wechat-login.json');
const app = require('../app.json').expo;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const approvedPackage = release.android.packageName;
// Public fields returned by the server and payment bridge names are valid in Android.
const paymentBundle = 'const request = { merchantId: response.partnerId }; native.PayReq(request); // WXPayEntryActivity wechat-pay';

async function generatedManifest(enabled = true) {
  const config = wechat(structuredClone(app), enabled ? {
    appId: release.appId, universalLink: release.universalLink,
  } : {});
  const result = await config.mods.android.manifest({ ...config, modRequest: {}, modResults: {
    manifest: { $: { package: approvedPackage, 'xmlns:android': 'http://schemas.android.com/apk/res/android' }, application: [{ $: { 'android:name': '.MainApplication' } }] },
  } });
  return result.modResults;
}
function input(manifest, overrides = {}) {
  return { bundle: paymentBundle, manifestXml: new Builder().buildObject(manifest), applicationId: approvedPackage,
    releaseConfiguration: release, ...overrides };
}
function paymentActivity(manifest) {
  return manifest.manifest.application[0].activity.find(entry => entry.$['android:name'].endsWith('.WXPayEntryActivity'));
}
const pendingRelease = { ...release, status: 'WAITING_HUMAN', appId: null, universalLink: null };

test('the real Android plugin output permits approved login and APP payment without merchant credentials', async () => {
  const manifest = await generatedManifest();
  assert.equal(manifest.manifest.application[0].activity.length, 2);
  await assertAndroidReleaseWechatArtifact(input(manifest));
});

test('Android artifacts reject unapproved package, AppID, duplicate metadata and callback identities', async () => {
  for (const mutate of [
    value => { value.manifest.$.package = 'com.unapproved.app'; },
    value => { value.manifest.application[0]['meta-data'][0].$['android:value'] = 'wx1234567890abcdef'; },
    value => { value.manifest.application[0]['meta-data'].push(structuredClone(value.manifest.application[0]['meta-data'][0])); },
    value => { paymentActivity(value).$['android:name'] = 'com.unapproved.app.wxapi.WXPayEntryActivity'; },
    value => { value.manifest.application[0].activity.push(structuredClone(paymentActivity(value))); },
    value => { value.manifest.application[0].activity = value.manifest.application[0].activity.filter(entry => !entry.$['android:name'].endsWith('.WXPayEntryActivity')); },
    value => { value.manifest.application[0]['activity-alias'] = [{ $: { 'android:name': '.AnotherEntry', 'android:targetActivity': `${approvedPackage}.wxapi.WXPayEntryActivity` } }]; },
  ]) {
    const manifest = await generatedManifest();
    mutate(manifest);
    await assert.rejects(assertAndroidReleaseWechatArtifact(input(manifest)), /candidate_android_(?:application_id|wechat_app_id|wechat_callback)_mismatch/u);
  }
  await assert.rejects(assertAndroidReleaseWechatArtifact(input(await generatedManifest(), { applicationId: 'com.other.app' })), /application_id_mismatch/u);
});

test('Android callbacks must retain the approved exported singleTop identity without intent filters', async () => {
  for (const mutate of [
    entry => { entry.$['android:exported'] = 'false'; },
    entry => { entry.$['android:launchMode'] = 'standard'; },
    entry => { entry.$['android:taskAffinity'] = 'com.other.app'; },
    entry => { entry.$['android:enabled'] = 'false'; },
    entry => { entry.$['android:permission'] = 'com.other.permission'; },
    entry => { entry['intent-filter'] = [{ action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }] }]; },
  ]) {
    const manifest = await generatedManifest();
    mutate(paymentActivity(manifest));
    await assert.rejects(assertAndroidReleaseWechatArtifact(input(manifest)), /callback_attributes_mismatch/u);
  }
});

test('pending Android releases contain neither configured login nor payment callbacks', async () => {
  const empty = await generatedManifest(false);
  await assertAndroidReleaseWechatArtifact(input(empty, { releaseConfiguration: pendingRelease }));
  for (const name of ['WXEntryActivity', 'WXPayEntryActivity']) {
    const manifest = structuredClone(empty);
    manifest.manifest.application[0].activity = [{ $: { 'android:name': `${approvedPackage}.wxapi.${name}` } }];
    await assert.rejects(assertAndroidReleaseWechatArtifact(input(manifest, { releaseConfiguration: pendingRelease })), /pending_android_artifact_exposes_wechat_configuration/u);
  }
  await assert.rejects(assertAndroidReleaseWechatArtifact(input(await generatedManifest(), { releaseConfiguration: pendingRelease })), /pending_android_artifact_exposes_wechat_configuration/u);
});

test('Android payment permission does not admit client secrets, embedded merchant config or other SDKs', async () => {
  const manifest = await generatedManifest();
  for (const bundle of ['WECHAT_APP_SECRET', 'EXPO_PUBLIC_WECHAT_APP_SECRET', 'WECHAT_PAY_API_V3_KEY', 'WECHAT_PAY_MERCHANT_PRIVATE_KEY', '-----BEGIN PRIVATE KEY-----']) {
    await assert.rejects(assertAndroidReleaseWechatArtifact(input(manifest, { bundle })), /client_secret_marker/u);
  }
  for (const bundle of ['com.tencent.mm.opensdk:wechat-sdk-android-with-mta:6.8.0', 'WechatOpenSDK_WithPay']) {
    await assert.rejects(assertAndroidReleaseWechatArtifact(input(manifest, { bundle })), /unapproved_sdk_marker/u);
  }
  manifest.manifest.application[0]['meta-data'].push({ $: { 'android:name': 'mch_id', 'android:value': 'test-only' } });
  await assert.rejects(assertAndroidReleaseWechatArtifact(input(manifest)), /payment_credentials_in_manifest/u);
});

test('candidate artifact extraction validates the actual zip bundle and decoded manifest', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'icao-android-wechat-'));
  try {
    const artifact = path.join(directory, 'candidate.apk');
    const analyzer = path.join(directory, 'apkanalyzer');
    const manifestFile = path.join(directory, 'manifest.xml');
    await mkdir(path.join(directory, 'assets'));
    await writeFile(path.join(directory, 'assets/index.android.bundle'), paymentBundle);
    await writeFile(manifestFile, input(await generatedManifest()).manifestXml);
    await writeFile(analyzer, `#!${process.execPath}\nconst fs = require('node:fs');\nif (process.argv[2] !== 'manifest' || process.argv[4] !== ${JSON.stringify(artifact)}) process.exit(2);\nif (process.argv[3] === 'print') process.stdout.write(fs.readFileSync(${JSON.stringify(manifestFile)}, 'utf8'));\nelse if (process.argv[3] === 'application-id') process.stdout.write(${JSON.stringify(approvedPackage)});\nelse process.exit(2);\n`);
    await chmod(analyzer, 0o755);
    execFileSync('zip', ['-q', artifact, 'assets/index.android.bundle'], { cwd: directory });
    await verifyAndroidReleaseWechatArtifact(artifact, { analyzer, releaseConfiguration: release });
    const invalid = await generatedManifest();
    paymentActivity(invalid).$['android:name'] = 'com.other.app.wxapi.WXPayEntryActivity';
    await writeFile(manifestFile, input(invalid).manifestXml);
    await assert.rejects(verifyAndroidReleaseWechatArtifact(artifact, { analyzer, releaseConfiguration: release }), /callback_mismatch/u);
    await writeFile(manifestFile, input(await generatedManifest()).manifestXml);
    await writeFile(path.join(directory, 'assets/index.android.bundle'), 'WECHAT_PAY_API_V3_KEY');
    execFileSync('zip', ['-q', artifact, 'assets/index.android.bundle'], { cwd: directory });
    await assert.rejects(verifyAndroidReleaseWechatArtifact(artifact, { analyzer, releaseConfiguration: release }), /client_secret_marker/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('the runtime gate delegates Android artifact validation and preserves the iOS payment scanner', async () => {
  const source = await readFile(path.join(ROOT, 'tools/check-wechat-login-runtime.mjs'), 'utf8');
  assert.match(source, /await verifyAndroidReleaseWechatArtifact\(androidArtifact, \{[\s\S]*?releaseConfiguration: approvedRelease/u);
  const markers = source.match(/const forbiddenPaymentMarkers = \[[\s\S]*?\n\];/u)?.[0];
  const scanner = source.match(/for \(const marker of forbiddenPaymentMarkers\) \{\s*if \(marker\.test\(bundle\)\) fail\('candidate_ios_reachable_payment_marker'\);\s*\}/u)?.[0];
  assert.ok(markers && scanner, 'the iOS artifact must retain its existing full payment marker scanner');
  for (const bundle of ['PayReq', 'PayResp', 'WXPay', 'WXPayEntryActivity', 'merchantId', 'mch_id', 'WechatOpenSDK_WithPay', 'wechat-pay', 'wx-pay']) {
    assert.throws(() => vm.runInNewContext(`${markers}\n${scanner}`, { bundle, fail: reason => { throw new Error(reason); } }), /candidate_ios_reachable_payment_marker/u);
  }
  vm.runInNewContext(`${markers}\n${scanner}`, { bundle: 'SendAuthReq', fail: assert.fail });
});


test('the existing Android SDK checks reject versioned MTA coordinates in source and resolved dependencies', async () => {
  const source = await readFile(path.join(ROOT, 'tools/check-wechat-login-runtime.mjs'), 'utf8');
  for (const variable of ['androidBuild', 'dependencyReport']) {
    const line = source.split('\n').find(value => value.includes(`.test(${variable})) fail('`) && value.includes('wechat-sdk-android-with-mta'));
    assert.ok(line, `the ${variable} tracking SDK guard must remain present`);
    const run = value => vm.runInNewContext(line, { [variable]: value, fail: reason => { throw new Error(reason); } });
    run('com.tencent.mm.opensdk:wechat-sdk-android-without-mta:6.8.0');
    assert.throws(() => run('com.tencent.mm.opensdk:wechat-sdk-android-with-mta:6.8.0'), /android_(?:tracking_sdk_present|tracking_sdk_resolved)/u);
  }
});
