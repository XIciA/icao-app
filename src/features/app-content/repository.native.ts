import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';
import {
  canonicalAppContentJson, isAppContentRelease, isAppContentSnapshot,
  type AppContentRelease, type AppContentSnapshot,
} from '@icao/contracts/app-content';
import type { ApiSuccessEnvelope } from '@icao/contracts';

import textContent from '../../../content/app-content/text.json';
import hotspotContent from '../../../content/question-banks/opi-hotspots.json';
import { getApiBaseUrl, withApiRequestTimeout } from '@/platform/api-client';
import Storage from '@/platform/storage';

const builtin = { ...textContent, hotspots: hotspotContent };
if (!isAppContentSnapshot(builtin)) throw new Error('invalid_builtin_app_content');
export const builtinAppContent: AppContentSnapshot = builtin;
export type AppContentResult = { data: AppContentRelease; source: 'remote' | 'cache' | 'builtin' };
const cacheKey = (base: string) => `icao.app-content.v1.${encodeURIComponent(base)}`;
const pending = new Map<string, Promise<AppContentResult>>();

async function checksum(payload: AppContentSnapshot) {
  return digestStringAsync(CryptoDigestAlgorithm.SHA256, canonicalAppContentJson(payload));
}
async function validRelease(value: unknown): Promise<AppContentRelease | undefined> {
  return isAppContentRelease(value) && await checksum(value.payload) === value.checksum ? value : undefined;
}
async function readCache(base: string) {
  try {
    const raw = await Storage.getItem(cacheKey(base));
    return raw ? await validRelease(JSON.parse(raw)) : undefined;
  } catch { return undefined; }
}
async function load(base: string): Promise<AppContentResult> {
  const cached = await readCache(base);
  if (base) {
    try {
      // Public legal access deliberately omits the session token and cannot trigger a login loop.
      const response = await withApiRequestTimeout((signal) => fetch(`${base}/v1/app-content`, {
        signal, headers: { accept: 'application/json', ...(cached ? { 'if-none-match': `"${cached.checksum}"` } : {}) },
      }), undefined, 8000);
      if (response.status === 304 && cached) return { data: cached, source: 'cache' };
      if (!response.ok) throw new Error('app_content_unavailable');
      const body = await response.json() as ApiSuccessEnvelope<unknown>;
      const data = await validRelease(body.data);
      if (!data) throw new Error('invalid_app_content');
      await Storage.setItem(cacheKey(base), JSON.stringify(data)).catch(() => undefined);
      return { data, source: 'remote' };
    } catch { /* Last complete compatible content stays usable, including before login. */ }
  }
  if (cached) return { data: cached, source: 'cache' };
  return { data: { version: builtinAppContent.version, checksum: await checksum(builtinAppContent), payload: builtinAppContent }, source: 'builtin' };
}

/** Call on normal entry. Do not subscribe a running study session to content changes. */
export function loadAppContent(): Promise<AppContentResult> {
  const base = getApiBaseUrl() ?? '';
  let request = pending.get(base);
  if (!request) {
    request = load(base).finally(() => pending.delete(base));
    pending.set(base, request);
  }
  return request;
}

export async function loadLegalDocuments() {
  const result = await loadAppContent();
  return { documents: result.data.payload.legal, releaseVersion: result.data.version, checksum: result.data.checksum, source: result.source };
}

/** Offline policy checks must not wait for a second network request after the status endpoint failed. */
export async function readAvailableLegalDocuments() {
  const cached = await readCache(getApiBaseUrl() ?? '');
  return { documents: cached?.payload.legal ?? builtinAppContent.legal,
    releaseVersion: cached?.version ?? builtinAppContent.version,
    source: cached ? 'cache' as const : 'builtin' as const };
}
