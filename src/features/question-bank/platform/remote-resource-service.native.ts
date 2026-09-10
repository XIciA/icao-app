import { COMMERCE_ENVIRONMENT_HEADER, type ResolvedResource } from '@icao/contracts';

import {
  getNativeCommerceEnvironment,
  nativeCommerceEnvironmentSnapshot,
} from '@/features/native-commercial-testflight/commerce-environment';
import { ApiClientError, apiRequest, getApiBaseUrl } from '@/platform/api-client';
import Storage from '@/platform/storage';
import {
  cacheMemberResource,
  clearQuestionBankMemberContent,
  currentQuestionBankContentAccountId,
  hasValidOfflineMemberResourceAccess,
  questionBankContentAccountGeneration,
  resolveOfflineMemberResource,
} from '../data/member-content-cache.native';

type CachedResource = ResolvedResource & { expiresAt: number };
const RESOURCE_CACHE_PREFIX = 'icao.content.v2.resource.';
const LEGACY_RESOURCE_CACHE_PREFIX = 'icao.content.v1.resource.';

function resourceCacheKey(accountId: string, environment: string, path: string) {
  return `${RESOURCE_CACHE_PREFIX}${accountId}.${environment}.${encodeURIComponent(path)}`;
}

function resourceContext() {
  return {
    accountId: currentQuestionBankContentAccountId(),
    accountGeneration: questionBankContentAccountGeneration(),
    environment: getNativeCommerceEnvironment(),
    environmentSnapshot: nativeCommerceEnvironmentSnapshot(),
  };
}

function assertResourceContextCurrent(context: ReturnType<typeof resourceContext>) {
  if (
    context.accountId !== currentQuestionBankContentAccountId()
    || context.accountGeneration !== questionBankContentAccountGeneration()
    || context.environment !== getNativeCommerceEnvironment()
    || context.environmentSnapshot !== nativeCommerceEnvironmentSnapshot()
  ) throw new ApiClientError('content_account_changed', 409);
}

export function clientVisibleSignedResourceUrl(url: string) {
  const publicSupabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/u, '');
  if (!publicSupabaseUrl) return url;
  try {
    const signed = new URL(url);
    return `${publicSupabaseUrl}${signed.pathname}${signed.search}${signed.hash}`;
  } catch {
    return url;
  }
}

export async function resolveSignedQuestionBankAsset(
  path: string,
  { forceRefresh = false }: { forceRefresh?: boolean } = {},
) {
  if (!getApiBaseUrl()) return undefined;
  const context = resourceContext();
  const { accountId, environment } = context;
  const offline = !forceRefresh
    ? await resolveOfflineMemberResource(path).catch(() => undefined)
    : undefined;
  assertResourceContextCurrent(context);
  const key = accountId ? resourceCacheKey(accountId, environment, path) : undefined;
  const cachedValue = key ? await Storage.getItem(key).catch(() => undefined) : undefined;
  assertResourceContextCurrent(context);
  try {
    const resource = await apiRequest<ResolvedResource>(
      `/v1/resources/resolve?path=${encodeURIComponent(path)}`,
      { headers: { [COMMERCE_ENVIRONMENT_HEADER]: environment } },
    );
    assertResourceContextCurrent(context);
    const visibleResource = { ...resource, url: clientVisibleSignedResourceUrl(resource.url) };
    if (key) {
      await Storage.setItem(key, JSON.stringify({
        ...visibleResource,
        expiresAt: Date.now() + resource.expiresIn * 1_000,
      } satisfies CachedResource)).catch(() => undefined);
    }
    assertResourceContextCurrent(context);
    // Online playback already has server authorization. Downloading and hashing
    // an optional offline copy must not hold up the player. The existing member
    // cache remains responsible for credential, checksum and account ownership.
    void cacheMemberResource(path, visibleResource.url, visibleResource).catch(() => undefined);
    return visibleResource.url;
  } catch (cause) {
    assertResourceContextCurrent(context);
    if (cause instanceof ApiClientError && cause.status >= 400 && cause.status < 500) {
      if (accountId && (cause.status === 401 || cause.status === 403)) {
        await clearQuestionBankMemberContent(accountId);
      }
      throw cause;
    }
    if (forceRefresh) throw cause;
    if (offline) return offline;
    const offlineCredentialValid = accountId
      ? await hasValidOfflineMemberResourceAccess(path).catch(() => false)
      : false;
    assertResourceContextCurrent(context);
    if (cachedValue && offlineCredentialValid) {
      try {
        const cached = JSON.parse(cachedValue) as CachedResource;
        if (cached.publicPath === path && cached.expiresAt > Date.now() + 30_000) {
          return clientVisibleSignedResourceUrl(cached.url);
        }
      } catch {
        // Ignore invalid cache and preserve the original network failure.
      }
    }
    throw cause;
  }
}

export async function clearQuestionBankResourceCredentials() {
  const keys = (await Storage.getAllKeys()).filter((key) => (
    key.startsWith(RESOURCE_CACHE_PREFIX) || key.startsWith(LEGACY_RESOURCE_CACHE_PREFIX)
  ));
  if (keys.length > 0) await Storage.multiRemove(keys);
}
