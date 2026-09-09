import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmod, cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUNTIME_CHECK = path.join(ROOT, 'tools/check-wechat-login-runtime.mjs');
const RELEASE_COMMON = path.join(ROOT, 'scripts/lib/release-common.sh');
const require = createRequire(import.meta.url);
const {
  normalizeWechatLoginCredentials,
  resolveWechatLoginReleaseCapability,
} = require('../config/release/wechat-login-contract.cjs');
const { androidPaymentCallbackSource } = require('../plugins/with-wechat-auth.js');

test('Android payment callback uses the payment coordinator without changing the login callback class', () => {
  const generated = androidPaymentCallbackSource('com.example.icao');
  assert.match(generated, /package com\.example\.icao\.wxapi/u);
  assert.match(generated, /class WXPayEntryActivity/u);
  assert.match(generated, /IcaoWechatPayCoordinator\.handleResponse\(response\)/u);
  assert.doesNotMatch(generated, /IcaoWechatAuthCoordinator\.handleResponse|class WXEntryActivity/u);
});

test('the shared WeChat release contract rejects ambiguous candidate credentials', () => {
  assert.deepEqual(resolveWechatLoginReleaseCapability({
    appId: null,
    schemaVersion: 1,
    status: 'WAITING_HUMAN',
    universalLink: null,
  }), {
    appId: '',
    enabled: false,
    mode: 'pending',
    universalLink: '',
  });
  assert.deepEqual(resolveWechatLoginReleaseCapability({
    appId: 'wx1234567890abcdef',
    schemaVersion: 1,
    status: 'approved',
    universalLink: 'https://api.readyoufife.com/wechat-auth/',
  }), {
    appId: 'wx1234567890abcdef',
    enabled: true,
    mode: 'approved',
    universalLink: 'https://api.readyoufife.com/wechat-auth/',
  });

  for (const configuration of [
    { appId: 'wxshort', universalLink: 'https://api.readyoufife.com/wechat-auth/' },
    { appId: 'wx1234567890abcdef', universalLink: 'http://api.readyoufife.com/wechat-auth/' },
    { appId: 'wx1234567890abcdef', universalLink: 'https://user:password@api.readyoufife.com/wechat-auth/' },
    { appId: 'wx1234567890abcdef', universalLink: 'https://api.readyoufife.com/wechat-auth/?mode=test' },
    { appId: 'wx1234567890abcdef', universalLink: 'https://api.readyoufife.com/wechat-auth/#callback' },
    { appId: 'wx1234567890abcdef', universalLink: 'https://api.readyoufife.com/wechat-auth' },
  ]) {
    assert.throws(() => normalizeWechatLoginCredentials(configuration));
  }
  assert.throws(() => resolveWechatLoginReleaseCapability({
    appId: 'wx1234567890abcdef',
    schemaVersion: 1,
    status: 'WAITING_HUMAN',
    universalLink: 'https://api.readyoufife.com/wechat-auth/',
  }));
});

test('the static WeChat runtime check resolves the repository from its own location', () => {
  const result = spawnSync(process.execPath, [RUNTIME_CHECK], {
    cwd: path.join(ROOT, 'modules/icao-wechat-auth/android'),
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Official WeChat SendAuth runtime verified \(static gate/u);
});

test('the iOS candidate audit requires the SendAuth source call and Objective-C metadata', () => {
  const result = spawnSync(process.execPath, [RUNTIME_CHECK, '--self-test-ios-macho-metadata'], {
    cwd: ROOT,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /iOS WeChat source and Mach-O metadata self-test passed/u);
});

test('the Android project helper injects the release Android environment from an android cwd', async () => {
  const fixtureRoot = await mkdtemp(path.join(tmpdir(), 'icao-wechat-release-helper-'));
  try {
    await mkdir(path.join(fixtureRoot, 'android'), { recursive: true });
    await mkdir(path.join(fixtureRoot, 'scripts'), { recursive: true });
    await mkdir(path.join(fixtureRoot, 'tools'), { recursive: true });
    await cp(path.join(ROOT, 'scripts/with-android-env.sh'), path.join(fixtureRoot, 'scripts/with-android-env.sh'));
    await chmod(path.join(fixtureRoot, 'scripts/with-android-env.sh'), 0o755);
    await writeFile(path.join(fixtureRoot, 'tools/check-wechat-login-runtime.mjs'), `
import assert from 'node:assert/strict';
import path from 'node:path';

assert.equal(process.argv[2], '--candidate-android-project');
assert.equal(path.basename(process.cwd()), 'android');
assert.ok(process.env.ANDROID_HOME, 'ANDROID_HOME was not injected');
assert.equal(process.env.ANDROID_SDK_ROOT, process.env.ANDROID_HOME);
assert.ok(process.env.JAVA_HOME, 'JAVA_HOME was not injected');
`, 'utf8');

    const result = spawnSync('/bin/sh', ['-c', `
set -eu
PROJECT_ROOT=$1
NODE_BINARY=$2
. "$3"
cd "$PROJECT_ROOT/android"
check_wechat_android_project
`, 'wechat-release-helper-test', fixtureRoot, process.execPath, RELEASE_COMMON], {
      encoding: 'utf8',
      env: {
        ...process.env,
        ANDROID_HOME: '',
        ANDROID_SDK_ROOT: '',
        JAVA_HOME: '',
      },
    });

    assert.equal(result.status, 0, result.stderr);
  } finally {
    await rm(fixtureRoot, { force: true, recursive: true });
  }
});
