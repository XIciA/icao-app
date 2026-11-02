import { AsyncLocalStorage } from 'node:async_hooks';
import type { FastifyInstance } from 'fastify';
const requests = new AsyncLocalStorage<{ stableIdentity: boolean; preview: Record<string, number> }>();
export const directoryClient = () => requests.getStore() ?? { stableIdentity: false, preview: {} };
/** Capabilities choose a compatible directory; they never grant content access. */
export function registerDirectoryClientContext(server: FastifyInstance) {
  server.addHook('onRequest', (request, _reply, done) => {
    const stableIdentity = request.headers['x-icao-directory-identity'] === 'stable-storage-v1';
    const preview: Record<string, number> = {};
    const raw = request.headers['x-icao-directory-preview'];
    if (stableIdentity && typeof raw === 'string' && raw.length <= 500) for (const pair of raw.split(',')) {
      const match = /^([a-z][a-z0-9-]{0,40})=([1-9][0-9]{0,8})$/.exec(pair);
      if (match?.[1] && match[2]) preview[match[1]] = Number(match[2]);
    }
    requests.run({ stableIdentity, preview }, done);
  });
}
export function directoryVersionForClient(bankId: string, metadata: {version:number;compatibility?:{capability:string;fallbackVersion:number}|null}, pinned: boolean) {
  if (!requests.getStore()) return undefined;
  const client = directoryClient();
  if (!client.stableIdentity && metadata.compatibility?.capability === 'stable-storage-v1') return metadata.compatibility.fallbackVersion;
  const preview = client.stableIdentity ? client.preview[bankId] : undefined;
  return !pinned && preview && preview > metadata.version ? preview : undefined;
}
