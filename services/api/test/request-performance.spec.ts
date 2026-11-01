import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { registerRequestPerformance, timed, timedSync, countStatement, observeBackground } from '../src/performance/request-performance';

describe('request performance diagnostics', () => {
  it('isolates concurrent request stages and logs templates without credentials or content', async () => {
    const logs: Record<string, unknown>[] = [];
    const app = Fastify({ logger: { stream: { write: (line: string) => { logs.push(JSON.parse(line)); } } } });
    registerRequestPerformance(app, { sampleRate: 1 });
    app.get('/items/:id', async request => {
      const id = (request.params as { id: string }).id;
      await timed('lookup', async () => { await new Promise(resolve => setTimeout(resolve, id === 'first' ? 10 : 1)); countStatement(); });
      if (id === 'first') timedSync('first_only', () => 1);
      return { safe: true };
    });
    try {
      await Promise.all(['first', 'second'].map(id => app.inject({ url: `/items/${id}?secret=private`, headers: { authorization: 'Bearer never-log-me' } })));
      const traces = logs.filter(row => row.event === 'api_performance');
      expect(traces).toHaveLength(2);
      expect(traces.map(row => row.route)).toEqual(['/items/:id', '/items/:id']);
      expect(traces.every(row => Boolean(row.reqId))).toBe(true);
      expect(traces.filter(row => 'first_only' in (row.stages as object))).toHaveLength(1);
      for (const row of traces) expect(row.stages).toMatchObject({ lookup: { count: 1 }, 'db.statements': { count: 1 }, serialization: { count: 1 } });
      expect(JSON.stringify(traces)).not.toMatch(/never-log-me|private|\?secret/);
    } finally { await app.close(); }
  });
  it('always captures failures and can disable telemetry without changing responses', async () => {
    for (const enabled of [true, false]) {
      const logs: Record<string, unknown>[] = [];
      const app = Fastify({ logger: { stream: { write: (line: string) => { logs.push(JSON.parse(line)); } } } });
      registerRequestPerformance(app, { enabled, sampleRate: 0 });
      app.get('/fail', async () => timed('failed', async () => { throw new Error('synthetic'); }));
      try {
        expect((await app.inject('/fail')).statusCode).toBe(500);
        const traces = logs.filter(row => row.event === 'api_performance');
        expect(traces).toHaveLength(enabled ? 1 : 0);
        if (enabled) expect(traces[0]?.stages).toMatchObject({ failed: { count: 1 } });
      } finally { await app.close(); }
    }
  });
});

it('observes background failures without logging payloads or masking the original error', async () => {
  const entries: unknown[] = [];
  const cause = new Error('private payload');
  await expect(observeBackground('synthetic_job', async () => { countStatement(); throw cause; }, { log: value => { entries.push(value); } })).rejects.toBe(cause);
  expect(entries[0]).toMatchObject({ event: 'api_background', task: 'synthetic_job', outcome: 'rejected', statements: 1 });
  expect(JSON.stringify(entries)).not.toContain('private');
  expect(await observeBackground('synthetic_job', async () => 7, { log: () => { throw new Error('logging unavailable'); } })).toBe(7);
});

it.runIf(process.env.ICAO_BACKEND_BENCHMARK === '1')('measures diagnostic overhead on an unchanged synthetic route', async () => {
  const { mkdirSync, writeFileSync } = await import('node:fs');
  const measurements: Record<string, number[]> = { disabled: [], enabled: [] };
  const apps = [false, true].map(enabled => {
    const app = Fastify({ logger: { stream: { write: () => undefined } } });
    registerRequestPerformance(app, { enabled, sampleRate: 0.01 });
    app.get('/synthetic', async () => timed('synthetic.wait', async () => {
      await new Promise(resolve => setTimeout(resolve, 2));
      countStatement(); return { text: 'synthetic'.repeat(1000) };
    }));
    return { app, enabled };
  });
  try {
    for (const { app } of apps) await app.inject('/synthetic');
    for (let round = 0; round < 10; round++) {
      for (const { app, enabled } of round % 2 ? [...apps].reverse() : apps) {
        await Promise.all(Array.from({ length: 30 }, async () => {
          const start = performance.now(); const result = await app.inject('/synthetic');
          expect(result.statusCode).toBe(200);
          measurements[enabled ? 'enabled' : 'disabled']!.push(performance.now() - start);
        }));
      }
    }
    const report = Object.fromEntries(Object.entries(measurements).map(([name, samples]) => {
      samples.sort((a, b) => a - b);
      return [name, { samples: samples.length, p50Ms: samples[149], p95Ms: samples[284] }];
    }));
    mkdirSync('.generated', { recursive: true });
    writeFileSync('.generated/backend-telemetry-benchmark.json', JSON.stringify({
      note: 'Alternating 30 concurrent Fastify injections, 300 samples each, synthetic 2ms wait and 9KB JSON, in-memory log sink; not production.', report,
    }, null, 2));
  } finally { await Promise.all(apps.map(({ app }) => app.close())); }
});
