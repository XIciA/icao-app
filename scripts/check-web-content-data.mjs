import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const root = resolve(import.meta.dirname, '..');
const materializer = join(root, 'scripts/materialize-web-content-data.mjs');
const tempDirectory = await mkdtemp(join(tmpdir(), 'icao-web-content-check-'));
const outputDirectory = join(tempDirectory, 'web-content');
const releaseId = 'app-qb-v10-test';
const releaseChecksum = 'a'.repeat(64);
const cover = Buffer.from('editorial-cover-fixture');
let corruptCover = false;

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

function words(bookId, count) {
  return Array.from({ length: count }, (_, index) => ({ id: `${bookId}-${index}` }));
}

const vocabulary = jsonBytes({
  schemaVersion: 1,
  books: [
    { id: 'preview', words: words('preview', 360) },
    { id: 'icao4', words: words('icao4', 372) },
    { id: 'icao5', words: words('icao5', 106) },
  ],
});
const coverChecksum = sha256(cover);
const editorialRelease = jsonBytes({
  schemaVersion: 1,
  version: 2,
  articles: [{
    slug: 'test-article',
    cover: {
      publicPath: '/editorial-assets/test-article/cover.jpg',
      checksum: coverChecksum,
      sizeBytes: cover.length,
    },
  }],
});
const editorialManifest = jsonBytes({
  schemaVersion: 1,
  version: 2,
  checksum: sha256(editorialRelease),
  assets: [{
    publicPath: '/editorial-assets/test-article/cover.jpg',
    checksum: coverChecksum,
    sizeBytes: cover.length,
  }],
});
const webRelease = jsonBytes({
  schemaVersion: 2,
  releaseId,
  releaseChecksum,
  vocabulary: { words: 838, checksum: sha256(vocabulary) },
  editorial: { version: 2, checksum: sha256(editorialRelease) },
});

const server = createServer((request, response) => {
  const origin = `http://127.0.0.1:${server.address().port}`;
  const responses = new Map([
    ['/pointer.json', jsonBytes({
      schemaVersion: 2,
      releaseId,
      releaseChecksum,
      baseUrl: `${origin}/release`,
    })],
    ['/release/web-release.json', webRelease],
    ['/release/vocabulary/dataset.json', vocabulary],
    ['/release/editorial/manifest.json', editorialManifest],
    ['/release/editorial/release.json', editorialRelease],
    ['/release/editorial-assets/test-article/cover.jpg', corruptCover ? Buffer.from('corrupt') : cover],
  ]);
  const body = responses.get(request.url);
  if (!body) {
    response.statusCode = 404;
    response.end('missing');
    return;
  }
  response.end(body);
});

await new Promise((resolvePromise, rejectPromise) => {
  server.once('error', rejectPromise);
  server.listen(0, '127.0.0.1', resolvePromise);
});

const pointerUrl = `http://127.0.0.1:${server.address().port}/pointer.json`;
const environment = {
  ...process.env,
  ICAO_WEB_CONTENT_OUTPUT_DIRECTORY: outputDirectory,
  ICAO_WEB_CONTENT_POINTER_URL: pointerUrl,
  EXPO_PUBLIC_ICAO_WEB_CONTENT_CHECKSUM: releaseChecksum,
  EXPO_PUBLIC_ICAO_WEB_CONTENT_RELEASE: releaseId,
};

try {
  await execFileAsync(process.execPath, [materializer], {
    cwd: root,
    env: environment,
    maxBuffer: 1_000_000,
    timeout: 30_000,
  });
  const releaseDirectory = join(outputDirectory, 'releases', releaseId);
  const [pointerOutput, vocabularyOutput, editorialOutput, coverOutput] = await Promise.all([
    readFile(join(outputDirectory, 'current.json'), 'utf8'),
    readFile(join(releaseDirectory, 'vocabulary/dataset.json')),
    readFile(join(releaseDirectory, 'editorial/release.json')),
    readFile(join(releaseDirectory, 'editorial-assets/test-article/cover.jpg')),
  ]);
  const pointer = JSON.parse(pointerOutput);
  if (
    pointer.releaseId !== releaseId
    || pointer.releaseChecksum !== releaseChecksum
    || pointer.baseUrl !== `/web-content/releases/${releaseId}`
  ) {
    throw new Error('web_content_check_pointer_mismatch');
  }
  if (
    !vocabularyOutput.equals(vocabulary)
    || !editorialOutput.equals(editorialRelease)
    || !coverOutput.equals(cover)
  ) {
    throw new Error('web_content_check_output_mismatch');
  }

  corruptCover = true;
  let rejectedCorruptAsset = false;
  try {
    await execFileAsync(process.execPath, [materializer], {
      cwd: root,
      env: {
        ...environment,
        ICAO_WEB_CONTENT_OUTPUT_DIRECTORY: join(tempDirectory, 'corrupt-output'),
      },
      maxBuffer: 1_000_000,
      timeout: 30_000,
    });
  } catch (error) {
    rejectedCorruptAsset = String(error?.stderr ?? error).includes('web_content_asset_size_mismatch')
      || String(error?.stderr ?? error).includes('web_content_asset_checksum_mismatch');
  }
  if (!rejectedCorruptAsset) throw new Error('web_content_check_corruption_not_rejected');
  console.log('web_content_data_check_ok');
} finally {
  server.close();
  await rm(tempDirectory, { force: true, recursive: true });
}
