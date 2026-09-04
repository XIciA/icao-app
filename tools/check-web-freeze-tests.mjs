import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { assertNativeBuildOnlyAppJsonDelta } from './check-web-freeze.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cliPath = path.join(repositoryRoot, 'tools/check-web-freeze.mjs');

function runCli(fixtureRoot, args) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: fixtureRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      ICAO_WEB_FREEZE_TEST_ROOT: fixtureRoot,
    },
  });
}

function requireSuccess(result, label) {
  assert.equal(
    result.status,
    0,
    `${label}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
}

test('the stale absolute baseline can pass only through the exact reviewed Native-only increment', () => {
  const result = spawnSync(process.execPath, [cliPath, '--explain'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: process.env,
  });
  requireSuccess(result, 'strict Native-only incremental proof failed');
  assert.match(result.stdout, /6 exact reviewed deltas/u);
  assert.match(result.stdout, /app\.json: identical after removing the matching Native build identifiers/u);
  assert.match(result.stdout, /contracts index: identical emitted JavaScript/u);
});

test('the Native app config proof accepts only matching advanced build identifiers', () => {
  const base = {
    expo: {
      name: '听你五个',
      ios: { buildNumber: '3493764', bundleIdentifier: 'com.readyoufife.ios' },
      android: { versionCode: 3493764, package: 'com.readyoufife.app' },
      web: { output: 'single' },
    },
  };
  const candidate = structuredClone(base);
  candidate.expo.ios.buildNumber = '3493765';
  candidate.expo.android.versionCode = 3493765;
  assert.doesNotThrow(() => assertNativeBuildOnlyAppJsonDelta(base, candidate));

  const webMutation = structuredClone(candidate);
  webMutation.expo.web.output = 'static';
  assert.throws(
    () => assertNativeBuildOnlyAppJsonDelta(base, webMutation),
    /changes more than the reviewed Native build identifiers/u,
  );

  const mismatchedBuild = structuredClone(candidate);
  mismatchedBuild.expo.android.versionCode = 3493766;
  assert.throws(
    () => assertNativeBuildOnlyAppJsonDelta(base, mismatchedBuild),
    /matching iOS and Android build identifiers/u,
  );
});

test('the real Web resolver and CLI protect every selected input without post-filtering', () => {
  const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), 'icao-web-freeze-'));
  const fixtureRoot = path.join(temporaryRoot, 'fixture');
  const fixtureDirectory = path.join(fixtureRoot, 'src/__web_freeze_fixture__');
  const fixtureManifest = path.join(temporaryRoot, 'manifest.json');
  const worktree = spawnSync(
    'git',
    ['worktree', 'add', '--detach', fixtureRoot, 'HEAD'],
    { cwd: repositoryRoot, encoding: 'utf8' },
  );
  requireSuccess(worktree, 'failed to create the isolated Web freeze fixture worktree');

  try {
    symlinkSync(path.join(repositoryRoot, 'node_modules'), path.join(fixtureRoot, 'node_modules'), 'dir');
    mkdirSync(fixtureDirectory, { recursive: true });
    writeFileSync(
      path.join(fixtureDirectory, 'entry.ts'),
      "import { selected } from './selected';\nimport { explicit } from './explicit.native';\nexport const fixture = `${selected}:${explicit}`;\n",
    );
    writeFileSync(path.join(fixtureDirectory, 'selected.ts'), "export const selected = 'web';\n");
    writeFileSync(path.join(fixtureDirectory, 'selected.native.ts'), "export const selected = 'native';\n");
    writeFileSync(path.join(fixtureDirectory, 'explicit.native.ts'), "export const explicit = 'explicit';\n");
    appendFileSync(path.join(fixtureRoot, 'index.js'), "\nimport './src/__web_freeze_fixture__/entry';\n");

    const snapshotResult = runCli(fixtureRoot, ['--print-snapshot']);
    requireSuccess(snapshotResult, 'real Web graph snapshot failed');
    const snapshot = JSON.parse(snapshotResult.stdout);
    const selectedPaths = new Set(snapshot.files.map((file) => file.path));
    assert.equal(selectedPaths.has('src/__web_freeze_fixture__/selected.ts'), true);
    assert.equal(selectedPaths.has('src/__web_freeze_fixture__/selected.native.ts'), false);
    assert.equal(
      selectedPaths.has('src/__web_freeze_fixture__/explicit.native.ts'),
      true,
      'an explicitly imported platform-suffixed dependency must not be post-filtered',
    );
    assert.equal(
      selectedPaths.has('assets/images/icon.png'),
      true,
      'the shared product master must remain an exact Web freeze input',
    );
    writeFileSync(fixtureManifest, JSON.stringify(snapshot));

    requireSuccess(
      runCli(fixtureRoot, ['--manifest', fixtureManifest]),
      'unchanged fixture must pass the CLI',
    );

    appendFileSync(path.join(fixtureDirectory, 'selected.native.ts'), '// Native fallback only\n');
    requireSuccess(
      runCli(fixtureRoot, ['--manifest', fixtureManifest]),
      'an unselected Native fallback change must not affect the Web freeze',
    );

    appendFileSync(path.join(fixtureDirectory, 'selected.ts'), '// real Web behavior change\n');
    const webMutation = runCli(fixtureRoot, ['--manifest', fixtureManifest]);
    assert.equal(webMutation.status, 1);
    assert.match(webMutation.stderr, /content changed: src\/__web_freeze_fixture__\/selected\.ts/u);
    writeFileSync(path.join(fixtureDirectory, 'selected.ts'), "export const selected = 'web';\n");

    const iconPath = path.join(fixtureRoot, 'assets/images/icon.png');
    const icon = readFileSync(iconPath);
    appendFileSync(iconPath, Buffer.from([0]));
    const sharedLogoMutation = runCli(fixtureRoot, ['--manifest', fixtureManifest]);
    assert.equal(sharedLogoMutation.status, 1);
    assert.match(sharedLogoMutation.stderr, /content changed: assets\/images\/icon\.png/u);
    writeFileSync(iconPath, icon);
  } finally {
    spawnSync('git', ['worktree', 'remove', '--force', fixtureRoot], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    });
    rmSync(temporaryRoot, { force: true, recursive: true });
  }
});
