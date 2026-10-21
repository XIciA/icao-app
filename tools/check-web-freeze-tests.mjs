import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
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
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { assertNativeBuildOnlyAppJsonDelta, assertReviewedNativeStudyRouteDelta, normalizeReviewedFormalWebInputs, readNativeBuildReference } from './check-web-freeze.mjs';

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

test('the approved Vercel snapshot matches exactly apart from verified Native build identifiers', () => {
  const result = spawnSync(process.execPath, [cliPath, '--explain'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: process.env,
  });
  requireSuccess(result, 'approved Vercel snapshot no longer matches');
  assert.match(result.stdout, /Web freeze check passed: \d+ protected files match the baseline(?:\.| exactly; (?:app\.json differs only in matching advanced Native build identifiers|one exact reviewed Native study route delta, unchanged Web sibling and verified Native build identifiers)\.)/u);
  assert.doesNotMatch(result.stdout, /Native-only increment proof/u);
});

test('the reviewed Native study route delta keeps exact content, Web sibling and every other protected input pinned', () => {
  const expected = JSON.parse(readFileSync(path.join(repositoryRoot,
    'docs/records/workstreams/native-commercial-launch/evidence/web-freeze-manifest.json'), 'utf8')).files;
  const nativePath = 'src/app/question-bank/[bankId]/study/[categoryId]/[topicId].native.tsx';
  const webPath = nativePath.replace('.native.tsx', '.tsx');
  const current = expected.map((file) => file.path === nativePath
    ? { ...file, sha256: createHash('sha256').update(readFileSync(path.join(repositoryRoot, nativePath))).digest('hex') }
    : { ...file });
  assert.deepEqual(assertReviewedNativeStudyRouteDelta(expected, current), [nativePath]);
  for (const alteredPath of [nativePath, webPath, 'app.config.js']) {
    const altered = current.map(file => file.path === alteredPath ? { ...file, sha256: '0'.repeat(64) } : file);
    assert.throws(() => assertReviewedNativeStudyRouteDelta(expected, altered), /unreviewed|exact reviewed/u);
  }
  assert.throws(() => assertReviewedNativeStudyRouteDelta(expected, current.concat({
    path: 'src/app/other.native.tsx', sha256: '0'.repeat(64), sources: ['metro_web_dependency_graph'],
  })), /unreviewed/u);
  assert.throws(() => assertReviewedNativeStudyRouteDelta(expected, current.filter(file => file.path !== webPath)), /unreviewed/u);
  assert.throws(() => assertReviewedNativeStudyRouteDelta(expected, current.map(file => file.path === nativePath
    ? { ...file, sources: ['explicit_web_import'] } : file)), /unreviewed/u);
});

test('the reviewed Native study route is included in context but selected only on iOS and Android by the installed router', () => {
  const require = createRequire(import.meta.url);
  const { getRoutes } = require('expo-router/build/getRoutesCore');
  const nativeKey = './question-bank/[bankId]/study/[categoryId]/[topicId].native.tsx';
  const webKey = nativeKey.replace('.native.tsx', '.tsx');
  for (const platform of ['web', 'ios', 'android']) {
    const loaded = [];
    const context = key => { loaded.push(key); return { default: () => null }; };
    context.keys = () => ['./_layout.tsx', webKey, nativeKey];
    const routes = getRoutes(context, {
      platform, ignoreEntryPoints: true, skipGenerated: true, getSystemRoute: ({ defaults }) => defaults,
    });
    const selected = platform === 'web' ? webKey : nativeKey;
    assert.equal(routes.children.length, 1);
    assert.equal(routes.children[0].contextKey, selected);
    routes.children[0].loadRoute();
    assert.equal(loaded.includes(selected), true);
    assert.equal(loaded.includes(platform === 'web' ? nativeKey : webKey), false);
  }
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


test('CLI builds without Git require the exact approved native build reference', async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'icao-web-reference-'));
  try {
    const original = spawnSync('git', ['show', 'bc44f5f26ea45b8ecb89669452aaf480b62f2957:app.json'], { cwd: repositoryRoot, encoding: 'utf8' });
    assert.equal(original.status, 0);
    const bytes = original.stdout;
    const manifest = JSON.parse(readFileSync(path.join(repositoryRoot, 'docs/records/workstreams/native-commercial-launch/evidence/web-freeze-manifest.json')));
    const hash = manifest.files.find(file => file.path === 'app.json').sha256;
    assert.deepEqual(await readNativeBuildReference(hash, directory), JSON.parse(bytes));
    await assert.rejects(readNativeBuildReference('0'.repeat(64), directory), /does not match/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});


test('formal Web review pins exact changes and never exempts later edits or unrelated inputs', () => {
  const expected = JSON.parse(readFileSync(path.join(repositoryRoot, 'docs/records/workstreams/native-commercial-launch/evidence/web-freeze-manifest.json'), 'utf8')).files;
  const before = expected.find(file => file.path === 'src/features/content/AppDownloadScreen.tsx');
  const after = { ...before, sha256: createHash('sha256').update(readFileSync(path.join(repositoryRoot, before.path))).digest('hex') };
  assert.deepEqual(normalizeReviewedFormalWebInputs(expected, [after]), [before]);
  const mutated = { ...after, sha256: '0'.repeat(64) };
  assert.deepEqual(normalizeReviewedFormalWebInputs(expected, [mutated]), [mutated]);
  const ownership = { ...after, sources: ['unreviewed'] };
  assert.deepEqual(normalizeReviewedFormalWebInputs(expected, [ownership]), [ownership]);
  const unrelated = { path: 'src/app/other.web.tsx', sha256: after.sha256, sources: [] };
  assert.deepEqual(normalizeReviewedFormalWebInputs(expected, [unrelated]), [unrelated]);
});

test('legacy bank relocation preserves exact published bytes and rejects mutable or competing imports', () => {
  const expected = JSON.parse(readFileSync(path.join(repositoryRoot, 'docs/records/workstreams/native-commercial-launch/evidence/web-freeze-manifest.json'), 'utf8')).files;
  const originalPath = 'src/features/question-bank/data/question-bank.json';
  const before = expected.find(file => file.path === originalPath);
  const snapshot = { ...before, path: 'src/features/question-bank/data/legacy-v13/question-bank.json', sha256: 'd38adbeb28176454d3c124e83b02d182c4645034264a5f9b73d8679334e78ecf' };
  assert.deepEqual(normalizeReviewedFormalWebInputs(expected, [snapshot]), [{ ...snapshot, path: originalPath }]);
  const withoutRemovedQuestion = { ...snapshot, sha256: '2bfacfa95474ab42e17204d28889d3af400c93dae80d833b384185b9089630ce' };
  assert.deepEqual(normalizeReviewedFormalWebInputs(expected, [withoutRemovedQuestion]), [{ ...withoutRemovedQuestion, path: originalPath }]);
  const changed = { ...snapshot, sha256: '0'.repeat(64) };
  assert.deepEqual(normalizeReviewedFormalWebInputs(expected, [changed]), [changed]);
  assert.equal(normalizeReviewedFormalWebInputs(expected, [snapshot, before])[0].path, snapshot.path);
  const changedOwnership = { ...snapshot, sources: ['unreviewed'] };
  assert.deepEqual(normalizeReviewedFormalWebInputs(expected, [changedOwnership]), [changedOwnership]);
});

test('bug repair root and directory Native routes leave the frozen Web siblings selected', () => {
  const require = createRequire(import.meta.url);
  const { getRoutes } = require('expo-router/build/getRoutesCore');
  for (const platform of ['web', 'ios', 'android']) {
    const loaded = [];
    const context = key => { loaded.push(key); return { default: () => null }; };
    context.keys = () => ['./_layout.tsx', './_layout.native.tsx', './question-bank/[bankId]/index.tsx', './question-bank/[bankId]/index.native.tsx'];
    const routes = getRoutes(context, { platform, ignoreEntryPoints: true, skipGenerated: true, getSystemRoute: ({ defaults }) => defaults });
    const suffix = platform === 'web' ? '.tsx' : '.native.tsx';
    assert.equal(routes.contextKey, `./_layout${suffix}`);
    assert.equal(routes.children[0].contextKey, `./question-bank/[bankId]/index${suffix}`);
    routes.loadRoute(); routes.children[0].loadRoute();
    assert.ok(loaded.every(key => platform !== 'web' || !key.endsWith('.native.tsx')));
  }
});

test('the PDF and airline catalog stay on the unselected native route in frozen Vercel', () => {
  const require = createRequire(import.meta.url);
  const { getRoutes } = require('expo-router/build/getRoutesCore');
  const nativeKey='./question-bank/[bankId]/index.native.tsx';
  const webKey='./question-bank/[bankId]/index.tsx';
  const loaded=[];
  const context=key=>{loaded.push(key);return {default:()=>null};};
  context.keys=()=>['./_layout.tsx',webKey,nativeKey];
  const routes=getRoutes(context,{platform:'web',ignoreEntryPoints:true,skipGenerated:true,getSystemRoute:({defaults})=>defaults});
  assert.equal(routes.children[0].contextKey,webKey);
  routes.children[0].loadRoute();assert.ok(!loaded.includes(nativeKey));
  const download=readFileSync(path.join(repositoryRoot,'src/features/content/AppDownloadScreen.tsx'),'utf8');
  assert.doesNotMatch(download,/测试版下载|testRelease/);
  assert.match(download,/newerAppUpdate\(releases, 'android-apk'/);
  assert.match(download,/const usePublishedRelease = isEdgeOneProductionWeb\(\)/);
});


test('tap recording resolves to the shared panel only in the formal EdgeOne runtime', () => {
  const require = createRequire(import.meta.url);
  const {edgeOneSharedModule} = require('./edgeone-shared-modules.cjs');
  const source = {type:'sourceFile',filePath:path.join(repositoryRoot,'src/features/question-bank/components/SpeakingPracticePanel.tsx')};
  for(const runtime of [undefined,'vercel','legacy']) assert.equal(edgeOneSharedModule(repositoryRoot,source,'web',runtime),source);
  assert.equal(edgeOneSharedModule(repositoryRoot,source,'ios','edgeone-production'),source);
  assert.equal(edgeOneSharedModule(repositoryRoot,source,'web','edgeone-production').filePath,path.join(repositoryRoot,'src/features/question-bank/components/SpeakingPracticePanel.native.tsx'));
});

test('usage-guide release admits only the exact reviewed version metadata and retains legacy display bytes', () => {
  const result = spawnSync('git', ['show', 'c11d1dce:app.json'], { cwd: repositoryRoot, encoding: 'utf8' });
  requireSuccess(result, 'read reviewed pre-guide configuration');
  const previous = JSON.parse(result.stdout);
  const release = structuredClone(previous);
  release.expo.version = '1.3.2';
  release.expo.ios.buildNumber = '3574504';
  release.expo.android.versionCode = 3574504;
  const digest = value => createHash('sha256').update(`${JSON.stringify(value, null, 2)}\n`).digest('hex');
  assert.equal(digest(previous), 'a110f1040ef4f9b8f2facc2d10b2c82f05f563d2ae0ce0b9bcdabadda3f83ced');
  assert.equal(digest(release), 'cdae79062c444e931f100a60d0881217ebd826a1dda1280e14a43ff113519d0c');
  const expected = [{ path: 'app.json', sha256: '255bfdaf744cc57b0d402c255ce67e7a157587e5a6eb579010c3b397b18d53c3', sources: ['explicit'] }];
  assert.deepEqual(normalizeReviewedFormalWebInputs(expected, [{ ...expected[0], sha256: digest(release) }]), expected);
  for (const altered of [
    { ...release, expo: { ...release.expo, name: 'changed' } },
    { ...release, expo: { ...release.expo, version: '1.3.3' } },
    { ...release, expo: { ...release.expo, ios: { ...release.expo.ios, bundleIdentifier: 'changed' } } },
  ]) {
    assert.notDeepEqual(normalizeReviewedFormalWebInputs(expected, [{ ...expected[0], sha256: digest(altered) }]), expected);
  }
  assert.equal(readFileSync(path.join(repositoryRoot, 'src/config/app-version.web.ts'), 'utf8'), "export const APP_DISPLAY_VERSION = '1.0.0';\n");
});

test('Android installer release admits only its reviewed build increment and preserves iOS and legacy Web', () => {
  const result = spawnSync('git', ['show', '1186fd54:app.json'], { cwd: repositoryRoot, encoding: 'utf8' });
  requireSuccess(result, 'read pre-installer configuration');
  const previous = JSON.parse(result.stdout);
  const release = structuredClone(previous);
  release.expo.android.versionCode = 3578875;
  const digest = value => createHash('sha256').update(`${JSON.stringify(value, null, 2)}\n`).digest('hex');
  assert.equal(digest(release), 'f8cacb4271315ce54305ef241c5a7b2f7d1169f0bb75f98c32ae98635038600e');
  assert.equal(release.expo.ios.buildNumber, '3576434');
  assert.equal(release.expo.version, '1.2.1');
  const expected = [{ path: 'app.json', sha256: '255bfdaf744cc57b0d402c255ce67e7a157587e5a6eb579010c3b397b18d53c3', sources: ['explicit'] }];
  assert.deepEqual(normalizeReviewedFormalWebInputs(expected, [{ ...expected[0], sha256: digest(release) }]), expected);
  release.expo.web.output = 'static';
  assert.notDeepEqual(normalizeReviewedFormalWebInputs(expected, [{ ...expected[0], sha256: digest(release) }]), expected);
});
