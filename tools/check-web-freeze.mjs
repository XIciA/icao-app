#!/usr/bin/env node

import { Buffer } from 'node:buffer';
import { execFile as execFileCallback } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';

const execFile = promisify(execFileCallback);
const require = createRequire(import.meta.url);
const scriptRepositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = process.env.ICAO_WEB_FREEZE_TEST_ROOT
  ? path.resolve(process.env.ICAO_WEB_FREEZE_TEST_ROOT)
  : scriptRepositoryRoot;
const defaultManifestPath = path.join(
  repositoryRoot,
  'docs/records/workstreams/native-commercial-launch/evidence/web-freeze-manifest.json',
);
const approvedManifestSha256 = '9c833024567b133031d4825bd867cdf3aaa67e0574343cb7e81b13c74a5f8804';
const approvedNativeBuildBase = 'bc44f5f26ea45b8ecb89669452aaf480b62f2957';
// User-approved 900-sentence content-only replacement, 2026-09-10.
// Exact hashes permit the two artifacts and their resource partitioner only; every other Web input remains frozen.
const approved900ContentHashes = new Map([['src/features/question-bank/data/question-bank.json', 'd38adbeb28176454d3c124e83b02d182c4645034264a5f9b73d8679334e78ecf'], ['src/features/question-bank/data/question-bank-release.json', '65f6f88d90baa31fb1495a3b9f6bda20feb799e04380a30cb2b57afadd684912']]);
approved900ContentHashes.set('tools/web-content-sync.mjs', 'c068b0c4744708a9cb76c324757d3c854f17d435d430b8fa6ab4d0be444987ef');
const approvedNativeIncrementBase = 'b27a2b81514390b037cba5fd96f72180998d0205';
const approvedNativeIncrementHashes = new Map([
  ['app.config.js', 'a17b33af850819c55e67534656a4e6f0efb858b6d6841caf82ce8dc8db6589b2'],
  ['package.json', 'cee4cb5ab75e040dd58134578fb1001197f46747acb815219022848810a37c5e'],
  ['packages/contracts/src/index.ts', '8f5607cd2cda4757a61894797a6f36b8d3f40248ae57206268d3c95562e2add4'],
  ['pnpm-lock.yaml', '96bfa611b82a49b435aed6f477a788cb2efb0b78c776507ef78c155d9750fab9'],
  ['src/app/_layout.tsx', '6e1e6c63667d5bff4816d0d195e71383fbca7d406d5a63120bdc32c2053dc732'],
]);
const approvedNativeIncrementPaths = new Set([
  ...approvedNativeIncrementHashes.keys(),
  'app.json',
]);

// Explicitly reviewed TestFlight route repair. Expo's Web require.context
// includes this file, but its platform router never selects it on Web. Keep
// both route implementations pinned; this is not a Native-suffix exemption.
const reviewedStudyNativePath = 'src/app/question-bank/[bankId]/study/[categoryId]/[topicId].native.tsx';
const reviewedStudyWebPath = 'src/app/question-bank/[bankId]/study/[categoryId]/[topicId].tsx';
const reviewedStudyNativeHash = '85f3981bf8bc8d310ef7e34baae2558f619978528eaaaf8be6555038357228fb';
const reviewedStudyNativeBaseHash = 'f0df1d0b8ba31c22302c3ceffe4a6244e64a34341a6e85d1175f4dfd1fce6e4d';
const reviewedStudyWebHash = '2c58b1d7bb5477cc782e3984b56c46c57b1c65b707dbac13ac70fcd8593bfe39';

// Reviewed Native-only installed-version dependency: exact before/after pairs.
// Existing dependency versions and the Web resolver graph remain unchanged.
const reviewedAppIdentityDependencyHashes = new Map([
  ['package.json', ['cee4cb5ab75e040dd58134578fb1001197f46747acb815219022848810a37c5e', 'fb69d0a671771c7e250bc995b42e2b653730db64c147356fab5b89cb3e1b29eb']],
  ['pnpm-lock.yaml', ['96bfa611b82a49b435aed6f477a788cb2efb0b78c776507ef78c155d9750fab9', '03cb3f2997aeb9233e1db3520706b612dc7635f1e737a6dd78b132453b4dec28']],
]);

const exactProtectedPaths = [
  '.vercelignore',
  'app.config.js',
  'app.json',
  'assets/images/favicon.png',
  'assets/images/icon.png',
  'index.js',
  'metro.config.js',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'tsconfig.json',
  'vercel.json',
];

const protectedTrees = ['api', 'public'];
const webImplementationPattern = /\.web\.(?:[cm]?[jt]sx?)$/u;

function expoResolutionContext(context, platform) {
  return platform === 'web' ? { ...context, preferNativePlatform: false } : context;
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalJson(entry)]),
  );
}

export function assertNativeBuildOnlyAppJsonDelta(baseApp, currentApp) {
  const baseBuildNumber = baseApp?.expo?.ios?.buildNumber;
  const currentBuildNumber = currentApp?.expo?.ios?.buildNumber;
  const baseVersionCode = baseApp?.expo?.android?.versionCode;
  const currentVersionCode = currentApp?.expo?.android?.versionCode;
  if (
    !/^\d+$/u.test(String(baseBuildNumber ?? ''))
    || !/^\d+$/u.test(String(currentBuildNumber ?? ''))
    || !Number.isSafeInteger(baseVersionCode)
    || !Number.isSafeInteger(currentVersionCode)
  ) {
    throw new Error('app.json Native build identifiers must be positive decimal integers');
  }
  const baseBuild = Number(baseBuildNumber);
  const currentBuild = Number(currentBuildNumber);
  if (
    !Number.isSafeInteger(baseBuild)
    || !Number.isSafeInteger(currentBuild)
    || baseBuild <= 0
    || currentBuild <= baseBuild
    || baseVersionCode <= 0
    || currentVersionCode <= baseVersionCode
    || currentBuild !== currentVersionCode
  ) {
    throw new Error('app.json must advance matching iOS and Android build identifiers');
  }

  const stripNativeBuildIdentifiers = (app) => {
    const normalized = structuredClone(app);
    delete normalized.expo.ios.buildNumber;
    delete normalized.expo.android.versionCode;
    return canonicalJson(normalized);
  };
  if (
    JSON.stringify(stripNativeBuildIdentifiers(baseApp))
    !== JSON.stringify(stripNativeBuildIdentifiers(currentApp))
  ) {
    throw new Error('app.json changes more than the reviewed Native build identifiers');
  }
}

function normalizedProtectedContent(repositoryPath, content) {
  if (repositoryPath !== 'vercel.json') return content;
  const config = JSON.parse(content.toString('utf8'));
  delete config.name;
  delete config.version;
  return Buffer.from(JSON.stringify(canonicalJson(config)));
}

function toRepositoryPath(absolutePath) {
  const relativePath = path.relative(repositoryRoot, absolutePath);
  if (
    !relativePath ||
    relativePath === '..' ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error(`Path is outside the repository: ${absolutePath}`);
  }
  return relativePath.split(path.sep).join('/');
}

function fromRepositoryPath(repositoryPath) {
  if (
    !repositoryPath ||
    path.isAbsolute(repositoryPath) ||
    repositoryPath.split('/').includes('..')
  ) {
    throw new Error(`Invalid repository path in Web freeze manifest: ${repositoryPath}`);
  }
  return path.join(repositoryRoot, ...repositoryPath.split('/'));
}

async function listFilesRecursively(directory) {
  const results = [];
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await listFilesRecursively(absolutePath)));
      continue;
    }
    if (entry.isFile()) {
      results.push(absolutePath);
      continue;
    }
    throw new Error(`Unsupported entry in protected Web scope: ${toRepositoryPath(absolutePath)}`);
  }

  return results;
}

async function addExistingFile(selection, repositoryPath, source) {
  const absolutePath = fromRepositoryPath(repositoryPath);
  const stats = await lstat(absolutePath).catch((error) => {
    if (error?.code === 'ENOENT') return null;
    throw error;
  });
  if (!stats) return;
  if (!stats.isFile()) {
    throw new Error(`Protected Web path is not a regular file: ${repositoryPath}`);
  }
  const sources = selection.get(repositoryPath) ?? new Set();
  sources.add(source);
  selection.set(repositoryPath, sources);
}

async function addTree(selection, repositoryPath, source) {
  const absolutePath = fromRepositoryPath(repositoryPath);
  const stats = await lstat(absolutePath).catch((error) => {
    if (error?.code === 'ENOENT') return null;
    throw error;
  });
  if (!stats) return;
  if (!stats.isDirectory()) {
    throw new Error(`Protected Web tree is not a directory: ${repositoryPath}`);
  }
  for (const filePath of await listFilesRecursively(absolutePath)) {
    await addExistingFile(selection, toRepositoryPath(filePath), source);
  }
}

async function resolveWebGraphFiles() {
  const metroConfigPath = path.join(repositoryRoot, 'metro.config.js');
  const metroConfig = require(metroConfigPath);
  const metroPath = require.resolve('metro', {
    paths: [require.resolve('expo/metro-config')],
  });
  const metro = require(metroPath);
  const metroResolver = require(
    require.resolve('metro-resolver', {
      paths: [metroPath],
    }),
  );

  metroConfig.resolver = { ...metroConfig.resolver };
  metroConfig.resolver.useWatchman = false;
  metroConfig.resetCache = false;
  metroConfig.watchFolders = [
    ...new Set([...(metroConfig.watchFolders ?? []), repositoryRoot, scriptRepositoryRoot]),
  ];
  metroConfig.watcher = {
    ...metroConfig.watcher,
    unstable_lazySha1: false,
  };
  metroConfig.resolver.nodeModulesPaths = [
    ...new Set([
      ...(metroConfig.resolver.nodeModulesPaths ?? []),
      path.join(repositoryRoot, 'node_modules'),
      path.join(repositoryRoot, 'node_modules/.pnpm/node_modules'),
      path.join(scriptRepositoryRoot, 'node_modules'),
      path.join(scriptRepositoryRoot, 'node_modules/.pnpm/node_modules'),
    ]),
  ];

  const existingResolveRequest = metroConfig.resolver.resolveRequest;
  metroConfig.resolver.resolveRequest = (context, moduleName, platform) => {
    // Expo CLI disables Metro's `.native.*` fallback while exporting Web. A raw
    // Metro graph leaves `preferNativePlatform` enabled and therefore treats
    // Native-only implementations as Vercel inputs even though `expo export
    // --platform web` does not. Keep this graph aligned with the actual exporter.
    const platformContext = expoResolutionContext(context, platform);
    if (moduleName.startsWith('@/assets/')) {
      return metroResolver.resolve(
        platformContext,
        path.join(repositoryRoot, 'assets', moduleName.slice('@/assets/'.length)),
        platform,
      );
    }
    if (moduleName.startsWith('@/')) {
      return metroResolver.resolve(
        platformContext,
        path.join(repositoryRoot, 'src', moduleName.slice('@/'.length)),
        platform,
      );
    }
    if (existingResolveRequest) {
      return existingResolveRequest(platformContext, moduleName, platform);
    }
    return metroResolver.resolve(platformContext, moduleName, platform);
  };

  const graph = await metro.buildGraph(metroConfig, {
    entries: [path.join(repositoryRoot, 'index.js')],
    platform: 'web',
    dev: false,
    minify: false,
    customTransformOptions: {
      routerRoot: 'src/app',
    },
  });

  const files = [];
  const canonicalRoot = await realpath(repositoryRoot);
  for (const dependencyPath of graph.dependencies.keys()) {
    if (!path.isAbsolute(dependencyPath) || !existsSync(dependencyPath)) continue;
    const canonicalPath = await realpath(dependencyPath);
    const relativePath = path.relative(canonicalRoot, canonicalPath);
    if (
      !relativePath ||
      relativePath === '..' ||
      relativePath.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relativePath) ||
      relativePath.split(path.sep).includes('node_modules')
    ) {
      continue;
    }
    files.push(relativePath.split(path.sep).join('/'));
  }

  return [...new Set(files)].sort();
}

async function collectCurrentSelection() {
  const selection = new Map();

  for (const repositoryPath of exactProtectedPaths) {
    await addExistingFile(selection, repositoryPath, 'exact_web_config_or_asset');
  }
  for (const repositoryPath of protectedTrees) {
    await addTree(selection, repositoryPath, `tree:${repositoryPath}`);
  }

  const srcPath = path.join(repositoryRoot, 'src');
  for (const absolutePath of await listFilesRecursively(srcPath)) {
    const repositoryPath = toRepositoryPath(absolutePath);
    if (webImplementationPattern.test(repositoryPath)) {
      await addExistingFile(selection, repositoryPath, 'platform_web_implementation');
    }
  }

  for (const directoryName of ['scripts', 'tools']) {
    const directoryPath = path.join(repositoryRoot, directoryName);
    for (const absolutePath of await listFilesRecursively(directoryPath)) {
      const repositoryPath = toRepositoryPath(absolutePath);
      const basename = path.basename(repositoryPath).toLowerCase();
      const isWebOwned = basename.includes('web') || basename.includes('promo');
      const isFreezeControl = repositoryPath === 'tools/check-web-freeze.mjs'
        || repositoryPath === 'tools/check-web-freeze-tests.mjs';
      if (!isWebOwned || isFreezeControl) continue;
      await addExistingFile(selection, repositoryPath, 'web_build_or_deploy_tooling');
    }
  }

  for (const repositoryPath of await resolveWebGraphFiles()) {
    // The resolver is authoritative. Do not discard platform-suffixed files
    // after resolution: an explicit import is real Web behavior and must stay
    // protected. Normal Native fallbacks are excluded by the Web context above.
    await addExistingFile(selection, repositoryPath, 'metro_web_dependency_graph');
  }

  return selection;
}

async function fingerprintSelection(selection) {
  const files = [];
  for (const repositoryPath of [...selection.keys()].sort()) {
    const content = await readFile(fromRepositoryPath(repositoryPath));
    files.push({
      path: repositoryPath,
      sha256: sha256(normalizedProtectedContent(repositoryPath, content)),
      sources: [...selection.get(repositoryPath)].sort(),
    });
  }
  const combinedInput = files
    .map((file) => `${file.path}\0${file.sha256}\0${file.sources.join(',')}\n`)
    .join('');
  return {
    files,
    combinedSha256: sha256(Buffer.from(combinedInput)),
  };
}

function combinedSha256(files) {
  const combinedInput = files
    .map((file) => `${file.path}\0${file.sha256}\0${file.sources.join(',')}\n`)
    .join('');
  return sha256(Buffer.from(combinedInput));
}

function fingerprintDifferences(expected, current) {
  const expectedByPath = new Map(expected.map((file) => [file.path, file]));
  const currentByPath = new Map(current.map((file) => [file.path, file]));
  return {
    selectionAdded: current.filter((file) => !expectedByPath.has(file.path)).map((file) => file.path),
    selectionRemoved: expected.filter((file) => !currentByPath.has(file.path)).map((file) => file.path),
    contentChanged: current.filter((file) => expectedByPath.has(file.path)
      && expectedByPath.get(file.path).sha256 !== file.sha256).map((file) => file.path),
    ownershipChanged: current.filter((file) => {
      const expectedFile = expectedByPath.get(file.path);
      return expectedFile && expectedFile.sources.join('\0') !== file.sources.join('\0');
    }).map((file) => file.path),
  };
}

export function assertReviewedNativeStudyRouteDelta(expected, current) {
  const differences = fingerprintDifferences(expected, current);
  const expectedHashes = new Map(expected.map((file) => [file.path, file.sha256]));
  const currentHashes = new Map(current.map((file) => [file.path, file.sha256]));
  differences.contentChanged = differences.contentChanged.filter((file) => {
    const pair = reviewedAppIdentityDependencyHashes.get(file);
    return !pair || expectedHashes.get(file) !== pair[0] || currentHashes.get(file) !== pair[1];
  });
  if (differences.selectionAdded.length || differences.selectionRemoved.length || differences.ownershipChanged.length
    || !differences.contentChanged.includes(reviewedStudyNativePath)
    || differences.contentChanged.some((file) => file !== reviewedStudyNativePath && file !== 'app.json')) {
    throw new Error('unreviewed Web input alongside Native study route repair');
  }
  const before = new Map(expected.map((file) => [file.path, file.sha256]));
  const after = new Map(current.map((file) => [file.path, file.sha256]));
  if (before.get(reviewedStudyNativePath) !== reviewedStudyNativeBaseHash
    || after.get(reviewedStudyNativePath) !== reviewedStudyNativeHash
    || before.get(reviewedStudyWebPath) !== reviewedStudyWebHash
    || after.get(reviewedStudyWebPath) !== reviewedStudyWebHash) {
    throw new Error('Native study route or its Web sibling differs from the exact reviewed content');
  }
  // Exercise the installed, lockfile-protected router rather than assuming
  // that every .native file is unreachable. Explicit Web imports elsewhere
  // remain protected by the unchanged full graph and fingerprints above.
  const { getRoutes } = require('expo-router/build/getRoutesCore');
  const nativeKey = `./${reviewedStudyNativePath.slice('src/app/'.length)}`;
  const webKey = `./${reviewedStudyWebPath.slice('src/app/'.length)}`;
  const context = (key) => {
    if (key === nativeKey) throw new Error('Web selected the Native study implementation');
    return { default: () => null };
  };
  context.keys = () => ['./_layout.tsx', webKey, nativeKey];
  const routes = getRoutes(context, {
    platform: 'web', ignoreEntryPoints: true, skipGenerated: true,
    getSystemRoute: ({ defaults }) => defaults,
  });
  if (routes?.children.length !== 1 || routes.children[0].contextKey !== webKey) {
    throw new Error('Web study route platform selection changed');
  }
  routes.children[0].loadRoute();
  return differences.contentChanged;
}

const nativeBuildReference = "{\n  \"expo\": {\n    \"name\": \"听你五个\",\n    \"slug\": \"readyoufife\",\n    \"version\": \"1.0.0\",\n    \"orientation\": \"portrait\",\n    \"icon\": \"./assets/images/icon.png\",\n    \"scheme\": \"readyoufife\",\n    \"userInterfaceStyle\": \"light\",\n    \"ios\": {\n      \"icon\": \"./assets/images/icon.png\",\n      \"supportsTablet\": false,\n      \"bundleIdentifier\": \"com.readyoufife.ios\",\n      \"buildNumber\": \"3493766\",\n      \"config\": {\n        \"usesNonExemptEncryption\": false\n      },\n      \"infoPlist\": {\n        \"UIBackgroundModes\": [\n          \"audio\"\n        ]\n      }\n    },\n    \"android\": {\n      \"icon\": \"./assets/images/icon.png\",\n      \"predictiveBackGestureEnabled\": false,\n      \"package\": \"com.readyoufife.app\",\n      \"versionCode\": 3493766\n    },\n    \"web\": {\n      \"output\": \"single\",\n      \"favicon\": \"./assets/images/favicon.png\"\n    },\n    \"plugins\": [\n      \"expo-router\",\n      [\n        \"expo-splash-screen\",\n        {\n          \"backgroundColor\": \"#FFFFFF\",\n          \"image\": \"./assets/images/icon.png\",\n          \"imageWidth\": 160,\n          \"resizeMode\": \"contain\",\n          \"android\": {\n            \"imageWidth\": 120\n          }\n        }\n      ],\n      [\n        \"expo-audio\",\n        {\n          \"microphonePermission\": \"允许听你五个使用麦克风录制口语练习；录音仅在你主动点击转写并明确同意后发送至 AI 服务。\",\n          \"enableBackgroundPlayback\": false,\n          \"enableBackgroundRecording\": false\n        }\n      ],\n      \"expo-sqlite\",\n      [\n        \"expo-secure-store\",\n        {\n          \"faceIDPermission\": false\n        }\n      ],\n      \"expo-asset\",\n      [\n        \"expo-image-picker\",\n        {\n          \"photosPermission\": \"允许听你五个选择图片并随反馈提交。\",\n          \"cameraPermission\": false\n        }\n      ],\n      \"./plugins/with-android-release-signing\",\n      \"./plugins/with-ios-release-integrity\"\n    ],\n    \"experiments\": {\n      \"typedRoutes\": true,\n      \"reactCompiler\": true\n    }\n  }\n}\n";

// CLI uploads omit .git. The embedded reference must still match the approved
// manifest byte-for-byte; application identity checks remain identical.
export async function readNativeBuildReference(expectedHash, directory = repositoryRoot) {
  let bytes;
  if (existsSync(path.join(directory, '.git'))) {
    await execFile('git', ['merge-base', '--is-ancestor', approvedNativeBuildBase, 'HEAD'], { cwd: directory });
    const { stdout } = await execFile('git', ['show', `${approvedNativeBuildBase}:app.json`], { cwd: directory, encoding: 'utf8' });
    bytes = Buffer.from(stdout);
  } else {
    bytes = Buffer.from(nativeBuildReference);
  }
  if (sha256(bytes) !== expectedHash) throw new Error('Native build reference does not match the pinned Web manifest');
  return JSON.parse(bytes.toString('utf8'));
}

function evaluateExpoConfig(source, environment) {
  const module = { exports: {} };
  const execute = new Function('module', 'exports', 'process', source);
  execute(module, module.exports, { env: environment });
  const configure = module.exports;
  if (typeof configure !== 'function') throw new Error('app.config.js no longer exports a function');
  const configured = configure({
    config: {
      name: '听你五个',
      scheme: 'readyoufife',
      ios: { bundleIdentifier: 'com.readyoufife.ios' },
      plugins: ['expo-apple-authentication', ['expo-dev-client', { addGeneratedScheme: false }]],
    },
  });
  configured.plugins = configured.plugins.filter((entry) => {
    const name = Array.isArray(entry) ? entry[0] : entry;
    return name !== './plugins/with-wechat-auth';
  });
  return canonicalJson(configured);
}

function webPackageSurface(packageJson) {
  const nativeOnlyDependencies = new Set([
    '@expo/vector-icons',
    '@icao/wechat-auth',
    'expo-modules-core',
  ]);
  return canonicalJson({
    dependencies: Object.fromEntries(Object.entries(packageJson.dependencies ?? {})
      .filter(([name]) => !nativeOnlyDependencies.has(name))),
    devDependencies: packageJson.devDependencies,
    engines: packageJson.engines,
    jest: packageJson.jest,
    main: packageJson.main,
    name: packageJson.name,
    packageManager: packageJson.packageManager,
    private: packageJson.private,
    version: packageJson.version,
    webScripts: Object.fromEntries(Object.entries(packageJson.scripts ?? {})
      .filter(([name]) => name === 'web' || name.startsWith('web:') || name.startsWith('check:web'))),
  });
}

async function assertApprovedNativeIncrement(currentFiles) {
  await execFile(
    'git',
    ['merge-base', '--is-ancestor', approvedNativeIncrementBase, 'HEAD'],
    { cwd: repositoryRoot, encoding: 'utf8' },
  );
  const [{ stdout: changedOutput }, { stdout: untrackedOutput }] = await Promise.all([
    execFile('git', ['diff', '--name-only', '--no-renames', approvedNativeIncrementBase, '--'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    }),
    execFile('git', ['ls-files', '--others', '--exclude-standard'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    }),
  ]);
  const selected = new Set(currentFiles.map(({ path: repositoryPath }) => repositoryPath));
  const changedPaths = [...new Set([
    ...changedOutput.trim().split('\n'),
    ...untrackedOutput.trim().split('\n'),
  ].filter(Boolean))];
  const changedProtectedPaths = changedPaths.filter((repositoryPath) => selected.has(repositoryPath));
  const deletedSharedSource = await Promise.all(changedPaths
    .filter((repositoryPath) => repositoryPath.startsWith('src/')
      && !/\.(?:native|ios|android)\.[cm]?[jt]sx?$/u.test(repositoryPath))
    .map(async (repositoryPath) => {
      if (existsSync(fromRepositoryPath(repositoryPath))) return undefined;
      try {
        await execFile('git', ['cat-file', '-e', `${approvedNativeIncrementBase}:${repositoryPath}`], {
          cwd: repositoryRoot,
        });
        return repositoryPath;
      } catch {
        return undefined;
      }
    }));
  if (deletedSharedSource.some(Boolean)) {
    throw new Error(`deleted shared Web candidate: ${deletedSharedSource.filter(Boolean).join(', ')}`);
  }
  if (
    changedProtectedPaths.length !== approvedNativeIncrementPaths.size
    || changedProtectedPaths.some((repositoryPath) => !approvedNativeIncrementPaths.has(repositoryPath))
  ) {
    throw new Error(`unapproved protected-input delta: ${changedProtectedPaths.join(', ')}`);
  }
  for (const [repositoryPath, expectedHash] of approvedNativeIncrementHashes) {
    const file = currentFiles.find(({ path: candidate }) => candidate === repositoryPath);
    if (!file || file.sha256 !== expectedHash) {
      throw new Error(`approved Native-only input changed without review: ${repositoryPath}`);
    }
  }

  const readBaseFile = async (repositoryPath) => {
    const { stdout } = await execFile('git', ['show', `${approvedNativeIncrementBase}:${repositoryPath}`], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    });
    return stdout;
  };
  const [baseApp, currentApp, baseAppConfig, currentAppConfig, basePackage, currentPackage, baseContracts, currentContracts] = await Promise.all([
    readBaseFile('app.json').then(JSON.parse),
    readFile(fromRepositoryPath('app.json'), 'utf8').then(JSON.parse),
    readBaseFile('app.config.js'),
    readFile(fromRepositoryPath('app.config.js'), 'utf8'),
    readBaseFile('package.json').then(JSON.parse),
    readFile(fromRepositoryPath('package.json'), 'utf8').then(JSON.parse),
    readBaseFile('packages/contracts/src/index.ts'),
    readFile(fromRepositoryPath('packages/contracts/src/index.ts'), 'utf8'),
  ]);
  assertNativeBuildOnlyAppJsonDelta(baseApp, currentApp);
  for (const variant of [undefined, 'development']) {
    const baseConfigured = evaluateExpoConfig(baseAppConfig, { ICAO_APP_VARIANT: variant });
    const currentConfigured = evaluateExpoConfig(currentAppConfig, {
      ICAO_APP_VARIANT: variant,
      ICAO_WECHAT_APP_ID: 'review-only-native-app-id',
      ICAO_WECHAT_UNIVERSAL_LINK: 'https://native.example.invalid/app/',
    });
    if (JSON.stringify(baseConfigured) !== JSON.stringify(currentConfigured)) {
      throw new Error('app.config.js changes more than the reviewed Native WeChat config plugin');
    }
  }
  if (JSON.stringify(webPackageSurface(basePackage)) !== JSON.stringify(webPackageSurface(currentPackage))) {
    throw new Error('package.json changes the Web dependency or script surface');
  }
  const typescript = require('typescript');
  const transpile = (source) => typescript.transpileModule(source, {
    compilerOptions: {
      module: typescript.ModuleKind.ESNext,
      removeComments: true,
      target: typescript.ScriptTarget.ES2022,
    },
  }).outputText.trim();
  if (transpile(baseContracts) !== transpile(currentContracts)) {
    throw new Error('contracts index changes emitted Web runtime JavaScript');
  }
  return { contentChanged: changedProtectedPaths };
}

async function currentHead() {
  try {
    const { stdout } = await execFile('git', ['rev-parse', 'HEAD'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    });
    return stdout.trim();
  } catch {
    return null;
  }
}

async function makeSnapshot() {
  const selection = await collectCurrentSelection();
  const fingerprint = await fingerprintSelection(selection);
  return {
    schemaVersion: 1,
    scope: 'existing-vercel-web-source-and-export-inputs',
    baseline: {
      capturedAt: new Date().toISOString(),
      repositoryHead: await currentHead(),
      workingTreeMode: 'exact-current-files-including-uncommitted-state',
      remoteProductionDeploymentVerified: false,
    },
    selection: {
      webGraph: {
        entry: 'index.js',
        platform: 'web',
        routerRoot: 'src/app',
      },
      exactPaths: exactProtectedPaths,
      trees: protectedTrees,
      additionalRules: [
        'src/**/*.web.{js,jsx,mjs,cjs,ts,tsx,mts,cts}',
        'scripts/**/* whose basename contains web or promo',
        'tools/**/* whose basename contains web or promo, excluding tools/check-web-freeze.mjs',
      ],
    },
    fileCount: fingerprint.files.length,
    combinedSha256: fingerprint.combinedSha256,
    files: fingerprint.files,
  };
}

function parseArguments(argv) {
  let mode = 'check';
  let explain = false;
  let manifestPath = defaultManifestPath;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--print-snapshot') {
      mode = 'print-snapshot';
      continue;
    }
    if (argument === '--explain') {
      explain = true;
      continue;
    }
    if (argument === '--manifest') {
      const value = argv[index + 1];
      if (!value) throw new Error('--manifest requires a path');
      manifestPath = path.resolve(process.cwd(), value);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  return { mode, explain, manifestPath };
}

function validateManifest(manifest) {
  if (manifest?.schemaVersion !== 1) {
    throw new Error('Unsupported or missing Web freeze manifest schemaVersion');
  }
  if (!Array.isArray(manifest.files) || typeof manifest.combinedSha256 !== 'string') {
    throw new Error('Invalid Web freeze manifest structure');
  }

  const seen = new Set();
  for (const file of manifest.files) {
    if (
      typeof file?.path !== 'string' ||
      !/^[a-f0-9]{64}$/u.test(file.sha256) ||
      !Array.isArray(file.sources)
    ) {
      throw new Error(`Invalid Web freeze manifest file entry: ${JSON.stringify(file)}`);
    }
    fromRepositoryPath(file.path);
    if (seen.has(file.path)) {
      throw new Error(`Duplicate Web freeze manifest path: ${file.path}`);
    }
    seen.add(file.path);
  }
  if (manifest.fileCount !== manifest.files.length) {
    throw new Error('Web freeze manifest fileCount does not match files length');
  }
}

function sourceCounts(files) {
  const counts = new Map();
  for (const file of files) {
    for (const source of file.sources) {
      counts.set(source, (counts.get(source) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort(([left], [right]) => left.localeCompare(right));
}

async function checkManifest(manifestPath, explain) {
  const manifestContent = await readFile(manifestPath);
  if (
    path.resolve(manifestPath) === path.resolve(defaultManifestPath) &&
    sha256(manifestContent) !== approvedManifestSha256
  ) {
    throw new Error(
      'Approved Web freeze manifest changed. Review the Web/Vercel impact before updating both the manifest and its pinned digest.',
    );
  }
  const manifest = JSON.parse(manifestContent.toString('utf8'));
  validateManifest(manifest);

  const fingerprinted = await fingerprintSelection(await collectCurrentSelection());
  const expected = manifest.files;
  const approvedContentPaths = [];
  const files = fingerprinted.files.map((file) => {
    const baseline = expected.find((entry) => entry.path === file.path);
    if (path.resolve(manifestPath) === path.resolve(defaultManifestPath)
      && baseline && approved900ContentHashes.get(file.path) === file.sha256) {
      approvedContentPaths.push(file.path);
      return { ...file, sha256: baseline.sha256 };
    }
    return file;
  });
  const current = { ...fingerprinted, files, combinedSha256: combinedSha256(files) };
  if (approvedContentPaths.length) console.log(`User-approved 900-sentence content artifacts: ${approvedContentPaths.join(', ')}`);
  const {
    contentChanged,
    ownershipChanged,
    selectionAdded,
    selectionRemoved,
  } = fingerprintDifferences(expected, current.files);
  const combinedChanged = combinedSha256(expected) !== current.combinedSha256;

  const failures = [
    ['newly protected path', selectionAdded],
    ['path removed from protected selection', selectionRemoved],
    ['content changed', contentChanged],
    ['protection source changed', ownershipChanged],
  ];
  const hasFailure = combinedChanged || failures.some(([, paths]) => paths.length > 0);

  if (hasFailure) {
    if (path.resolve(manifestPath) === path.resolve(defaultManifestPath)
      && contentChanged.includes(reviewedStudyNativePath)) {
      try {
        const reviewedChanges = assertReviewedNativeStudyRouteDelta(expected, current.files);
        if (reviewedChanges.includes('app.json')) {
          const baseApp = await readNativeBuildReference(expected.find((file) => file.path === 'app.json')?.sha256);
          assertNativeBuildOnlyAppJsonDelta(baseApp, JSON.parse(await readFile(fromRepositoryPath('app.json'), 'utf8')));
        }
        console.log(`Web freeze check passed: ${current.files.length - reviewedChanges.length} protected files match the baseline exactly; one exact reviewed Native study route delta, unchanged Web sibling and verified Native build identifiers.`);
        return;
      } catch (error) {
        console.error(`Reviewed Native study route proof failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (
      path.resolve(manifestPath) === path.resolve(defaultManifestPath)
      && contentChanged.length === 1 && contentChanged[0] === 'app.json'
      && ownershipChanged.length === 0 && selectionAdded.length === 0 && selectionRemoved.length === 0
    ) {
      try {
        const baseApp = await readNativeBuildReference(expected.find((file) => file.path === 'app.json')?.sha256);
        assertNativeBuildOnlyAppJsonDelta(baseApp, JSON.parse(await readFile(fromRepositoryPath('app.json'), 'utf8')));
        console.log(`Web freeze check passed: ${current.files.length - 1} protected files match the baseline exactly; app.json differs only in matching advanced Native build identifiers.`);
        return;
      } catch (error) {
        console.error(`Native build identifier proof failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (path.resolve(manifestPath) === path.resolve(defaultManifestPath)) {
      try {
        const increment = await assertApprovedNativeIncrement(current.files);
        console.log(
          `Web freeze check passed by strict Native-only increment proof from ${approvedNativeIncrementBase}: ${current.files.length} protected files, ${increment.contentChanged.length} exact reviewed deltas.`,
        );
        if (explain) {
          for (const repositoryPath of increment.contentChanged) {
            console.log(`- reviewed Native-only protected input: ${repositoryPath}`);
          }
          console.log('- app.config.js: identical after removing the Native WeChat config plugin');
          console.log('- app.json: identical after removing the matching Native build identifiers');
          console.log('- package.json: identical Web dependency and Web script surface');
          console.log('- contracts index: identical emitted JavaScript');
          console.log('- pnpm lockfile: exact reviewed digest');
        }
        return;
      } catch (error) {
        console.error(`Strict Native-only increment proof failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    console.error('Web freeze check failed. Existing Web/Vercel inputs no longer match the approved baseline.');
    for (const [label, paths] of failures) {
      for (const repositoryPath of paths) console.error(`- ${label}: ${repositoryPath}`);
    }
    if (combinedChanged && failures.every(([, paths]) => paths.length === 0)) {
      console.error('- combined manifest digest differs; inspect manifest integrity');
    }
    if (process.env.VERCEL && contentChanged.includes('vercel.json')) {
      const observedConfig = canonicalJson(
        JSON.parse((await readFile(fromRepositoryPath('vercel.json'))).toString('utf8')),
      );
      console.error(`- observed Vercel build config: ${JSON.stringify(observedConfig)}`);
    }
    console.error('Do not rebaseline without explicit review of the Web/Vercel impact.');
    process.exitCode = 1;
    return;
  }

  console.log(`Web freeze check passed: ${current.files.length} protected files match the baseline.`);
  if (explain) {
    console.log(`Combined SHA-256: ${current.combinedSha256}`);
    for (const [source, count] of sourceCounts(current.files)) {
      console.log(`- ${source}: ${count}`);
    }
  }
}

async function main() {
  const arguments_ = parseArguments(process.argv.slice(2));
  if (arguments_.mode === 'print-snapshot') {
    console.log(JSON.stringify(await makeSnapshot(), null, 2));
    return;
  }
  await checkManifest(arguments_.manifestPath, arguments_.explain);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`Web freeze check could not run: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
