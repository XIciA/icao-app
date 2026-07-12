import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { HttpErrorFilter } from './http-error.filter';

export async function createApp() {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter({
    bodyLimit: 2 * 1024 * 1024,
    logger: process.env.NODE_ENV === 'test' ? false : true,
    requestTimeout: 15_000,
  }), {
    bufferLogs: true,
  });
  app.useGlobalFilters(new HttpErrorFilter());
  app.enableShutdownHooks();
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}
