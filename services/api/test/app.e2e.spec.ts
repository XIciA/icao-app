import { UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import type { AuthenticatedUser } from '@icao/contracts';
import { describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { AUTH_VERIFIER, type AuthVerifier } from '../src/auth/auth.types';
import { loadConfig } from '../src/config';
import { DatabaseService } from '../src/database/database.service';
import { HttpErrorFilter } from '../src/http-error.filter';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://postgres:test@127.0.0.1:5432/postgres';
process.env.SUPABASE_URL = 'http://127.0.0.1:8000';
process.env.SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key-that-is-long-enough';
process.env.SUPABASE_PUBLIC_URL = 'http://127.0.0.1:8000';
process.env.SUPABASE_SECRET_KEY = 'test-secret-key-that-is-long-enough';

class FakeAuthVerifier implements AuthVerifier {
  async verify(token: string): Promise<AuthenticatedUser> {
    if (token !== 'valid-token') throw new UnauthorizedException('invalid_access_token');
    return { id: '00000000-0000-4000-8000-000000000001', email: 'tester@example.com' };
  }
}

async function testApp() {
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(DatabaseService)
    .useValue({ ping: async () => undefined })
    .overrideProvider(AUTH_VERIFIER)
    .useValue(new FakeAuthVerifier())
    .compile();
  const app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter({ logger: false }));
  app.useGlobalFilters(new HttpErrorFilter());
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

describe('API foundation', () => {
  it('fails closed when required configuration is missing', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow('invalid_api_configuration');
  });

  it('returns live and ready health envelopes', async () => {
    const app = await testApp();
    const live = await app.inject({ method: 'GET', url: '/health/live' });
    const ready = await app.inject({ method: 'GET', url: '/health/ready' });
    expect(live.statusCode).toBe(200);
    expect(live.json().data).toEqual({ service: 'icao-api', status: 'ok' });
    expect(ready.statusCode).toBe(200);
    expect(ready.json().data).toEqual({ service: 'icao-api', status: 'ok', database: 'ok' });
    await app.close();
  });

  it('rejects missing and invalid access tokens with stable codes', async () => {
    const app = await testApp();
    const missing = await app.inject({ method: 'GET', url: '/v1/me' });
    const invalid = await app.inject({ method: 'GET', url: '/v1/me', headers: { authorization: 'Bearer invalid' } });
    expect(missing.statusCode).toBe(401);
    expect(missing.json().error.code).toBe('missing_bearer_token');
    expect(invalid.statusCode).toBe(401);
    expect(invalid.json().error.code).toBe('invalid_access_token');
    await app.close();
  });

  it('returns the authenticated user for a valid token', async () => {
    const app = await testApp();
    const response = await app.inject({ method: 'GET', url: '/v1/me', headers: { authorization: 'Bearer valid-token' } });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual({ id: '00000000-0000-4000-8000-000000000001', email: 'tester@example.com' });
    await app.close();
  });

  it('protects sync routes and rejects malformed sync input before database access', async () => {
    const app = await testApp();
    const missing = await app.inject({ method: 'GET', url: '/v1/sync/pull?cursor=0' });
    const invalidCursor = await app.inject({
      method: 'GET',
      url: '/v1/sync/pull?cursor=not-a-number',
      headers: { authorization: 'Bearer valid-token' },
    });
    const invalidPush = await app.inject({
      method: 'POST',
      url: '/v1/sync/push',
      headers: { authorization: 'Bearer valid-token' },
      payload: { mutations: [{ kind: 'card_state' }] },
    });
    expect(missing.statusCode).toBe(401);
    expect(invalidCursor.statusCode).toBe(400);
    expect(invalidCursor.json().error.code).toBe('invalid_sync_cursor');
    expect(invalidPush.statusCode).toBe(400);
    expect(invalidPush.json().error.code).toBe('invalid_sync_payload');
    await app.close();
  });
});
