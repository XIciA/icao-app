import type { CommerceEnvironment } from '@icao/contracts';
import { getIcaoDistributionEnvironment } from '@icao/distribution-environment';
import { Platform } from 'react-native';

import Storage from '@/platform/storage';

type NativeCommerceEnvironmentStatus = 'inactive' | 'activating' | 'active';

type NativeCommerceEnvironmentState = Readonly<{
  accountId?: string;
  distributionEnvironment: CommerceEnvironment;
  environment: CommerceEnvironment;
  generation: number;
  revision: number;
  status: NativeCommerceEnvironmentStatus;
}>;

let state: NativeCommerceEnvironmentState = {
  distributionEnvironment: 'production',
  environment: 'production',
  generation: 0,
  revision: 0,
  status: 'inactive',
};
let requestGeneration = 0;
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

function publishState(next: Omit<NativeCommerceEnvironmentState, 'revision'>) {
  if (
    state.accountId === next.accountId
    && state.distributionEnvironment === next.distributionEnvironment
    && state.environment === next.environment
    && state.generation === next.generation
    && state.status === next.status
  ) return;
  state = { ...next, revision: state.revision + 1 };
  for (const listener of [...listeners]) listener();
}

function currentRequest(
  accountId: string,
  distributionEnvironment: CommerceEnvironment,
  generation: number,
) {
  return requestGeneration === generation
    && state.accountId === accountId
    && state.distributionEnvironment === distributionEnvironment
    && state.generation === generation;
}

export function detectNativeDistributionEnvironment(): CommerceEnvironment {
  return Platform.OS === 'ios' ? getIcaoDistributionEnvironment() : 'production';
}

export function getNativeCommerceEnvironment(): CommerceEnvironment {
  return state.environment;
}

export function getNativeCommerceEnvironmentState(): NativeCommerceEnvironmentState {
  return state;
}

export function nativeCommerceEnvironmentSnapshot() {
  return [
    state.accountId ?? 'no-account',
    state.distributionEnvironment,
    state.environment,
    state.status,
    state.generation,
    state.revision,
  ].join(':');
}

export function subscribeNativeCommerceEnvironment(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function deactivateNativeCommerceEnvironment(accountId?: string) {
  if (accountId && state.accountId !== accountId) return;
  const generation = requestGeneration + 1;
  requestGeneration = generation;
  publishState({
    distributionEnvironment: 'production',
    environment: 'production',
    generation,
    status: 'inactive',
  });
}

export async function activateNativeCommerceEnvironment(
  accountId: string,
  distributionEnvironment: CommerceEnvironment,
  options: Readonly<{ signal?: AbortSignal }> = {},
) {
  const generation = requestGeneration + 1;
  requestGeneration = generation;

  // Publish the new owner and a fail-closed Production view synchronously.
  // A previous account's remembered Sandbox value is never visible while the
  // new account's storage activation is pending, failing, or being aborted.
  publishState({
    accountId,
    distributionEnvironment,
    environment: 'production',
    generation,
    status: options.signal?.aborted ? 'inactive' : 'activating',
  });
  if (options.signal?.aborted) return 'production' as const;

  const onAbort = () => {
    if (!currentRequest(accountId, distributionEnvironment, generation)) return;
    publishState({
      accountId,
      distributionEnvironment,
      environment: 'production',
      generation,
      status: 'inactive',
    });
  };
  options.signal?.addEventListener('abort', onAbort, { once: true });

  return enqueueStorage(accountId, async () => {
    try {
      const storageKey = `${STORAGE_PREFIX}${accountId}`;
      const stored = await Storage.getItem(storageKey);
      const environment = distributionEnvironment === 'sandbox' && stored === 'sandbox'
        ? 'sandbox'
        : 'production';
      if (
        options.signal?.aborted
        || !currentRequest(accountId, distributionEnvironment, generation)
      ) return environment;

      if (distributionEnvironment === 'production' && stored === 'sandbox') {
        await Storage.setItem(storageKey, 'production');
        if (
          options.signal?.aborted
          || !currentRequest(accountId, distributionEnvironment, generation)
        ) return environment;
      }

      publishState({
        accountId,
        distributionEnvironment,
        environment,
        generation,
        status: 'active',
      });
      return environment;
    } catch (error) {
      if (currentRequest(accountId, distributionEnvironment, generation)) {
        publishState({
          accountId,
          distributionEnvironment,
          environment: 'production',
          generation,
          status: 'inactive',
        });
      }
      throw error;
    } finally {
      options.signal?.removeEventListener('abort', onAbort);
    }
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
    || state.accountId !== accountId
    || distributionEnvironment !== environment
  ) return false;

  const generation = requestGeneration + 1;
  requestGeneration = generation;
  publishState({
    accountId,
    distributionEnvironment,
    environment: state.environment,
    generation,
    status: state.status,
  });

  return enqueueStorage(accountId, async () => {
    if (
      options.signal?.aborted
      || !currentRequest(accountId, distributionEnvironment, generation)
    ) return false;
    const storageKey = `${STORAGE_PREFIX}${accountId}`;
    const previousEnvironment = await Storage.getItem(storageKey);
    if (
      options.signal?.aborted
      || !currentRequest(accountId, distributionEnvironment, generation)
    ) return false;
    await Storage.setItem(storageKey, environment);
    if (
      options.signal?.aborted
      || !currentRequest(accountId, distributionEnvironment, generation)
    ) {
      if (previousEnvironment === null) await Storage.removeItem(storageKey);
      else await Storage.setItem(storageKey, previousEnvironment);
      return false;
    }
    publishState({
      accountId,
      distributionEnvironment,
      environment,
      generation,
      status: 'active',
    });
    return true;
  });
}

export async function clearNativeCommerceEnvironment(accountId?: string) {
  const targetAccountId = accountId ?? state.accountId;
  deactivateNativeCommerceEnvironment(accountId);
  await enqueueStorage(targetAccountId ?? '__no-active-commerce-account__', async () => {
    if (targetAccountId) await Storage.removeItem(`${STORAGE_PREFIX}${targetAccountId}`);
  });
}
