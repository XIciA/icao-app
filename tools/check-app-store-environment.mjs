import assert from 'node:assert/strict';
import { readFileSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveReleaseEnvironment } from './release-environment.mjs';

export function validateAppStoreEnvironment(candidate, { head, archiveInfoSha256, buildNumber, bundleIdentifier }) {
  const production = resolveReleaseEnvironment('production');
  assert.equal(candidate.schemaVersion, 2, 'app_store_runtime_evidence_required');
  for (const key of ['environment', 'branch', 'apiUrl', 'supabaseUrl']) {
    assert.equal(candidate.runtime?.[key], production[key], `app_store_requires_production_runtime:${key}`);
  }
  assert.equal(candidate.commitSha, head, 'app_store_candidate_commit_mismatch');
  assert.equal(candidate.archiveInfoSha256, archiveInfoSha256, 'app_store_archive_evidence_mismatch');
  assert.equal(String(candidate.buildNumber), String(buildNumber), 'app_store_build_mismatch');
  assert.equal(candidate.bundleIdentifier, bundleIdentifier, 'app_store_bundle_mismatch');
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  if (!process.argv[2]) throw new Error('app_store_archive_path_required');
  const root = process.cwd();
  const candidate = JSON.parse(readFileSync(path.join(root, '.generated/testflight/candidate.json'), 'utf8'));
  const app = JSON.parse(readFileSync(path.join(root, 'app.json'), 'utf8')).expo;
  validateAppStoreEnvironment(candidate, {
    head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    archiveInfoSha256: createHash('sha256').update(readFileSync(path.join(process.argv[2], 'Info.plist'))).digest('hex'),
    buildNumber: app.ios.buildNumber, bundleIdentifier: app.ios.bundleIdentifier,
  });
  console.log('App Store candidate is bound to the production environment and exact archive.');
}
