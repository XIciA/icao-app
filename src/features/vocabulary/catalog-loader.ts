import { validateVocabularyCatalog } from '@icao/contracts';
import Storage from '@/platform/storage';
import type { ApiSuccessEnvelope, VocabularyDataset, VocabularyRelease } from '@icao/contracts';

import { apiFetch, getApiBaseUrl } from '@/platform/api-client';

const LEGACY_CACHE_KEY = 'icao.content.v1.vocabulary';
const cacheKey = (base: string) => `icao.content.v2.vocabulary.${encodeURIComponent(base)}.three-books-v3`;
type CachedVocabularyRelease = VocabularyRelease & { cachedAt: string };

export type VocabularyLoadResult = {
  dataset: VocabularyDataset;
  source: 'remote' | 'cache';
  warning?: 'vocabulary_remote_unavailable';
};
export type VocabularyLoadOptions = {
  preferCache?: boolean;
  onRefresh?: (result: VocabularyLoadResult) => void;
};

export const validateVocabularyDataset = validateVocabularyCatalog;

function validateRelease(release: VocabularyRelease) {
  if (!release || !Number.isSafeInteger(release.version) || release.version < 1 || !/^[a-f0-9]{64}$/.test(release.checksum)) {
    throw new Error('invalid_vocabulary_release');
  }
  validateVocabularyDataset(release.dataset);
  if (release.dataset.catalogId !== 'three-books-v3') throw new Error('vocabulary_catalog_upgrade_required');
  return release;
}

async function readCachedRelease(base: string): Promise<CachedVocabularyRelease | undefined> {
  const raw = await Storage.getItem(cacheKey(base)).catch(() => null);
  // Preserve the previous production cache on upgrade. Other API environments
  // must not import an unscoped catalog whose origin cannot be established.
  const legacy = !raw && (base === 'https://api.readyoufife.com' || !base)
    ? await Storage.getItem(LEGACY_CACHE_KEY).catch(() => null) : null;
  if (!raw && !legacy) return undefined;
  try {
    return validateRelease(JSON.parse(raw ?? legacy!) as CachedVocabularyRelease) as CachedVocabularyRelease;
  } catch {
    return undefined;
  }
}

const pending = new Map<string, Promise<VocabularyLoadResult>>();

function refreshVocabulary(base: string, cached?: CachedVocabularyRelease): Promise<VocabularyLoadResult> {
  const existing = pending.get(base);
  if (existing) return existing;
  const assertSource = () => { if ((getApiBaseUrl() ?? '') !== base) throw new Error('vocabulary_source_changed'); };
  const request = (async (): Promise<VocabularyLoadResult> => {
    try {
      assertSource();
      if (!base) throw new Error('vocabulary_api_unavailable');
      const response = await apiFetch('/v1/vocabulary?catalog=three-books-v3', {
        headers: cached ? { 'if-none-match': `"${cached.checksum}"` } : undefined,
      });
      assertSource();
      if (response.status === 304 && cached) return { dataset: cached.dataset, source: 'cache' };
      if (!response.ok) throw new Error(`vocabulary_http_${response.status}`);
      const body = await response.json() as ApiSuccessEnvelope<VocabularyRelease>;
      assertSource();
      const release = validateRelease(body.data);
      await Storage.setItem(cacheKey(base), JSON.stringify({ ...release, cachedAt: new Date().toISOString() } satisfies CachedVocabularyRelease)).catch(() => undefined);
      assertSource();
      return { dataset: release.dataset, source: 'remote' };
    } catch (error) {
      assertSource();
      if (cached) return { dataset: cached.dataset, source: 'cache', warning: 'vocabulary_remote_unavailable' };
      throw error;
    }
  })().finally(() => { if (pending.get(base) === request) pending.delete(base); });
  pending.set(base, request);
  return request;
}

/** Default callers retain network-first semantics. A cache-first screen owns
 * when to apply onRefresh; an active study/test queue must keep its snapshot. */
export async function loadVocabulary(options: VocabularyLoadOptions = {}): Promise<VocabularyLoadResult> {
  const base = getApiBaseUrl() ?? '';
  const cached = await readCachedRelease(base);
  if ((getApiBaseUrl() ?? '') !== base) throw new Error('vocabulary_source_changed');
  const refresh = refreshVocabulary(base, cached);
  if (options.preferCache && cached) {
    // This is also the rejection handler when the consumer has no callback or
    // has unmounted. Callback failures cannot poison the shared loader.
    void refresh.then(result => options.onRefresh?.(result)).catch(() => undefined);
    return { dataset: cached.dataset, source: 'cache' };
  }
  return refresh;
}
