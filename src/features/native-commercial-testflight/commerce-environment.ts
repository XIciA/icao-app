import type { CommerceEnvironment } from '@icao/contracts';

export function detectNativeDistributionEnvironment(): CommerceEnvironment {
  return 'production';
}

export function getNativeCommerceEnvironment(): CommerceEnvironment {
  return 'production';
}

export function setNativeCommerceEnvironment(_environment: CommerceEnvironment) {}

export function nativeCommerceEnvironmentSnapshot() {
  return 'production:0';
}

export function subscribeNativeCommerceEnvironment(_listener: () => void) {
  return () => undefined;
}

export async function activateNativeCommerceEnvironment(
  _accountId: string,
  _distributionEnvironment: CommerceEnvironment,
) {
  return 'production' as const;
}

export async function confirmNativeCommerceEnvironment(
  _accountId: string,
  _environment: CommerceEnvironment,
) {
  return _environment === 'production';
}

export async function clearNativeCommerceEnvironment(_accountId?: string) {}
