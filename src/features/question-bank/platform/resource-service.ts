import Constants from 'expo-constants';

import { clientVisibleSignedResourceUrl, resolveSignedQuestionBankAsset } from './remote-resource-service';

const DEV_ASSET_PORT = 3100;

function devAssetBaseUrl() {
  const hostUri = Constants.expoConfig?.hostUri;
  const host = hostUri?.split(':')[0];
  return host ? `http://${host}:${DEV_ASSET_PORT}` : undefined;
}

export function getQuestionBankAssetBaseUrl() {
  const configured = process.env.EXPO_PUBLIC_ICAO_ASSET_BASE_URL?.replace(/\/$/, '');
  if (configured) return configured;
  if (__DEV__) return devAssetBaseUrl();
  return undefined;
}

export function resolveQuestionBankAsset(path?: string) {
  if (!path) return undefined;
  if (/^https?:\/\//.test(path)) return path;
  const base = getQuestionBankAssetBaseUrl();
  if (!base) return undefined;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

export async function probeResource(url: string) {
  const response = await fetch(url, { method: 'HEAD' });
  if (!response.ok) throw new Error(`resource_http_${response.status}`);
  return true;
}

export function clientVisibleResourceUrl(url: string) {
  return clientVisibleSignedResourceUrl(url);
}

export async function resolveRemoteQuestionBankAsset(path: string, { forceRefresh = false }: { forceRefresh?: boolean } = {}) {
  return resolveSignedQuestionBankAsset(path, { forceRefresh });
}
