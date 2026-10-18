import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';

import { loadOpsConfig, type OpsApiConfig } from './config';
import { HttpErrorFilter } from './http-error.filter';
import { OpsApiModule } from './ops-api.module';
import { DatabaseService } from './database/database.service';

export async function createOpsApp(config: OpsApiConfig = loadOpsConfig()) {
  if (!config.opsEnabled) throw new Error('ops_console_disabled');
  const app = await NestFactory.create<NestFastifyApplication>(
    OpsApiModule.forRoot(config),
    new FastifyAdapter({
      bodyLimit: 1024 * 1024,
      logger: process.env.NODE_ENV === 'test' ? false : true,
      requestTimeout: 15_000,
      // Generic forwarding headers are deliberately ignored. Login source identity
      // uses the authenticated Caddy-only headers handled by opsLoginSource().
      trustProxy: false,
    }),
    { bufferLogs: true, rawBody: true },
  );
  // Nest RouteConfig is Fastify's custom config, not its bodyLimit option.
  // Only the authenticated structured-draft route accepts complete bank payloads.
  app.getHttpAdapter().getInstance().addHook('onRoute', options => {
    if (options.method === 'POST' && (options.url === '/v1/admin/content-orders' || options.url === '/v1/admin/content-orders/:id/append')) options.bodyLimit = 12_000_000;
    if (options.method === 'POST' && options.url === '/v1/admin/content-orders/:id/prepare') {
      options.bodyLimit = 20_000_000;
    }
  });
  app.enableCors({
    origin: config.opsCorsOrigins,
    credentials: false,
    methods: ['GET', 'HEAD', 'POST', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Ops-Reason'],
    maxAge: 86_400,
  });
  app.useGlobalFilters(new HttpErrorFilter());
  app.enableShutdownHooks();
  await app.get(DatabaseService).assertMinimumSchemaVersion();
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}
