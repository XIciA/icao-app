import type { QuestionBankReleaseSummary } from '@icao/contracts';
import { apiRequest, getApiBaseUrl } from '@/platform/api-client';
import Storage from '@/platform/storage';

const key = (base: string) => `icao.download-release-metadata.v1.${encodeURIComponent(base)}`;
const pending = new Map<string, Promise<QuestionBankReleaseSummary[]>>();
function valid(value: unknown): value is QuestionBankReleaseSummary[] {
  return Array.isArray(value) && value.every(item => item && typeof item.bankId === 'string'
    && Number.isSafeInteger(item.version) && typeof item.checksum === 'string'
    && (item.publishedAt === undefined || typeof item.publishedAt === 'string' && Number.isFinite(Date.parse(item.publishedAt))));
}
export async function readDownloadReleaseMetadata() {
  try { const raw = await Storage.getItem(key(getApiBaseUrl() ?? '')); const value: unknown = raw ? JSON.parse(raw) : []; return valid(value) ? value : []; }
  catch { return []; }
}
export function refreshDownloadReleaseMetadata() {
  const base = getApiBaseUrl() ?? '';
  const previous = pending.get(base);
  if (previous) return previous;
  const request = (async () => {
    const value = await apiRequest<QuestionBankReleaseSummary[]>('/v1/question-banks');
    if (!valid(value) || base !== (getApiBaseUrl() ?? '')) throw new Error('invalid_release_metadata');
    // Optional public cache failure must not discard a successful online result.
    await Storage.setItem(key(base), JSON.stringify(value)).catch(() => undefined);
    return value;
  })().finally(() => pending.delete(base));
  pending.set(base, request); return request;
}
export function downloadPublicationDate(releases: QuestionBankReleaseSummary[]) {
  const latest = releases.flatMap(item => item.publishedAt ? [item.publishedAt] : []).sort((a, b) => Date.parse(a) - Date.parse(b)).at(-1);
  if (!latest) return '—';
  const date = new Date(latest);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
