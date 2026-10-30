/** Bounded process-local cache of immutable release data; never store account permissions here. */
export class VersionedReadCache<T> {
  private readonly entries = new Map<string, { value: T; bytes: number }>();
  private readonly pending = new Map<string, Promise<T>>();
  private bytes = 0;
  constructor(private readonly options: { maxBytes?: number; maxEntries?: number; maxPending?: number; enabled?: boolean } = {}) {}

  async get(key: string, load: () => Promise<T>): Promise<T> {
    if (!(this.options.enabled ?? process.env.API_CONTENT_CACHE_ENABLED !== 'false')) return load();
    const hit = this.entries.get(key);
    if (hit) {
      this.entries.delete(key); this.entries.set(key, hit);
      return hit.value;
    }
    const pending = this.pending.get(key);
    if (pending) return pending;
    // Bound retained bookkeeping too. Overflow follows the ordinary uncached read path;
    // the existing database pool still bounds database execution, without new API errors.
    if (this.pending.size >= (this.options.maxPending ?? 16)) return load();
    const promise = Promise.resolve().then(load).then(value => {
      // Conservative serialized-size accounting; this is not an exact V8 heap measurement.
      const bytes = Buffer.byteLength(JSON.stringify(value)) * 4;
      const maxBytes = this.options.maxBytes ?? 16 * 1024 * 1024;
      if (bytes <= maxBytes) {
        while (this.entries.size && (this.bytes + bytes > maxBytes || this.entries.size >= (this.options.maxEntries ?? 8))) {
          const oldest = this.entries.keys().next().value!;
          this.bytes -= this.entries.get(oldest)!.bytes; this.entries.delete(oldest);
        }
        freezeJson(value);
        this.entries.set(key, { value, bytes }); this.bytes += bytes;
      }
      return value;
    });
    this.pending.set(key, promise);
    try { return await promise; }
    finally { this.pending.delete(key); }
  }
}

function freezeJson(value: unknown): void {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return;
  Object.freeze(value);
  for (const child of Object.values(value)) freezeJson(child);
}
