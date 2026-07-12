import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { HttpErrorFilter } from './http-error.filter';
import multipart from '@fastify/multipart';

export async function createApp() {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter({
    bodyLimit: 10 * 1024 * 1024,
    logger: process.env.NODE_ENV === 'test' ? false : true,
    requestTimeout: 15_000,
  }), {
    bufferLogs: true,
  });
  app.useGlobalFilters(new HttpErrorFilter());
  await app.register(multipart, {
    limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 8, parts: 9 },
  });
  app.enableShutdownHooks();
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}
