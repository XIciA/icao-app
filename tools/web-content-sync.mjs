import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const questionBankRoot = join(root, 'content/question-banks');
const questionBankReleaseRoot = join(root, 'dist/question-bank-release');
const editorialReleaseRoot = join(root, 'dist/editorial-release');
const outputPath = join(root, '.generated/web-content/current-release.json');
const releaseVersionArgumentIndex = process.argv.indexOf('--release-version');
const expectedReleaseVersion = Number(
  releaseVersionArgumentIndex >= 0
    ? process.argv[releaseVersionArgumentIndex + 1]
    : process.env.WEB_CONTENT_RELEASE_VERSION ?? 8,
);
const prepareOnly = process.argv.includes('--prepare-only');
const assetShardCount = 10;
const vercelScope = process.env.VERCEL_CONTENT_SCOPE ?? 'xixi-s-projects6';

function fail(message) {
  throw new Error(message);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function copy(source, destination) {
  mkdirSync(dirname(destination), { recursive: true });
  try {
    linkSync(source, destination);
  } catch {
    copyFileSync(source, destination);
  }
}

function questionBankResourcePath(sourceRelativePath) {
  const direct = join(questionBankRoot, 'resources/files', sourceRelativePath);
  if (existsSync(direct)) return direct;
  const audioOverlay = join(questionBankRoot, 'resources/audio', sourceRelativePath.replace(/^audio\//u, ''));
  if (existsSync(audioOverlay)) return audioOverlay;
  const externalRoot = process.env.QUESTION_BANK_AUDIO_ROOT
    ?? '/Users/zhouyide/Desktop/icao设计稿/public/question-bank-assets/audio';
  const external = join(externalRoot, sourceRelativePath.replace(/^audio\//u, ''));
  if (existsSync(external)) return external;
  fail(`web_content_resource_missing:${sourceRelativePath}`);
}

function shardForPath(path) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < path.length; index += 1) {
    hash ^= path.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % assetShardCount;
}

function run(command, args, options = {}) {
  return execFileSync(command, args, { cwd: root, stdio: 'inherit', ...options });
}

function vercel(args, options = {}) {
  return run('pnpm', ['dlx', 'vercel@latest', ...args, '--scope', vercelScope], options);
}

function ensureProject(projectName, directory) {
  try {
    vercel(['project', 'inspect', projectName], { stdio: 'ignore' });
  } catch {
    vercel(['project', 'add', projectName]);
  }
  vercel(['link', '--yes', '--team', vercelScope, '--project', projectName, '--cwd', directory]);
}

function deployProject(projectName, directory) {
  ensureProject(projectName, directory);
  vercel(
    ['--prod', '--yes', '--local-config', join(directory, 'vercel.json')],
    { cwd: directory },
  );
}

function staticVercelConfig() {
  return `${JSON.stringify({
    $schema: 'https://openapi.vercel.sh/vercel.json',
    framework: null,
    headers: [{
      source: '/(.*)',
      headers: [
        { key: 'Access-Control-Allow-Origin', value: '*' },
        { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
      ],
    }],
  }, null, 2)}\n`;
}

function prepareRelease() {
  run(process.execPath, ['tools/question-bank-content.mjs', 'build']);
  run(process.execPath, ['tools/question-bank-content.mjs', 'check', '--full']);
  run(process.execPath, ['tools/vocabulary-content.mjs', 'check']);
  run(process.execPath, ['tools/editorial-content.mjs', 'build']);

  const questionBankManifest = readJson(join(questionBankReleaseRoot, 'manifest.json'));
  if (!Number.isInteger(expectedReleaseVersion) || expectedReleaseVersion <= 0) {
    fail(`web_content_release_version_invalid:${expectedReleaseVersion}`);
  }
  if (questionBankManifest.releaseVersion !== expectedReleaseVersion) {
    fail(`web_content_release_mismatch:expected=${expectedReleaseVersion}:actual=${questionBankManifest.releaseVersion}`);
  }
  const resourceSource = readJson(join(questionBankRoot, 'resources/manifest.source.json'));
  const vocabularyBytes = readFileSync(join(root, 'content/vocabulary/dataset.json'));
  const editorialManifestBytes = readFileSync(join(editorialReleaseRoot, 'manifest.json'));
  const releaseChecksum = sha256(Buffer.concat([
    readFileSync(join(questionBankReleaseRoot, 'manifest.json')),
    readFileSync(join(questionBankReleaseRoot, 'resources/manifest.json')),
    vocabularyBytes,
    editorialManifestBytes,
  ]));
  const releaseId = `app-qb-v${questionBankManifest.releaseVersion}-${releaseChecksum.slice(0, 16)}`;
  const projectPrefix = `feizhuicao-v${questionBankManifest.releaseVersion}-${releaseChecksum.slice(0, 8)}`;
  const metadataProject = `${projectPrefix}-content`;
  const assetShardTemplate = `https://${projectPrefix}-a{shard}.vercel.app`;
  const baseUrl = `https://${metadataProject}.vercel.app/web-content/releases/${releaseId}`;
  const pointerUrl = `https://${metadataProject}.vercel.app/web-content/current.json`;
  const stagingRoot = mkdtempSync(join(tmpdir(), `icao-web-${releaseId}-`));
  const shardDirectories = Array.from({ length: assetShardCount }, (_, index) =>
    join(stagingRoot, `asset-${String(index + 1).padStart(2, '0')}`));
  const shardBytes = Array(assetShardCount).fill(0);
  const shardFiles = Array(assetShardCount).fill(0);

  for (const [index, directory] of shardDirectories.entries()) {
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, 'vercel.json'), staticVercelConfig());
    writeFileSync(join(directory, 'release.json'), `${JSON.stringify({
      releaseId,
      releaseChecksum,
      shard: index + 1,
      shardCount: assetShardCount,
    }, null, 2)}\n`);
  }
  for (const resource of resourceSource.files) {
    const shard = shardForPath(resource.publicPath);
    const source = questionBankResourcePath(resource.sourceRelativePath);
    copy(source, join(shardDirectories[shard], resource.publicPath.replace(/^\//u, '')));
    shardBytes[shard] += statSync(source).size;
    shardFiles[shard] += 1;
  }
  if (Math.max(...shardBytes) >= 95_000_000) {
    fail(`web_content_static_shard_too_large:${Math.max(...shardBytes)}`);
  }

  const metadataDirectory = join(stagingRoot, 'metadata');
  const releaseDirectory = join(metadataDirectory, 'web-content/releases', releaseId);
  mkdirSync(releaseDirectory, { recursive: true });
  writeFileSync(join(metadataDirectory, 'vercel.json'), staticVercelConfig());
  for (const bank of questionBankManifest.banks) {
    copy(join(questionBankReleaseRoot, bank.file), join(releaseDirectory, 'question-bank', bank.file));
  }
  for (const path of ['manifest.json', 'resources/manifest.json']) {
    copy(join(questionBankReleaseRoot, path), join(releaseDirectory, 'question-bank', path));
  }
  copy(join(root, 'content/vocabulary/dataset.json'), join(releaseDirectory, 'vocabulary/dataset.json'));
  for (const path of ['release.json', 'manifest.json']) {
    copy(join(editorialReleaseRoot, path), join(releaseDirectory, 'editorial', path));
  }
  const editorialManifest = readJson(join(editorialReleaseRoot, 'manifest.json'));
  for (const asset of editorialManifest.assets) {
    copy(join(editorialReleaseRoot, asset.file), join(releaseDirectory, asset.publicPath.replace(/^\//u, '')));
  }

  const manifest = {
    schemaVersion: 2,
    releaseId,
    releaseChecksum,
    appQuestionBankReleaseVersion: questionBankManifest.releaseVersion,
    appQuestionBankReleasedAt: questionBankManifest.releasedAt,
    questionBanks: questionBankManifest.banks,
    resources: {
      files: resourceSource.files.length,
      sizeBytes: resourceSource.files.reduce((sum, item) => sum + item.sizeBytes, 0),
      shardCount: assetShardCount,
      shardBytes,
      shardFiles,
    },
    vocabulary: { words: 838, checksum: sha256(vocabularyBytes) },
    editorial: { version: editorialManifest.version, checksum: editorialManifest.checksum },
  };
  writeFileSync(join(releaseDirectory, 'web-release.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  const pointer = {
    schemaVersion: 2,
    releaseId,
    releaseChecksum,
    baseUrl,
    assetShardCount,
    assetShardTemplate,
    promotedAt: new Date().toISOString(),
  };
  mkdirSync(join(metadataDirectory, 'web-content'), { recursive: true });
  writeFileSync(join(metadataDirectory, 'web-content/current.json'), `${JSON.stringify(pointer, null, 2)}\n`);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify({ ...pointer, pointerUrl, manifest }, null, 2)}\n`);
  return {
    assetShardTemplate,
    baseUrl,
    manifest,
    metadataDirectory,
    metadataProject,
    pointer,
    pointerUrl,
    projectPrefix,
    releaseId,
    shardDirectories,
    stagingRoot,
  };
}

function main() {
  const prepared = prepareRelease();
  console.log(`web_content_static_prepared release=${prepared.releaseId} staging=${prepared.stagingRoot}`);
  if (prepareOnly) return;
  prepared.shardDirectories.forEach((directory, index) => {
    const projectName = `${prepared.projectPrefix}-a${String(index + 1).padStart(2, '0')}`;
    console.log(`web_content_static_deploy shard=${index + 1}/${assetShardCount} project=${projectName}`);
    deployProject(projectName, directory);
  });
  console.log(`web_content_static_deploy metadata project=${prepared.metadataProject}`);
  deployProject(prepared.metadataProject, prepared.metadataDirectory);
  console.log(`web_content_sync_ok release=${prepared.releaseId} base=${prepared.baseUrl} pointer=${prepared.pointerUrl} assets=${prepared.assetShardTemplate}`);
  rmSync(prepared.stagingRoot, { recursive: true, force: true });
}

main();
