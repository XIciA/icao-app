import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const root = resolve(import.meta.dirname, '..');
const materializer = join(root, 'scripts/materialize-web-question-bank-assets.mjs');
const tempDirectory = await mkdtemp(join(tmpdir(), 'icao-web-assets-check-'));
const outputDirectory = join(tempDirectory, 'question-bank-assets');
const firstAsset = Buffer.from('first-audio-fixture');
const secondAsset = Buffer.from('second-image-fixture');
const releaseChecksum = 'a'.repeat(64);
let corruptSecondAsset = false;

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function shardForPath(path, count) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < path.length; index += 1) {
    hash ^= path.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % count;
}

const resources = [
  {
    checksum: sha256(firstAsset),
    publicPath: '/question-bank-assets/audio/listening/main/001.mp3',
    sizeBytes: firstAsset.length,
    status: 'ready',
  },
  {
    checksum: sha256(secondAsset),
    publicPath: '/question-bank-assets/images/opi/image-questions/image-topic-001.jpg',
    sizeBytes: secondAsset.length,
    status: 'ready',
  },
];

const server = createServer((request, response) => {
  const origin = `http://127.0.0.1:${server.address().port}`;
  if (request.url === '/pointer.json') {
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({
      assetShardCount: 2,
      assetShardTemplate: `${origin}/asset-{shard}`,
      baseUrl: `${origin}/content/`,
      releaseChecksum,
      releaseId: 'app-qb-v10-test',
    }));
    return;
  }
  if (request.url === '/content/question-bank/resources/manifest.json') {
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ files: resources, schemaVersion: 1 }));
    return;
  }
  const resource = resources.find((candidate) => {
    const shard = String(shardForPath(candidate.publicPath, 2) + 1).padStart(2, '0');
    return request.url === `/asset-${shard}${candidate.publicPath}`;
  });
  if (!resource) {
    response.statusCode = 404;
    response.end('missing');
    return;
  }
  if (resource === resources[0]) response.end(firstAsset);
  else response.end(corruptSecondAsset ? Buffer.from('corrupt') : secondAsset);
});

await new Promise((resolvePromise, rejectPromise) => {
  server.once('error', rejectPromise);
  server.listen(0, '127.0.0.1', resolvePromise);
});

const pointerUrl = `http://127.0.0.1:${server.address().port}/pointer.json`;
const environment = {
  ...process.env,
  ICAO_WEB_ASSET_CONCURRENCY: '2',
  ICAO_WEB_ASSET_OUTPUT_DIRECTORY: outputDirectory,
  ICAO_WEB_ASSET_POINTER_URL: pointerUrl,
};

try {
  await execFileAsync(process.execPath, [materializer], {
    cwd: root,
    env: environment,
    maxBuffer: 1_000_000,
    timeout: 30_000,
  });
  const [firstOutput, secondOutput, releaseOutput] = await Promise.all([
    readFile(join(outputDirectory, 'audio/listening/main/001.mp3')),
    readFile(join(outputDirectory, 'images/opi/image-questions/image-topic-001.jpg')),
    readFile(join(outputDirectory, 'release.json'), 'utf8'),
  ]);
  if (!firstOutput.equals(firstAsset) || !secondOutput.equals(secondAsset)) {
    throw new Error('web_asset_check_output_mismatch');
  }
  const release = JSON.parse(releaseOutput);
  if (
    release.releaseId !== 'app-qb-v10-test'
    || release.releaseChecksum !== releaseChecksum
    || release.files !== 2
    || release.sizeBytes !== firstAsset.length + secondAsset.length
  ) {
    throw new Error('web_asset_check_release_mismatch');
  }

  corruptSecondAsset = true;
  let rejectedCorruptAsset = false;
  try {
    await execFileAsync(process.execPath, [materializer], {
      cwd: root,
      env: {
        ...environment,
        ICAO_WEB_ASSET_OUTPUT_DIRECTORY: join(tempDirectory, 'corrupt-output'),
      },
      maxBuffer: 1_000_000,
      timeout: 30_000,
    });
  } catch (error) {
    rejectedCorruptAsset = String(error?.stderr ?? error).includes('web_asset_size_mismatch')
      || String(error?.stderr ?? error).includes('web_asset_checksum_mismatch');
  }
  if (!rejectedCorruptAsset) throw new Error('web_asset_check_corruption_not_rejected');
  console.log('web_question_bank_assets_check_ok');
} finally {
  server.close();
  await rm(tempDirectory, { force: true, recursive: true });
}
