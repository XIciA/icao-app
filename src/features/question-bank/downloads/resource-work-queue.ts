/** Stop assigning work on failure, and drain siblings before the caller may retry. */
export async function runResourceWorkers<T>(items: readonly T[], concurrency: number,
  isCurrent: () => boolean, work: (item: T, isCurrent: () => boolean) => Promise<void>) {
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error('invalid_resource_concurrency');
  let next = 0;
  let failed = false;
  let failure: unknown;
  const current = () => !failed && isCurrent();
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    try {
      while (current()) {
        const index = next++;
        if (index >= items.length) return;
        await work(items[index], current);
      }
    } catch (error) {
      if (!failed) { failed = true; failure = error; }
    }
  });
  await Promise.all(workers);
  if (failed) throw failure;
  if (!isCurrent()) throw new Error('下载已暂停');
}

// Two bulk transfers leave room in the shared native limit for playback.
export const DOWNLOAD_RESOURCE_CONCURRENCY = 2;
