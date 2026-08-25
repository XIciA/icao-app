import type { CommerceEnvironment } from '@icao/contracts';
import { getIcaoDistributionEnvironment } from '@icao/distribution-environment';
import { Platform } from 'react-native';
import Storage from '@/platform/storage';

let activeEnvironment: CommerceEnvironment = 'production';
let activeAccountId: string | undefined;
let activeDistributionEnvironment: CommerceEnvironment = 'production';
let revision = 0;
const listeners = new Set<() => void>();
const STORAGE_PREFIX = 'icao.commerce.environment.v1.';

export function detectNativeDistributionEnvironment(): CommerceEnvironment {
  return Platform.OS === 'ios' ? getIcaoDistributionEnvironment() : 'production';
}

export function getNativeCommerceEnvironment(): CommerceEnvironment {
  return activeEnvironment;
}

export function setNativeCommerceEnvironment(environment: CommerceEnvironment) {
  if (activeAccountId && environment !== activeDistributionEnvironment) return;
  if (activeEnvironment === environment) return;
  activeEnvironment = environment;
  revision += 1;
  for (const listener of listeners) listener();
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
  activeAccountId = accountId;
  activeDistributionEnvironment = distributionEnvironment;
  const stored = await Storage.getItem(`${STORAGE_PREFIX}${accountId}`);
  const environment = distributionEnvironment === 'sandbox' && stored === 'sandbox'
    ? 'sandbox'
    : 'production';
  if (distributionEnvironment === 'production' && stored === 'sandbox') {
    await Storage.setItem(`${STORAGE_PREFIX}${accountId}`, 'production');
  }
  setNativeCommerceEnvironment(environment);
  return environment;
}

export async function confirmNativeCommerceEnvironment(
  accountId: string,
  environment: CommerceEnvironment,
) {
  activeDistributionEnvironment = detectNativeDistributionEnvironment();
  if (activeAccountId !== accountId || activeDistributionEnvironment !== environment) return false;
  await Storage.setItem(`${STORAGE_PREFIX}${accountId}`, environment);
  activeEnvironment = environment;
  revision += 1;
  for (const listener of listeners) listener();
  return true;
}

export async function clearNativeCommerceEnvironment(accountId?: string) {
  const targetAccountId = accountId ?? activeAccountId;
  if (targetAccountId) await Storage.removeItem(`${STORAGE_PREFIX}${targetAccountId}`);
  if (!accountId || activeAccountId === accountId) {
    activeAccountId = undefined;
    activeDistributionEnvironment = 'production';
    setNativeCommerceEnvironment('production');
  }
}
