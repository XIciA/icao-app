import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { NestFactory } from '@nestjs/core';
import { COMMERCE_ENVIRONMENT_HEADER } from '@icao/contracts';

import { AppModule } from './app.module';
import { HttpErrorFilter } from './http-error.filter';
import multipart from '@fastify/multipart';
import { loadConfig, type ApiConfig } from './config';
import { DatabaseService } from './database/database.service';

export async function createApp(config: ApiConfig = loadConfig()) {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter({
    bodyLimit: 16 * 1024 * 1024,
    logger: process.env.NODE_ENV === 'test' ? false : true,
    requestTimeout: 15_000,
    trustProxy: (address) => address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1',
  }), {
    bufferLogs: true,
    rawBody: true,
  });
  app.enableCors(apiCorsOptions(config.corsOrigins));
  app.useGlobalFilters(new HttpErrorFilter());
  await app.register(multipart, {
    limits: { fileSize: 8 * 1024 * 1024, files: 3, fields: 8, parts: 12 },
  });
  app.enableShutdownHooks();
  await app.get(DatabaseService).assertMinimumSchemaVersion();
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

export function apiCorsOptions(origins: string[]) {
  return {
    origin: origins,
    credentials: false,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'If-Match', 'If-None-Match', COMMERCE_ENVIRONMENT_HEADER, 'x-ai-operation-id'],
    maxAge: 86_400,
  };
}
