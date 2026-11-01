import { AsyncLocalStorage } from 'node:async_hooks';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import type { FastifyInstance, FastifyRequest } from 'fastify';

type Timing = { count: number; ms: number };
type Trace = { started: number; serializeStarted?: number; stages: Record<string, Timing> };
const context = new AsyncLocalStorage<Trace>();

/** Counts statements issued through Drizzle, not active connections or pure SQL time. */
export function countStatement() {
  const trace = context.getStore();
  if (trace) {
    const counter = trace.stages['db.statements'] ?? { count: 0, ms: 0 };
    counter.count += 1; trace.stages['db.statements'] = counter;
  }
}

/** Stage names are constants in source. Never pass a URL, SQL, token or user input. */
export async function timed<T>(stage: string, action: () => PromiseLike<T>): Promise<T> {
  const trace = context.getStore();
  if (!trace) return await action();
  const started = performance.now();
  try { return await action(); }
  finally {
    const previous = trace.stages[stage] ?? { count: 0, ms: 0 };
    previous.count += 1;
    previous.ms += performance.now() - started;
    trace.stages[stage] = previous;
  }
}

export function timedSync<T>(stage: string, action: () => T): T {
  const trace = context.getStore();
  if (!trace) return action();
  const started = performance.now();
  try { return action(); }
  finally {
    const previous = trace.stages[stage] ?? { count: 0, ms: 0 };
    previous.count += 1;
    previous.ms += performance.now() - started;
    trace.stages[stage] = previous;
  }
}

export function registerRequestPerformance(server: FastifyInstance, options: {
  enabled?: boolean; sampleRate?: number; random?: () => number;
} = {}) {
  if (!(options.enabled ?? process.env.API_PERFORMANCE_ENABLED !== 'false')) return;
  const sampleRate = Math.max(0, Math.min(1, options.sampleRate ?? 0.01));
  const random = options.random ?? Math.random;
  const requests = new WeakMap<FastifyRequest, Trace>();
  server.addHook('onRequest', (request, _reply, done) => {
    const trace: Trace = { started: performance.now(), stages: {} };
    requests.set(request, trace);
    context.run(trace, done);
  });
  server.addHook('preSerialization', (request, _reply, payload, done) => {
    const trace = requests.get(request);
    if (trace) trace.serializeStarted = performance.now();
    done(null, payload);
  });
  server.addHook('onSend', (request, _reply, payload, done) => {
    const trace = requests.get(request);
    if (trace?.serializeStarted !== undefined) {
      trace.stages.serialization = { count: 1, ms: performance.now() - trace.serializeStarted };
    }
    done(null, payload);
  });
  server.addHook('onResponse', (request, reply, done) => {
    const trace = requests.get(request);
    requests.delete(request);
    if (trace) {
      const durationMs = performance.now() - trace.started;
      if (reply.statusCode >= 400 || durationMs >= 1000 || random() < sampleRate) {
        // Use registered route templates, never raw URLs/query strings or request bodies.
        request.log.info({ event: 'api_performance', route: request.routeOptions.url ?? 'unmatched',
          method: request.method, status: reply.statusCode, durationMs: Math.round(durationMs * 100) / 100,
          stages: Object.fromEntries(Object.entries(trace.stages).map(([name, value]) =>
            [name, { count: value.count, ms: Math.round(value.ms * 100) / 100 }])) }, 'api_performance');
      }
    }
    done();
  });
  const delay = monitorEventLoopDelay({ resolution: 20 });
  delay.enable();
  const timer = setInterval(() => {
    server.log.info({ event: 'api_runtime', eventLoopP95Ms: delay.percentile(95) / 1e6,
      eventLoopMaxMs: delay.max / 1e6, rssBytes: process.memoryUsage().rss }, 'api_runtime');
    delay.reset();
  }, 60_000);
  timer.unref();
  server.addHook('onClose', (_instance, done) => { clearInterval(timer); delay.disable(); done(); });
}

/** Observe scheduled work without changing scheduling, retries, return values or failures. */
export async function observeBackground<T>(task: string, action: () => Promise<T>, logger: { log(value: unknown): void }): Promise<T> {
  if (process.env.API_PERFORMANCE_ENABLED === 'false') return action();
  const trace: Trace = { started: performance.now(), stages: {} };
  let outcome = 'resolved';
  try { return await context.run(trace, action); }
  catch (error) { outcome = 'rejected'; throw error; }
  finally {
    try { logger.log({ event: 'api_background', task, outcome, durationMs: performance.now() - trace.started,
      statements: trace.stages['db.statements']?.count ?? 0 }); } catch { /* Diagnostics must not alter job semantics. */ }
  }
}
