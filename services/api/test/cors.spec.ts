import { FastifyAdapter } from '@nestjs/platform-fastify';
import { describe, expect, it } from 'vitest';
import { apiCorsOptions } from '../src/create-app';

describe('formal web CORS contract', () => {
  it('allows required commerce and AI headers only for configured origins', async () => {
    const adapter = new FastifyAdapter();
    adapter.enableCors(apiCorsOptions(['https://readyoufife.com']));
    const server = adapter.getInstance();
    await server.ready();
    try {
      for (const origin of ['https://readyoufife.com', 'https://untrusted.example']) {
        const response = await server.inject({ method: 'OPTIONS', url: '/v1/question-banks/sentences900', headers: {
          origin,
          'access-control-request-method': 'GET',
          'access-control-request-headers': 'authorization,x-icao-commerce-environment,x-ai-operation-id',
        } });
        if (origin === 'https://readyoufife.com') {
          expect(response.statusCode).toBe(204);
          expect(response.headers['access-control-allow-origin']).toBe(origin);
          const allowed = String(response.headers['access-control-allow-headers']).toLowerCase().split(/,\s*/);
          for (const header of ['authorization', 'x-icao-commerce-environment', 'x-ai-operation-id']) expect(allowed).toContain(header);
          expect(allowed).not.toContain('*');
        } else {
          expect(response.headers['access-control-allow-origin']).toBeUndefined();
        }
        expect(response.headers['access-control-allow-credentials']).toBeUndefined();
      }
    } finally { await server.close(); }
  });
});
