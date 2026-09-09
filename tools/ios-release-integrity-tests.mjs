import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { assertIosReleaseWechatPlist, verifyGeneratedIosWechatPlist } from './ios-release-plist-contract.mjs';

const require = createRequire(import.meta.url);
const fromExpo = createRequire(require.resolve('expo/package.json'));
const plist = fromExpo('@expo/plist').default;
const integrity = require('../plugins/with-ios-release-integrity.js');
const wechat = require('../plugins/with-wechat-auth.js');
const app = require('../app.json').expo;
const release = require('../config/release/wechat-login.json');
const credentials = { appId: release.appId, universalLink: release.universalLink };
const integrityName = './plugins/with-ios-release-integrity';
const wechatName = './plugins/with-wechat-auth';
const dirtyPlist = {
  CFBundleDisplayName: '听你五个',
  CFBundleURLTypes: [
    { CFBundleURLSchemes: ['readyoufife', 'readyoufife-dev', 'exp+readyoufife', app.ios.bundleIdentifier] },
    { CFBundleURLName: 'old.wechat', CFBundleURLSchemes: ['wxobsolete123456'] },
  ],
};

async function composedInfoPlist(order, options = credentials, initial = dirtyPlist) {
  let config = {
    ...structuredClone(app),
    plugins: order.map(name => name === wechatName ? [name, options] : name),
  };
  for (const name of order) config = name === wechatName ? wechat(config, options) : integrity(config);
  // Execute Expo's actual chained Info.plist mod, including its reverse-order
  // nextMod calls. No SDK download, Xcode project generation or mock callbacks.
  const result = await config.mods.ios.infoPlist({ ...config, modResults: structuredClone(initial), modRequest: {} });
  return result.modResults;
}

for (const [label, order] of [
  ['release-integrity then WeChat (the production registration order)', [integrityName, wechatName]],
  ['WeChat then release-integrity', [wechatName, integrityName]],
]) {
  test(`actual plugin composition retains approved schemes: ${label}`, async () => {
    const result = await composedInfoPlist(order);
    assert.deepEqual(result.CFBundleURLTypes.flatMap(entry => entry.CFBundleURLSchemes), ['readyoufife', credentials.appId]);
    assert.equal(result.CFBundleDisplayName, '听你五个');
    assertIosReleaseWechatPlist(result, app.scheme, release);
    assert.deepEqual(await composedInfoPlist(order, credentials, result), result, 'running the composed mods again must be idempotent');
  });
  test(`unconfigured WeChat removes stale and development schemes: ${label}`, async () => {
    const result = await composedInfoPlist(order, {});
    assert.deepEqual(result.CFBundleURLTypes, [{ CFBundleURLSchemes: ['readyoufife'] }]);
  });
}

test('arbitrary plist schemes and environment values cannot become release allowlist entries', async () => {
  const original = process.env.ICAO_WECHAT_APP_ID;
  try {
    process.env.ICAO_WECHAT_APP_ID = 'wxunapproved123456';
    const result = await composedInfoPlist([integrityName, wechatName], {}, {
      ...dirtyPlist, ICAOWechatAppId: 'wxunapproved123456',
    });
    assert.deepEqual(result.CFBundleURLTypes, [{ CFBundleURLSchemes: ['readyoufife'] }]);
  } finally {
    if (original === undefined) delete process.env.ICAO_WECHAT_APP_ID;
    else process.env.ICAO_WECHAT_APP_ID = original;
  }
  await assert.rejects(composedInfoPlist([integrityName, wechatName], {
    ...credentials, appId: 'wxunapproved123456',
  }), /rejects unapproved WeChat/u);
  await assert.rejects(composedInfoPlist([integrityName, wechatName], {
    ...credentials, universalLink: 'https://unapproved.example/wechat/',
  }), /rejects unapproved WeChat/u);
});

test('the generated plist contract rejects missing, duplicate, stale and development schemes', async () => {
  const good = await composedInfoPlist([integrityName, wechatName]);
  for (const schemes of [
    ['readyoufife'],
    ['readyoufife', credentials.appId, credentials.appId],
    ['readyoufife', 'wxobsolete123456'],
    ['readyoufife', credentials.appId, 'readyoufife-dev'],
    ['readyoufife', credentials.appId, 'exp+readyoufife'],
    ['readyoufife', credentials.appId, app.ios.bundleIdentifier],
  ]) {
    assert.throws(() => assertIosReleaseWechatPlist({
      ...good, CFBundleURLTypes: [{ CFBundleURLSchemes: schemes }],
    }, app.scheme, release), /url_schemes_mismatch/u);
  }
  const pending = { schemaVersion: 1, status: 'WAITING_HUMAN', appId: null, universalLink: null };
  assert.doesNotThrow(() => assertIosReleaseWechatPlist({
    CFBundleURLTypes: [{ CFBundleURLSchemes: ['readyoufife'] }],
  }, app.scheme, pending));
  assert.throws(() => assertIosReleaseWechatPlist(good, app.scheme, pending), /url_schemes_mismatch/u);
});

test('the pre-archive gate reads actual generated Info.plist rather than app config intentions', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'icao-ios-generated-plist-'));
  try {
    await mkdir(path.join(root, 'config/release'), { recursive: true });
    await mkdir(path.join(root, 'ios/app'), { recursive: true });
    await writeFile(path.join(root, 'app.json'), JSON.stringify({ expo: app }));
    await writeFile(path.join(root, 'config/release/wechat-login.json'), JSON.stringify(release));
    const infoPath = path.join(root, 'ios/app/Info.plist');
    const good = await composedInfoPlist([integrityName, wechatName]);
    await writeFile(infoPath, plist.build(good));
    assert.equal(await verifyGeneratedIosWechatPlist(root), infoPath);
    // Reproduce the archived failure: credentials survive but the later plugin
    // overwrites URL types to just readyoufife.
    await writeFile(infoPath, plist.build({ ...good, CFBundleURLTypes: [{ CFBundleURLSchemes: ['readyoufife'] }] }));
    await assert.rejects(verifyGeneratedIosWechatPlist(root), /candidate_ios_url_schemes_mismatch/u);
    await rm(infoPath);
    await assert.rejects(verifyGeneratedIosWechatPlist(root));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('existing candidate-config invokes generated plist verification before the network checks', async () => {
  const source = await readFile(new URL('./check-wechat-login-runtime.mjs', import.meta.url), 'utf8');
  const invocation = source.indexOf('await verifyGeneratedIosWechatPlist(ROOT)');
  assert.ok(invocation > source.indexOf('if (candidateConfiguration)'));
  assert.ok(invocation < source.indexOf('const aasaResponse = await fetch'));
  assert.match(source, /process\.argv\.includes\('--candidate-config'\)\) \{\s*await verifyGeneratedIosWechatPlist\(ROOT\)/u);
});
