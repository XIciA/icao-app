import { createHash } from 'node:crypto';
import {
  mkdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const defaultOutputDirectory = join(root, 'dist/web-content');
const pointerUrl = process.env.ICAO_WEB_CONTENT_POINTER_URL
  ?? process.env.EXPO_PUBLIC_ICAO_WEB_CONTENT_POINTER_URL;
const outputDirectory = resolve(
  process.env.ICAO_WEB_CONTENT_OUTPUT_DIRECTORY ?? defaultOutputDirectory,
);
const requestTimeoutMilliseconds = Number(
  process.env.ICAO_WEB_CONTENT_REQUEST_TIMEOUT_MS ?? 60_000,
);

function fail(message) {
  throw new Error(message);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function validHttpUrl(value) {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      || (url.protocol === 'http:' && ['127.0.0.1', 'localhost', '::1'].includes(url.hostname));
  } catch {
    return false;
  }
}

function validChecksum(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
}

function validReleaseId(value) {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,127}$/u.test(value);
}

function validPointer(value) {
  return value
    && typeof value === 'object'
    && validReleaseId(value.releaseId)
    && validChecksum(value.releaseChecksum)
    && validHttpUrl(value.baseUrl);
}

function safeDestination(baseDirectory, relativePath) {
  if (
    typeof relativePath !== 'string'
    || !relativePath
    || relativePath.includes('\\')
    || relativePath.includes('\0')
    || relativePath.split('/').some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    fail('web_content_path_invalid');
  }
  const destination = resolve(baseDirectory, relativePath);
  if (!destination.startsWith(`${resolve(baseDirectory)}${sep}`)) {
    fail('web_content_destination_escape');
  }
  return destination;
}

async function fetchBytes(url, label) {
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        cache: 'no-store',
        signal: AbortSignal.timeout(requestTimeoutMilliseconds),
      });
      if (!response.ok) throw new Error(`http_${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      lastError = error;
      if (attempt < 4) {
        await new Promise((resolvePromise) => setTimeout(resolvePromise, attempt * 250));
      }
    }
  }
  const code = lastError instanceof Error ? lastError.message : 'unknown';
  fail(`web_content_fetch_failed:${label}:${code}`);
}

async function fetchJson(url, label) {
  const bytes = await fetchBytes(url, label);
  try {
    return { bytes, value: JSON.parse(bytes.toString('utf8')) };
  } catch {
    fail(`web_content_json_invalid:${label}`);
  }
}

function artifactUrl(baseUrl, path) {
  return `${baseUrl.replace(/\/+$/u, '')}/${path.replace(/^\/+/u, '')}`;
}

async function writeArtifact(releaseDirectory, relativePath, bytes) {
  const destination = safeDestination(releaseDirectory, relativePath);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, bytes);
}

function validateVocabulary(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.books)) {
    fail('web_content_vocabulary_invalid');
  }
  const expected = new Map([['preview', 360], ['icao4', 372], ['icao5', 106]]);
  if (
    value.schemaVersion !== 1
    || value.books.length !== expected.size
    || value.books.some((book) => expected.get(book?.id) !== book?.words?.length)
    || value.books.reduce((sum, book) => sum + book.words.length, 0) !== 838
  ) {
    fail('web_content_vocabulary_shape_invalid');
  }
}

function validateEditorialManifest(value) {
  if (
    !value
    || typeof value !== 'object'
    || value.schemaVersion !== 1
    || !Number.isInteger(value.version)
    || !validChecksum(value.checksum)
    || !Array.isArray(value.assets)
  ) {
    fail('web_content_editorial_manifest_invalid');
  }
  const paths = new Set();
  for (const asset of value.assets) {
    if (
      typeof asset?.publicPath !== 'string'
      || !asset.publicPath.startsWith('/editorial-assets/')
      || !Number.isInteger(asset.sizeBytes)
      || asset.sizeBytes < 0
      || !validChecksum(asset.checksum)
      || paths.has(asset.publicPath)
    ) {
      fail('web_content_editorial_asset_invalid');
    }
    paths.add(asset.publicPath);
  }
}

function validateEditorialRelease(value, manifest) {
  if (
    !value
    || typeof value !== 'object'
    || value.schemaVersion !== 1
    || value.version !== manifest.version
    || !Array.isArray(value.articles)
  ) {
    fail('web_content_editorial_release_invalid');
  }
  const assets = new Map(manifest.assets.map((asset) => [asset.publicPath, asset]));
  for (const article of value.articles) {
    const asset = assets.get(article?.cover?.publicPath);
    if (
      !asset
      || article.cover.checksum !== asset.checksum
      || article.cover.sizeBytes !== asset.sizeBytes
    ) {
      fail('web_content_editorial_cover_invalid');
    }
  }
}

function assertOutputDirectory() {
  if (!isAbsolute(outputDirectory) || outputDirectory === resolve('/') || outputDirectory === root) {
    fail('web_content_output_directory_unsafe');
  }
}

function assertReleaseMatchesEnvironment(pointer) {
  const expectedRelease = process.env.EXPO_PUBLIC_ICAO_WEB_CONTENT_RELEASE;
  const expectedChecksum = process.env.EXPO_PUBLIC_ICAO_WEB_CONTENT_CHECKSUM;
  if (expectedRelease && pointer.releaseId !== expectedRelease) {
    fail('web_content_release_mismatch');
  }
  if (expectedChecksum && pointer.releaseChecksum !== expectedChecksum) {
    fail('web_content_release_checksum_mismatch');
  }
}

async function materialize() {
  assertOutputDirectory();
  if (!pointerUrl || !validHttpUrl(pointerUrl)) fail('web_content_pointer_missing');
  if (
    !Number.isInteger(requestTimeoutMilliseconds)
    || requestTimeoutMilliseconds < 1_000
    || requestTimeoutMilliseconds > 300_000
  ) {
    fail('web_content_timeout_invalid');
  }

  const pointerResult = await fetchJson(pointerUrl, 'pointer');
  const pointer = pointerResult.value;
  if (!validPointer(pointer)) fail('web_content_pointer_invalid');
  assertReleaseMatchesEnvironment(pointer);

  const webReleaseResult = await fetchJson(
    artifactUrl(pointer.baseUrl, 'web-release.json'),
    'web_release',
  );
  const webRelease = webReleaseResult.value;
  if (
    !webRelease
    || typeof webRelease !== 'object'
    || webRelease.schemaVersion !== 2
    || webRelease.releaseId !== pointer.releaseId
    || webRelease.releaseChecksum !== pointer.releaseChecksum
    || webRelease.vocabulary?.words !== 838
    || !validChecksum(webRelease.vocabulary?.checksum)
    || !Number.isInteger(webRelease.editorial?.version)
    || !validChecksum(webRelease.editorial?.checksum)
  ) {
    fail('web_content_release_invalid');
  }

  const [vocabularyResult, editorialManifestResult, editorialReleaseResult] = await Promise.all([
    fetchJson(artifactUrl(pointer.baseUrl, 'vocabulary/dataset.json'), 'vocabulary'),
    fetchJson(artifactUrl(pointer.baseUrl, 'editorial/manifest.json'), 'editorial_manifest'),
    fetchJson(artifactUrl(pointer.baseUrl, 'editorial/release.json'), 'editorial_release'),
  ]);
  validateVocabulary(vocabularyResult.value);
  if (sha256(vocabularyResult.bytes) !== webRelease.vocabulary.checksum) {
    fail('web_content_vocabulary_checksum_mismatch');
  }

  const editorialManifest = editorialManifestResult.value;
  validateEditorialManifest(editorialManifest);
  if (
    editorialManifest.version !== webRelease.editorial.version
    || editorialManifest.checksum !== webRelease.editorial.checksum
    || sha256(editorialReleaseResult.bytes) !== editorialManifest.checksum
  ) {
    fail('web_content_editorial_checksum_mismatch');
  }
  validateEditorialRelease(editorialReleaseResult.value, editorialManifest);

  const assetResults = await Promise.all(editorialManifest.assets.map(async (asset, index) => {
    const bytes = await fetchBytes(
      artifactUrl(pointer.baseUrl, asset.publicPath),
      `editorial_asset_${index + 1}`,
    );
    if (bytes.length !== asset.sizeBytes) fail(`web_content_asset_size_mismatch:${index + 1}`);
    if (sha256(bytes) !== asset.checksum) fail(`web_content_asset_checksum_mismatch:${index + 1}`);
    return { asset, bytes };
  }));

  const stagingDirectory = join(
    dirname(outputDirectory),
    `.web-content-${process.pid}-${Date.now()}`,
  );
  await rm(stagingDirectory, { force: true, recursive: true });
  const releaseDirectory = join(stagingDirectory, 'releases', pointer.releaseId);
  await mkdir(releaseDirectory, { recursive: true });

  try {
    await Promise.all([
      writeArtifact(releaseDirectory, 'web-release.json', webReleaseResult.bytes),
      writeArtifact(releaseDirectory, 'vocabulary/dataset.json', vocabularyResult.bytes),
      writeArtifact(releaseDirectory, 'editorial/manifest.json', editorialManifestResult.bytes),
      writeArtifact(releaseDirectory, 'editorial/release.json', editorialReleaseResult.bytes),
      ...assetResults.map(({ asset, bytes }) =>
        writeArtifact(releaseDirectory, asset.publicPath.replace(/^\//u, ''), bytes)),
    ]);
    const localPointer = {
      ...pointer,
      baseUrl: `/web-content/releases/${pointer.releaseId}`,
    };
    await writeFile(
      join(stagingDirectory, 'current.json'),
      `${JSON.stringify(localPointer, null, 2)}\n`,
    );
    await rm(outputDirectory, { force: true, recursive: true });
    await rename(stagingDirectory, outputDirectory);
    const totalBytes = vocabularyResult.bytes.length
      + editorialManifestResult.bytes.length
      + editorialReleaseResult.bytes.length
      + webReleaseResult.bytes.length
      + assetResults.reduce((sum, { bytes }) => sum + bytes.length, 0);
    console.log(
      `web_content_materialized release=${pointer.releaseId} vocabulary=838 articles=${editorialReleaseResult.value.articles.length} assets=${assetResults.length} bytes=${totalBytes}`,
    );
  } catch (error) {
    await rm(stagingDirectory, { force: true, recursive: true });
    throw error;
  }
}

await materialize();
