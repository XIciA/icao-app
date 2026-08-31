import type { CommerceEnvironment } from '@icao/contracts';
import { getIcaoDistributionEnvironment } from '@icao/distribution-environment';
import { Platform } from 'react-native';
import Storage from '@/platform/storage';

let activeEnvironment: CommerceEnvironment = 'production';
let activeAccountId: string | undefined;
let activeDistributionEnvironment: CommerceEnvironment = 'production';
let revision = 0;
let requestRevision = 0;
const storageQueues = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();
const STORAGE_PREFIX = 'icao.commerce.environment.v1.';

function enqueueStorage<T>(accountId: string, operation: () => Promise<T>): Promise<T> {
  const previous = storageQueues.get(accountId) ?? Promise.resolve();
  const result = previous.catch(() => undefined).then(operation);
  const tail = result.then(() => undefined, () => undefined);
  storageQueues.set(accountId, tail);
  void tail.then(() => {
    if (storageQueues.get(accountId) === tail) storageQueues.delete(accountId);
  });
  return result;
}

function publishEnvironment(environment: CommerceEnvironment) {
  if (activeEnvironment === environment) return;
  activeEnvironment = environment;
  revision += 1;
  for (const listener of listeners) listener();
}

export function detectNativeDistributionEnvironment(): CommerceEnvironment {
  return Platform.OS === 'ios' ? getIcaoDistributionEnvironment() : 'production';
}

export function getNativeCommerceEnvironment(): CommerceEnvironment {
  return activeEnvironment;
}

export function setNativeCommerceEnvironment(environment: CommerceEnvironment) {
  if (activeAccountId && environment !== activeDistributionEnvironment) return;
  publishEnvironment(environment);
}

export function nativeCommerceEnvironmentSnapshot() {
  return `${activeEnvironment}:${revision}`;
}

export function subscribeNativeCommerceEnvironment(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function activateNativeCommerceEnvironment(
  accountId: string,
  distributionEnvironment: CommerceEnvironment,
) {
  const activationRequest = requestRevision + 1;
  requestRevision = activationRequest;
  activeAccountId = accountId;
  activeDistributionEnvironment = distributionEnvironment;
  return enqueueStorage(accountId, async () => {
    const stored = await Storage.getItem(`${STORAGE_PREFIX}${accountId}`);
    const environment = distributionEnvironment === 'sandbox' && stored === 'sandbox'
      ? 'sandbox'
      : 'production';
    if (
      activationRequest !== requestRevision
      || activeAccountId !== accountId
      || activeDistributionEnvironment !== distributionEnvironment
    ) return environment;
    if (distributionEnvironment === 'production' && stored === 'sandbox') {
      await Storage.setItem(`${STORAGE_PREFIX}${accountId}`, 'production');
      if (
        activationRequest !== requestRevision
        || activeAccountId !== accountId
        || activeDistributionEnvironment !== distributionEnvironment
      ) return environment;
    }
    publishEnvironment(environment);
    return environment;
  });
}

export async function confirmNativeCommerceEnvironment(
  accountId: string,
  environment: CommerceEnvironment,
  options: Readonly<{ signal?: AbortSignal }> = {},
) {
  const distributionEnvironment = detectNativeDistributionEnvironment();
  if (
    options.signal?.aborted
    || activeAccountId !== accountId
    || distributionEnvironment !== environment
  ) return false;
  const confirmationRequest = requestRevision + 1;
  requestRevision = confirmationRequest;
  activeDistributionEnvironment = distributionEnvironment;
  return enqueueStorage(accountId, async () => {
    if (
      options.signal?.aborted
      ||
      confirmationRequest !== requestRevision
      || activeAccountId !== accountId
      || activeDistributionEnvironment !== environment
    ) return false;
    const storageKey = `${STORAGE_PREFIX}${accountId}`;
    const previousEnvironment = await Storage.getItem(storageKey);
    if (
      options.signal?.aborted
      || confirmationRequest !== requestRevision
      || activeAccountId !== accountId
      || activeDistributionEnvironment !== environment
    ) return false;
    await Storage.setItem(storageKey, environment);
    if (
      options.signal?.aborted
      ||
      confirmationRequest !== requestRevision
      || activeAccountId !== accountId
      || activeDistributionEnvironment !== environment
    ) {
      if (previousEnvironment === null) await Storage.removeItem(storageKey);
      else await Storage.setItem(storageKey, previousEnvironment);
      return false;
    }
    publishEnvironment(environment);
    return true;
  });
}

export async function clearNativeCommerceEnvironment(accountId?: string) {
  const clearRequest = requestRevision + 1;
  requestRevision = clearRequest;
  const targetAccountId = accountId ?? activeAccountId;
  await enqueueStorage(targetAccountId ?? '__no-active-commerce-account__', async () => {
    if (targetAccountId) await Storage.removeItem(`${STORAGE_PREFIX}${targetAccountId}`);
    if (clearRequest !== requestRevision) return;
    if (!accountId || activeAccountId === accountId) {
      activeAccountId = undefined;
      activeDistributionEnvironment = 'production';
      publishEnvironment('production');
    }
  });
}
