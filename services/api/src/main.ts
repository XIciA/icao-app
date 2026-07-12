import 'reflect-metadata';

import { loadConfig } from './config';
import { createApp } from './create-app';

async function bootstrap() {
  const config = loadConfig();
  const app = await createApp();
  await app.listen(config.port, config.host);
  console.log(`icao-api listening on ${config.host}:${config.port}`);
}

void bootstrap();
