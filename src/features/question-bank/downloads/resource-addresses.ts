import type { OfflineManifest, ResolvedResource } from '@icao/contracts';

/** Lazy batches keep file workers moving across batch boundaries. Expired
 * signatures refresh once per batch, including when several workers need one. */
export function resourceAddresses(resources: OfflineManifest['resources'],
  resolve: (batch: OfflineManifest['resources']) => Promise<ResolvedResource[]>) {
  type Batch = { values: Map<string, ResolvedResource>; until: number };
  const batches = new Map<number, Promise<Batch>>();
  const indexes = new Map(resources.map((resource, index) => [resource.publicPath, Math.floor(index / 24)]));
  const load = (index: number) => {
    const promise = resolve(resources.slice(index * 24, index * 24 + 24)).then(values => ({
      values: new Map(values.map(value => [value.publicPath, value])),
      until: Date.now() + Math.max(0, Math.min(...values.map(value => value.expiresIn)) - 30) * 1000,
    })).catch(error => { if (batches.get(index) === promise) batches.delete(index); throw error; });
    batches.set(index, promise);
    return promise;
  };
  return async (path: string) => {
    const index = indexes.get(path);
    if (index === undefined) throw new Error('resource_not_found');
    let pending = batches.get(index) ?? load(index);
    let batch = await pending;
    if (Date.now() >= batch.until) {
      if (batches.get(index) === pending) pending = load(index);
      else pending = batches.get(index)!;
      batch = await pending;
    }
    const resource = batch.values.get(path);
    if (!resource) throw new Error('download_resource_unavailable');
    return resource;
  };
}

/** Only transient transport failures retry; invalid content, access and local
 * persistence errors must surface without repeatedly downloading the file. */
export async function retryResourceTransfer<T>(work: () => Promise<T>, isCurrent: () => boolean) {
  for (let attempt = 0; ; attempt++) {
    if (!isCurrent()) throw new Error('下载已暂停');
    try { return await work(); } catch (error) {
      const status = (error as { status?: number })?.status;
      const message = error instanceof Error ? error.message : '';
      if (attempt >= 2 || !isCurrent() || !(status === 408 || status === 429 || status && status >= 500
        || /^(download_interrupted|network_failed)$|network request failed|fetch failed|timed? ?out/i.test(message))) throw error;
      await new Promise(resolve => setTimeout(resolve, 250 * 2 ** attempt));
    }
  }
}
