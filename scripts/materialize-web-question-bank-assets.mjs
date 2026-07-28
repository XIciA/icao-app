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
const defaultOutputDirectory = join(root, 'dist/question-bank-assets');
const pointerUrl = process.env.ICAO_WEB_ASSET_POINTER_URL
  ?? process.env.EXPO_PUBLIC_ICAO_WEB_CONTENT_POINTER_URL;
const outputDirectory = resolve(
  process.env.ICAO_WEB_ASSET_OUTPUT_DIRECTORY ?? defaultOutputDirectory,
);
const concurrency = Number(process.env.ICAO_WEB_ASSET_CONCURRENCY ?? 40);
const requestTimeoutMilliseconds = Number(
  process.env.ICAO_WEB_ASSET_REQUEST_TIMEOUT_MS ?? 60_000,
);
const publicPrefix = '/question-bank-assets/';

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

function validPointer(value) {
  return value
    && typeof value === 'object'
    && typeof value.releaseId === 'string'
    && /^[a-f0-9]{64}$/u.test(value.releaseChecksum)
    && validHttpUrl(value.baseUrl)
    && Number.isInteger(value.assetShardCount)
    && value.assetShardCount > 0
    && validHttpUrl(value.assetShardTemplate?.replace('{shard}', '01'))
    && value.assetShardTemplate.includes('{shard}');
}

function validResource(value) {
  return value
    && typeof value === 'object'
    && typeof value.publicPath === 'string'
    && value.publicPath.startsWith(publicPrefix)
    && Number.isInteger(value.sizeBytes)
    && value.sizeBytes >= 0
    && typeof value.checksum === 'string'
    && /^[a-f0-9]{64}$/u.test(value.checksum)
    && value.status === 'ready';
}

function shardForPath(path, count) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < path.length; index += 1) {
    hash ^= path.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % count;
}

function resourceUrl(resource, pointer) {
  const shard = String(shardForPath(resource.publicPath, pointer.assetShardCount) + 1)
    .padStart(2, '0');
  const baseUrl = pointer.assetShardTemplate.replace('{shard}', shard).replace(/\/+$/u, '');
  return `${baseUrl}${resource.publicPath}`;
}

function resourceDestination(stagingDirectory, publicPath) {
  const relativePath = publicPath.slice(publicPrefix.length);
  if (
    !relativePath
    || relativePath.includes('\\')
    || relativePath.includes('\0')
    || relativePath.split('/').some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    fail('web_asset_public_path_invalid');
  }
  const destination = resolve(stagingDirectory, relativePath);
  if (!destination.startsWith(`${resolve(stagingDirectory)}${sep}`)) {
    fail('web_asset_destination_escape');
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
  fail(`web_asset_fetch_failed:${label}:${code}`);
}

async function fetchJson(url, label) {
  const bytes = await fetchBytes(url, label);
  try {
    return { bytes, value: JSON.parse(bytes.toString('utf8')) };
  } catch {
    fail(`web_asset_json_invalid:${label}`);
  }
}

function assertOutputDirectory() {
  if (!isAbsolute(outputDirectory) || outputDirectory === resolve('/') || outputDirectory === root) {
    fail('web_asset_output_directory_unsafe');
  }
}

function assertReleaseMatchesEnvironment(pointer) {
  const expectedRelease = process.env.EXPO_PUBLIC_ICAO_WEB_CONTENT_RELEASE;
  const expectedChecksum = process.env.EXPO_PUBLIC_ICAO_WEB_CONTENT_CHECKSUM;
  if (expectedRelease && pointer.releaseId !== expectedRelease) {
    fail('web_asset_release_mismatch');
  }
  if (expectedChecksum && pointer.releaseChecksum !== expectedChecksum) {
    fail('web_asset_release_checksum_mismatch');
  }
}

async function materialize() {
  assertOutputDirectory();
  if (!pointerUrl || !validHttpUrl(pointerUrl)) fail('web_asset_pointer_missing');
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 64) {
    fail('web_asset_concurrency_invalid');
  }
  if (
    !Number.isInteger(requestTimeoutMilliseconds)
    || requestTimeoutMilliseconds < 1_000
    || requestTimeoutMilliseconds > 300_000
  ) {
    fail('web_asset_timeout_invalid');
  }

  const pointerResult = await fetchJson(pointerUrl, 'pointer');
  const pointer = pointerResult.value;
  if (!validPointer(pointer)) fail('web_asset_pointer_invalid');
  assertReleaseMatchesEnvironment(pointer);

  const manifestUrl = new URL(
    'question-bank/resources/manifest.json',
    `${pointer.baseUrl.replace(/\/+$/u, '')}/`,
  ).toString();
  const manifestResult = await fetchJson(manifestUrl, 'manifest');
  const manifest = manifestResult.value;
  if (!manifest || typeof manifest !== 'object' || !Array.isArray(manifest.files)) {
    fail('web_asset_manifest_invalid');
  }
  if (!manifest.files.length || !manifest.files.every(validResource)) {
    fail('web_asset_manifest_resource_invalid');
  }

  const publicPaths = new Set(manifest.files.map((resource) => resource.publicPath));
  if (publicPaths.size !== manifest.files.length || publicPaths.has(`${publicPrefix}release.json`)) {
    fail('web_asset_manifest_path_collision');
  }

  const stagingDirectory = join(
    dirname(outputDirectory),
    `.question-bank-assets-${process.pid}-${Date.now()}`,
  );
  await rm(stagingDirectory, { force: true, recursive: true });
  await mkdir(stagingDirectory, { recursive: true });

  let cursor = 0;
  let completedFiles = 0;
  let completedBytes = 0;
  const totalBytes = manifest.files.reduce((sum, resource) => sum + resource.sizeBytes, 0);

  async function worker() {
    while (cursor < manifest.files.length) {
      const index = cursor;
      cursor += 1;
      const resource = manifest.files[index];
      const bytes = await fetchBytes(resourceUrl(resource, pointer), `resource_${index + 1}`);
      if (bytes.length !== resource.sizeBytes) fail(`web_asset_size_mismatch:${index + 1}`);
      if (sha256(bytes) !== resource.checksum) fail(`web_asset_checksum_mismatch:${index + 1}`);
      const destination = resourceDestination(stagingDirectory, resource.publicPath);
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, bytes);
      completedFiles += 1;
      completedBytes += bytes.length;
      if (completedFiles % 250 === 0 || completedFiles === manifest.files.length) {
        console.log(
          `web_assets_progress files=${completedFiles}/${manifest.files.length} bytes=${completedBytes}/${totalBytes}`,
        );
      }
    }
  }

  try {
    await Promise.all(
      Array.from(
        { length: Math.min(concurrency, manifest.files.length) },
        () => worker(),
      ),
    );
    const release = {
      schemaVersion: 1,
      releaseId: pointer.releaseId,
      releaseChecksum: pointer.releaseChecksum,
      resourceManifestChecksum: sha256(manifestResult.bytes),
      files: manifest.files.length,
      sizeBytes: totalBytes,
    };
    await writeFile(
      join(stagingDirectory, 'release.json'),
      `${JSON.stringify(release, null, 2)}\n`,
    );
    await rm(outputDirectory, { force: true, recursive: true });
    await rename(stagingDirectory, outputDirectory);
    console.log(
      `web_assets_materialized release=${release.releaseId} files=${release.files} bytes=${release.sizeBytes}`,
    );
  } catch (error) {
    await rm(stagingDirectory, { force: true, recursive: true });
    throw error;
  }
}

await materialize();
