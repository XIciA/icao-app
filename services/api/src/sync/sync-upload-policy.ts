import type { FastifyInstance, FastifyRequest } from 'fastify';

// Released clients can upload full study-review snapshots. Keep the larger
// compatibility limit exclusive to sync, with bounded concurrent buffering.
export const SYNC_UPLOAD_BODY_LIMIT = 64 * 1024 * 1024;
const LARGE_UPLOAD_BYTES = 4 * 1024 * 1024;
const MAX_LARGE_UPLOADS = 2;

export function registerSyncUploadPolicy(server: FastifyInstance) {
  const active = new Set<FastifyRequest>();
  server.addHook('onRoute', (route) => {
    if (route.url !== '/v1/sync/push' || route.method !== 'POST') return;
    route.bodyLimit = SYNC_UPLOAD_BODY_LIMIT;
    const release = async (request: FastifyRequest) => { active.delete(request); };
    const before = route.onRequest ? [route.onRequest].flat() : [];
    const after = route.onResponse ? [route.onResponse].flat() : [];
    route.onRequest = [...before, async (request, reply) => {
      const length = Number(request.headers['content-length']);
      // Unknown/chunked lengths also reserve a slot before reading any bytes.
      if (Number.isFinite(length) && length >= 0 && length < LARGE_UPLOAD_BYTES) return;
      if (!request.headers.authorization?.startsWith('Bearer ')) {
        return reply.code(401).send({ requestId: request.id,
          error: { code: 'missing_bearer_token', message: 'missing_bearer_token', status: 401 } });
      }
      if (active.size >= MAX_LARGE_UPLOADS) {
        return reply.header('Retry-After', '5').code(503).send({ requestId: request.id,
          error: { code: 'sync_upload_busy', message: 'sync_upload_busy', status: 503 } });
      }
      active.add(request);
      request.raw.once('aborted', () => { active.delete(request); });
    }];
    route.onResponse = [...after, async (request, reply) => {
      await release(request);
      request.log.info({ event: 'sync_upload', statusCode: reply.statusCode,
        requestBytes: Number(request.headers['content-length']) || null }, 'sync upload completed');
    }];
  });
}
