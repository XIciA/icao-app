import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { resolveReleaseEnvironment, validateRuntimeValues } from './release-environment.mjs';
import { validateReleaseSource } from './check-release-source.mjs';

const production = { branch: 'main', apiUrl: 'https://api.readyoufife.com', supabaseUrl: 'https://cloud.readyoufife.com' };
const testing = { branch: 'develop', ready: true, pending: [], apiUrl: 'https://test-api.example.com', supabaseUrl: 'https://test-cloud.example.com' };
const config = { schemaVersion: 1, production, testing };

test('testing is blocked until server and client isolation are verified', () => {
  assert.throws(() => resolveReleaseEnvironment('testing', { ...config, testing: { ...testing, ready: false } }), /testing_runtime_not_ready/);
  assert.throws(() => resolveReleaseEnvironment('testing', { ...config, testing: { ...testing, pending: ['cache isolation'] } }), /testing_runtime_not_ready/);
});
test('production and testing select exactly one branch and endpoint pair', () => {
  for (const environment of ['production', 'testing']) {
    const target = resolveReleaseEnvironment(environment, config);
    const state = { branch: target.branch, head: 'abc', remoteHead: 'abc', dirty: false };
    validateReleaseSource(state, target);
    for (const branch of ['feature/example', '', environment === 'production' ? 'develop' : 'main']) {
      assert.throws(() => validateReleaseSource({ ...state, branch }, target), /release_source_requires/);
    }
    assert.throws(() => validateReleaseSource({ ...state, dirty: true }, target), /release_source_dirty/);
    assert.throws(() => validateReleaseSource({ ...state, remoteHead: '' }, target), /missing/);
    assert.throws(() => validateReleaseSource({ ...state, remoteHead: 'other' }, target), /not_origin/);
    validateRuntimeValues(target, { EXPO_PUBLIC_ICAO_API_URL: target.apiUrl, EXPO_PUBLIC_SUPABASE_URL: target.supabaseUrl, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'fixture-public-key' });
  }
});
test('testing cannot use either production service, including swapped endpoints', () => {
  for (const key of ['apiUrl', 'supabaseUrl']) {
    for (const value of [production.apiUrl, production.supabaseUrl]) {
      assert.throws(() => resolveReleaseEnvironment('testing', { ...config, testing: { ...testing, [key]: value } }), /points_to_production/);
    }
  }
  assert.throws(() => validateRuntimeValues(resolveReleaseEnvironment('testing', config), {
    EXPO_PUBLIC_ICAO_API_URL: production.apiUrl, EXPO_PUBLIC_SUPABASE_URL: production.supabaseUrl,
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'fixture-public-key',
  }), /does_not_match/);
});
test('invalid environments and non-origin URLs fail closed', () => {
  for (const environment of ['', undefined, 'develop', 'test', 'Production']) {
    assert.throws(() => resolveReleaseEnvironment(environment, config), /environment_invalid/);
  }
  for (const apiUrl of [null, 'http://test.example.com', 'https://test.example.com/', 'https://user:pass@test.example.com', 'https://test.example.com/path']) {
    assert.throws(() => resolveReleaseEnvironment('testing', { ...config, testing: { ...testing, apiUrl } }), /url_invalid/);
  }
});


test('shell runtime cannot fall back to production credentials for incomplete testing', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'icao-runtime-test-'));
  try {
    mkdirSync(path.join(root, 'tools'));
    mkdirSync(path.join(root, 'config/release'), { recursive: true });
    copyFileSync(new URL('./release-environment.mjs', import.meta.url), path.join(root, 'tools/release-environment.mjs'));
    writeFileSync(path.join(root, 'config/release/environments.json'), JSON.stringify({ ...config, testing: { ...testing, ready: false } }));
    const helper = new URL('../scripts/lib/release-common.sh', import.meta.url).pathname;
    const result = spawnSync('/bin/sh', ['-eu', '-c', '. "$1"; load_release_runtime', 'test', helper], {
      encoding: 'utf8', env: { PATH: process.env.PATH, PROJECT_ROOT: root, ICAO_RELEASE_ENVIRONMENT: 'testing' },
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /testing_runtime_not_ready/);
    assert.doesNotMatch(result.stderr, /Project SSH key|Permission denied|connect to host/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
