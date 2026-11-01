/** Loopback-only I/O comparison, not a phone or production capacity benchmark.
 * Run: pnpm --dir services/api exec tsx ../../tools/benchmarks/download-resource-workers.ts
 */
import { createServer } from 'node:http';
import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { runResourceWorkers } from '../../src/features/question-bank/downloads/resource-work-queue';

async function main() {
  const directory = await mkdtemp(join(tmpdir(), 'icao-download-benchmark-'));
  const key = randomBytes(32);
  const samples: Record<string, unknown>[] = [];
  let payload = Buffer.alloc(0), active = 0, maxActive = 0;
  const server = createServer((_request, response) => {
    maxActive = Math.max(maxActive, ++active);
    // Controlled per-request latency makes the old sequential idle time measurable.
    setTimeout(() => { response.writeHead(200, { 'content-length': payload.length }); response.end(payload); active--; }, 25);
  });
  try {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as { port: number };
    const url = `http://127.0.0.1:${address.port}/audio`;
    for (const shape of [{ name: 'many-small', count: 96, bytes: 128 * 1024 }, { name: 'few-large', count: 3, bytes: 4 * 1024 * 1024 }]) {
      payload = Buffer.alloc(shape.bytes, 71);
      const expected = createHash('sha256').update(payload).digest('hex');
      for (let repeat = 0; repeat < 3; repeat++) {
        // Rotate order to avoid consistently giving one policy warm caches.
        const limits = [[1, 2, 4], [4, 1, 2], [2, 4, 1]][repeat];
        for (const concurrency of limits) {
          const paths: string[] = []; maxActive = 0;
          let processing = Promise.resolve();
          const start = performance.now();
          await runResourceWorkers(Array.from({ length: shape.count }, (_, i) => i), concurrency, () => true, async index => {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`http_${response.status}`);
            // Native implementation stages to disk before entering its processing gate.
            const staging = join(directory, `${index}.part`);
            await writeFile(staging, Buffer.from(await response.arrayBuffer()));
            const work = processing.then(async () => {
              const bytes = await readFile(staging);
              if (createHash('sha256').update(bytes).digest('hex') !== expected) throw new Error('checksum_mismatch');
              const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
              const encrypted = Buffer.concat([cipher.update(bytes), cipher.final()]);
              const path = join(directory, `${index}.sealed`);
              await writeFile(path, Buffer.concat([iv, cipher.getAuthTag(), encrypted]));
              await rm(staging); paths.push(path);
            });
            processing = work; await work;
          });
          const transferMs = performance.now() - start;
          for (const path of paths) {
            const sealed = await readFile(path), decipher = createDecipheriv('aes-256-gcm', key, sealed.subarray(0, 12));
            decipher.setAuthTag(sealed.subarray(12, 28));
            const bytes = Buffer.concat([decipher.update(sealed.subarray(28)), decipher.final()]);
            if (bytes.length !== shape.bytes || createHash('sha256').update(bytes).digest('hex') !== expected) throw new Error('final_verification_failed');
          }
          const totalMs = performance.now() - start;
          samples.push({ shape: shape.name, repeat: repeat + 1, concurrency, requests: shape.count, bytes: shape.count * shape.bytes,
            maxConcurrentRequests: maxActive, transferAndSealMs: Math.round(transferMs), fullVerificationMs: Math.round(totalMs - transferMs), totalMs: Math.round(totalMs) });
          await Promise.all(paths.map(path => rm(path)));
        }
      }
    }
    const summaries = ['many-small', 'few-large'].flatMap(shape => [1, 2, 4].map(concurrency => {
      const durations = samples.filter(sample => sample.shape === shape && sample.concurrency === concurrency).map(sample => sample.totalMs as number).sort((a, b) => a - b);
      return { shape, concurrency, medianMs: durations[1], minMs: durations[0], maxMs: durations[2] };
    }));
    console.log(JSON.stringify({ measuredAt: new Date().toISOString(), environment: 'Node loopback HTTP; 25ms controlled latency; synthetic 12MiB payloads; real disk/SHA/AES-GCM and final verification',
      limits: 'Not Expo/native bridge, device memory, Internet speed or server capacity evidence. Production default remains two bulk transfers, reduced to one during audio.', samples, summaries }, null, 2));
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); await rm(directory, { recursive: true, force: true }); }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
