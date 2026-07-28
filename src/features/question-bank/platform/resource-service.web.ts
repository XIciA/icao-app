import {
  resolveConfiguredWebContentAssetUrl,
  resolveWebContentAssetUrl,
} from '@/features/web-content/release';

function sameOriginAssetsEnabled() {
  return process.env.EXPO_PUBLIC_ICAO_WEB_SAME_ORIGIN_ASSETS === '1';
}

function sameOriginAssetPath(path: string) {
  return path.startsWith('/') ? path : `/${path}`;
}

export function getQuestionBankAssetBaseUrl() {
  if (sameOriginAssetsEnabled()) return '';
  return process.env.EXPO_PUBLIC_ICAO_WEB_CONTENT_BASE_URL?.replace(/\/$/u, '');
}

export function resolveQuestionBankAsset(path?: string) {
  if (!path) return undefined;
  if (/^https?:\/\//u.test(path)) return path;
  if (sameOriginAssetsEnabled()) return sameOriginAssetPath(path);
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
  if (sameOriginAssetsEnabled()) return sameOriginAssetPath(path);
  return resolveWebContentAssetUrl(path);
}
