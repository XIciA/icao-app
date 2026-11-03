import staticLookupDataset from './data/dataset.json';
import { isWordLookupRelease, type WordLookupEntry, type WordLookupRelease } from '@icao/contracts';
import Storage from '@/platform/storage';
import { apiFetch, getApiBaseUrl } from '@/platform/api-client';
import { normalizeStaticLookupWord } from './normalize';

export type StaticWordLookupEntry = WordLookupEntry;
let staticEntries: WordLookupEntry[] = staticLookupDataset.entries;
let entries = new Map(staticEntries.map(entry => [entry.word, entry]));
const listeners = new Set<() => void>();
let checksum: string | undefined;
let source: string | undefined;
let running: Promise<void> | undefined;
let revision = 0;

function apply(release: WordLookupRelease) {
  if (release.checksum === checksum) return;
  entries = new Map([...staticLookupDataset.entries, ...release.entries].map(entry => [entry.word, entry]));
  staticEntries = [...entries.values()];
  checksum = release.checksum;
  revision += 1;
  for (const listener of listeners) listener();
}

/** Optional content refresh: retain bundled/cached definitions through network or cache failures. */
export async function refreshStaticWordLookup() {
  if (running) return running;
  const base = getApiBaseUrl();
  const task = (async () => {
    const key = `icao.content.word-lookup.v1.${base}`;
    if (source !== base) {
      source = base; checksum = undefined;
      entries = new Map(staticLookupDataset.entries.map(entry => [entry.word, entry]));
      staticEntries = staticLookupDataset.entries;
      try {
        const raw = await Storage.getItem(key);
        const cached: unknown = raw ? JSON.parse(raw) : undefined;
        if (isWordLookupRelease(cached)) apply(cached);
      } catch { /* Embedded definitions remain available. */ }
    }
    try {
      const response = await apiFetch('/v1/app-content/word-lookup', { headers: checksum ? { 'if-none-match': `"${checksum}"` } : {} });
      if (response.status === 304) return;
      if (!response.ok) return;
      const body = await response.json() as { data?: unknown };
      if (!isWordLookupRelease(body.data)) return;
      apply(body.data);
      await Storage.setItem(key, JSON.stringify(body.data)).catch(() => undefined);
    } catch { /* Offline lookup uses the last valid content. */ }
  })();
  running = task;
  try { await task; } finally { if (running === task) running = undefined; }
}

export function subscribeStaticWordLookup(listener: () => void) {
  listeners.add(listener); return () => { listeners.delete(listener); };
}
export function staticWordLookupRevision() { return revision; }
export function findStaticWordLookup(value: string) {
  const word = normalizeStaticLookupWord(value);
  return word ? entries.get(word) : undefined;
}
export function hasStaticWordLookup(value: string) { return Boolean(findStaticWordLookup(value)); }
export function getStaticWordLookupEntries() { return staticEntries; }
