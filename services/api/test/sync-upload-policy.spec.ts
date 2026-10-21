import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { registerSyncUploadPolicy, SYNC_UPLOAD_BODY_LIMIT } from '../src/sync/sync-upload-policy';

function server() {
  const app = Fastify({ bodyLimit: 16 * 1024 * 1024 });
  registerSyncUploadPolicy(app);
  app.post('/v1/sync/push', async (request) => ({ bytes: JSON.stringify(request.body).length }));
  app.post('/other', async () => ({ ok: true }));
  return app;
}

describe('released-client sync uploads', () => {
  it('rejects unauthenticated large uploads before buffering the body', async () => {
    const app = server();
    try {
      const response = await app.inject({ method: 'POST', url: '/v1/sync/push', payload: '{}',
        headers: { 'content-type': 'application/json', 'content-length': String(20 * 1024 * 1024) } });
      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe('missing_bearer_token');
    } finally { await app.close(); }
  });

  it('accepts a study snapshot above the old 16 MiB limit only on sync', async () => {
    const app = server();
    try {
      const payload = JSON.stringify({ mutations: [{ kind: 'learning_record', payload: {
        record: { studyReview: { items: ['题'.repeat(6 * 1024 * 1024)] } },
      } }] });
      expect(Buffer.byteLength(payload)).toBeGreaterThan(16 * 1024 * 1024);
      const response = await app.inject({ method: 'POST', url: '/v1/sync/push', payload,
        headers: { 'content-type': 'application/json', authorization: 'Bearer fixture' } });
      expect(response.statusCode).toBe(200);
      expect(response.json().bytes).toBe(payload.length);
      expect((await app.inject({ method: 'POST', url: '/other', payload,
        headers: { 'content-type': 'application/json' } })).statusCode).toBe(413);
    } finally { await app.close(); }
  });

  it('keeps an upper bound and releases the slot after a rejected body', async () => {
    const app = server();
    try {
      const response = await app.inject({ method: 'POST', url: '/v1/sync/push', payload: '{}',
        headers: { 'content-type': 'application/json', 'content-length': String(SYNC_UPLOAD_BODY_LIMIT + 1), authorization: 'Bearer fixture' } });
      expect(response.statusCode).toBe(413);
      for (let i = 0; i < 3; i += 1) {
        expect((await app.inject({ method: 'POST', url: '/v1/sync/push', payload: '{}',
          headers: { 'content-type': 'application/json', authorization: 'Bearer fixture' } })).statusCode).toBe(200);
      }
    } finally { await app.close(); }
  });

  it('bounds large uploads while allowing small sync requests through', async () => {
    const app = Fastify();
    registerSyncUploadPolicy(app);
    let count = 0;
    let signalStarted!: () => void;
    const started = new Promise<void>((resolve) => { signalStarted = resolve; });
    let unblock!: () => void;
    const blocked = new Promise<void>((resolve) => { unblock = resolve; });
    app.post('/v1/sync/push', async (request) => {
      if (Number(request.headers['content-length']) >= 4 * 1024 * 1024) {
        count += 1;
        if (count === 2) signalStarted();
        await blocked;
      }
      return { ok: true };
    });
    const payload = JSON.stringify({ value: 'x'.repeat(4 * 1024 * 1024) });
    const options = { method: 'POST' as const, url: '/v1/sync/push', payload,
      headers: { 'content-type': 'application/json', authorization: 'Bearer fixture' } };
    const pending = [app.inject(options).then((r) => r.statusCode), app.inject(options).then((r) => r.statusCode)];
    try {
      await started;
      const busy = await app.inject(options);
      expect(busy.statusCode).toBe(503);
      expect(busy.headers['retry-after']).toBe('5');
      expect((await app.inject({ ...options, payload: '{}' })).statusCode).toBe(200);
    } finally { unblock(); await Promise.all(pending); await app.close(); }
  });
});
