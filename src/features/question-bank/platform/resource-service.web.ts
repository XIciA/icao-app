import {
  resolveConfiguredWebContentAssetUrl,
  resolveWebContentAssetUrl,
} from '@/features/web-content/release';

export function getQuestionBankAssetBaseUrl() {
  return process.env.EXPO_PUBLIC_ICAO_WEB_CONTENT_BASE_URL?.replace(/\/$/u, '');
}

export function resolveQuestionBankAsset(path?: string) {
  if (!path) return undefined;
  if (/^https?:\/\//u.test(path)) return path;
  return resolveConfiguredWebContentAssetUrl(path);
}

export async function probeResource(url: string) {
  const response = await fetch(url, { method: 'HEAD' });
  if (!response.ok) throw new Error(`resource_http_${response.status}`);
  return true;
}

export function clientVisibleResourceUrl(url: string) {
  return url;
}

export async function resolveRemoteQuestionBankAsset(path: string) {
  return resolveWebContentAssetUrl(path);
}
