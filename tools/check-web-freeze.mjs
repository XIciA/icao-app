#!/usr/bin/env node

import { Buffer } from 'node:buffer';
import { execFile as execFileCallback } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFile = promisify(execFileCallback);
const require = createRequire(import.meta.url);
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultManifestPath = path.join(
  repositoryRoot,
  'docs/records/workstreams/native-commercial-launch/evidence/web-freeze-manifest.json',
);
const approvedManifestSha256 = '4478addfa5cd4df8cf2fbda461a3ad21e743f909f0e2fa8455ad6b0c3f76a027';

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

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
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
  metroConfig.watchFolders = [...new Set([...(metroConfig.watchFolders ?? []), repositoryRoot])];
  metroConfig.watcher = {
    ...metroConfig.watcher,
    unstable_lazySha1: false,
  };
  metroConfig.resolver.nodeModulesPaths = [
    ...new Set([
      ...(metroConfig.resolver.nodeModulesPaths ?? []),
      path.join(repositoryRoot, 'node_modules'),
      path.join(repositoryRoot, 'node_modules/.pnpm/node_modules'),
    ]),
  ];

  const existingResolveRequest = metroConfig.resolver.resolveRequest;
  metroConfig.resolver.resolveRequest = (context, moduleName, platform) => {
    if (moduleName.startsWith('@/assets/')) {
      return metroResolver.resolve(
        context,
        path.join(repositoryRoot, 'assets', moduleName.slice('@/assets/'.length)),
        platform,
      );
    }
    if (moduleName.startsWith('@/')) {
      return metroResolver.resolve(
        context,
        path.join(repositoryRoot, 'src', moduleName.slice('@/'.length)),
        platform,
      );
    }
    if (existingResolveRequest) {
      return existingResolveRequest(context, moduleName, platform);
    }
    return metroResolver.resolve(context, moduleName, platform);
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
    files.push(toRepositoryPath(canonicalPath));
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
      if (!isWebOwned || repositoryPath === 'tools/check-web-freeze.mjs') continue;
      await addExistingFile(selection, repositoryPath, 'web_build_or_deploy_tooling');
    }
  }

  for (const repositoryPath of await resolveWebGraphFiles()) {
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
      sha256: sha256(content),
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

  const current = await fingerprintSelection(await collectCurrentSelection());
  const expectedByPath = new Map(manifest.files.map((file) => [file.path, file]));
  const currentByPath = new Map(current.files.map((file) => [file.path, file]));
  const selectionAdded = current.files
    .filter((file) => !expectedByPath.has(file.path))
    .map((file) => file.path);
  const selectionRemoved = manifest.files
    .filter((file) => !currentByPath.has(file.path))
    .map((file) => file.path);
  const contentChanged = current.files
    .filter((file) => {
      const expected = expectedByPath.get(file.path);
      return expected && expected.sha256 !== file.sha256;
    })
    .map((file) => file.path);
  const ownershipChanged = current.files
    .filter((file) => {
      const expected = expectedByPath.get(file.path);
      return expected && expected.sources.join('\0') !== file.sources.join('\0');
    })
    .map((file) => file.path);
  const combinedChanged = manifest.combinedSha256 !== current.combinedSha256;

  const failures = [
    ['newly protected path', selectionAdded],
    ['path removed from protected selection', selectionRemoved],
    ['content changed', contentChanged],
    ['protection source changed', ownershipChanged],
  ];
  const hasFailure = combinedChanged || failures.some(([, paths]) => paths.length > 0);

  if (hasFailure) {
    console.error('Web freeze check failed. Existing Web/Vercel inputs no longer match the approved baseline.');
    for (const [label, paths] of failures) {
      for (const repositoryPath of paths) console.error(`- ${label}: ${repositoryPath}`);
    }
    if (combinedChanged && failures.every(([, paths]) => paths.length === 0)) {
      console.error('- combined manifest digest differs; inspect manifest integrity');
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

main().catch((error) => {
  console.error(`Web freeze check could not run: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
