import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateAppStoreEnvironment } from './check-app-store-environment.mjs';
import { resolveReleaseEnvironment } from './release-environment.mjs';

const identity = { head: 'source', archiveInfoSha256: 'archive', buildNumber: '123', bundleIdentifier: 'app.example' };
const candidate = { schemaVersion: 2, runtime: resolveReleaseEnvironment('production'), commitSha: 'source',
  archiveInfoSha256: 'archive', buildNumber: '123', bundleIdentifier: 'app.example' };
test('a tested production build can enter App Store handoff', () => validateAppStoreEnvironment(candidate, identity));
test('test-data builds and old evidence cannot be promoted to App Store', () => {
  assert.throws(() => validateAppStoreEnvironment({ ...candidate, runtime: { ...candidate.runtime, environment: 'testing' } }, identity), /requires_production_runtime/);
  assert.throws(() => validateAppStoreEnvironment({ ...candidate, runtime: { ...candidate.runtime, supabaseUrl: 'https://test.example.com' } }, identity), /requires_production_runtime/);
  assert.throws(() => validateAppStoreEnvironment({ ...candidate, schemaVersion: 1 }, identity), /runtime_evidence_required/);
  for (const key of ['head', 'archiveInfoSha256', 'buildNumber', 'bundleIdentifier']) {
    assert.throws(() => validateAppStoreEnvironment(candidate, { ...identity, [key]: 'wrong' }), /mismatch/);
  }
});
