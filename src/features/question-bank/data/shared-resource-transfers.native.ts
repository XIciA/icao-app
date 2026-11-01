import { Directory, File, Paths } from 'expo-file-system';
import { createDownloadResumable } from 'expo-file-system/legacy';
import { DOWNLOAD_RESOURCE_CONCURRENCY } from '../downloads/resource-work-queue';

type Consumer = { isCurrent(): boolean; onProgress?(fraction: number): void; isPlaybackActive?(): boolean; playback?: boolean };
type Transfer = {
  consumers: Set<Consumer>; promise: Promise<File | undefined>; progress: number;
  settled: boolean; abandoned: boolean; staging: File;
  slot?: { bulk: boolean };
};
const transfers = new Map<string, Transfer>();
let sequence = 0;
let active = 0;
let bulk = 0;
const MAX_TRANSFERS = 4;

function notify(consumer: Consumer, fraction: number) {
  if (consumer.isCurrent()) consumer.onProgress?.(fraction);
}
function cleanup(key: string, transfer: Transfer) {
  if (transfer.consumers.size || !transfer.settled) return;
  if (transfers.get(key) === transfer) transfers.delete(key);
  try { if (transfer.staging.exists) transfer.staging.delete(); }
  finally {
    if (transfer.slot) { active--; if (transfer.slot.bulk) bulk--; transfer.slot = undefined; }
  }
}

/** Share the transfer only. Every caller still authorizes and validates its own output.
 * Staging stays on disk until all consumers finish; callers must never move it. */
export async function acquireResourceTransfer(key: string, url: string, size: number,
  required: boolean, consumer: Consumer) {
  let transfer = transfers.get(key);
  // An already-aborted native task cannot be revived by a new consumer.
  if (transfer?.abandoned) transfer = undefined;
  if (!transfer) {
    const directory = new Directory(Paths.cache, 'icao-content-transfers');
    const staging = new File(directory, `${Date.now()}-${++sequence}.part`);
    const entry: Transfer = { consumers: new Set(), progress: 0, settled: false, abandoned: false,
      staging, promise: Promise.resolve(undefined) };
    transfer = entry;
    transfers.set(key, entry);
    entry.promise = Promise.resolve().then(async () => {
      const current = () => [...entry.consumers].some(value => value.isCurrent());
      const bulkLimit = () => [...entry.consumers].some(value => value.isPlaybackActive?.()) ? 1 : DOWNLOAD_RESOURCE_CONCURRENCY;
      while (required && current() && (active >= MAX_TRANSFERS || bulk >= bulkLimit())) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      // Optional prefetch never builds an unbounded native queue.
      const limit = required || consumer.playback ? MAX_TRANSFERS : MAX_TRANSFERS - 1;
      if (!current() || active >= limit) return undefined;
      active++; if (required) bulk++;
      entry.slot = { bulk: required };
      // Keep the slot through processing/release, bounding staging files as well
      // as sockets when hashing or disk writes are slower than the network.
      directory.create({ idempotent: true, intermediates: true });
      // All consumers share a cancellable native task, regardless of which
      // caller arrived first. Admission policy must not select a weaker I/O path.
      const task = createDownloadResumable(url, staging.uri, {}, progress => {
        if (entry.abandoned) return;
        entry.progress = Math.max(0, Math.min(1, progress.totalBytesWritten / size));
        for (const subscriber of entry.consumers) notify(subscriber, entry.progress);
      });
      const cancel = () => {
        if (entry.abandoned) return;
        entry.abandoned = true;
        void task.cancelAsync().catch(() => undefined);
      };
      const timeout = setTimeout(cancel, 120_000);
      const cancellation = setInterval(() => { if (!current()) cancel(); }, 100);
      try {
        const result = await task.downloadAsync();
        if (entry.abandoned || !result || result.status < 200 || result.status >= 300) throw new Error('download_interrupted');
      } finally {
        clearTimeout(timeout); clearInterval(cancellation);
        // Expo's cancelAsync also removes its JS progress subscription. Once
        // downloadAsync has settled there is no live I/O left to interrupt.
        if (!entry.abandoned) void task.cancelAsync().catch(() => undefined);
      }
      if (!current()) return undefined;
      entry.progress = 1;
      for (const subscriber of entry.consumers) notify(subscriber, 1);
      return staging;
    }).finally(() => { entry.settled = true; cleanup(key, entry); });
  }
  const selected = transfer;
  selected.consumers.add(consumer);
  const release = () => { selected.consumers.delete(consumer); cleanup(key, selected); };
  try {
    notify(consumer, selected.progress);
    const file = await selected.promise;
    if (!file || !consumer.isCurrent()) { release(); return undefined; }
    return { file, release };
  } catch (error) { release(); throw error; }
}

// Only one download's byte materialization/hash/sealing stage at a time, even
// across accounts. Pending work holds paths, not full audio buffers. Playback
// preparation goes first once the current atomic operation has finished.
const processingQueue: { playback: boolean; run(): Promise<void> }[] = [];
let processing = false;
async function drainProcessing() {
  if (processing) return;
  processing = true;
  try {
    while (processingQueue.length) {
      const priority = processingQueue.findIndex(item => item.playback);
      await processingQueue.splice(priority < 0 ? 0 : priority, 1)[0].run();
    }
  } finally { processing = false; }
}
export function processResourceBytes<T>(work: () => Promise<T>, playback = false): Promise<T> {
  return new Promise((resolve, reject) => {
    processingQueue.push({ playback, run: async () => { try { resolve(await work()); } catch (error) { reject(error); } } });
    void drainProcessing();
  });
}
