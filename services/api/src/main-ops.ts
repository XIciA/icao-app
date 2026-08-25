import 'reflect-metadata';

import { loadOpsConfig } from './config';
import { createOpsApp } from './create-ops-app';

async function bootstrap() {
  const config = loadOpsConfig();
  const app = await createOpsApp(config);
  const host = config.opsHost;
  const port = config.opsPort;
  await app.listen(port, host);
  console.log(`icao-ops-api listening on ${host}:${port}`);
}

void bootstrap();
