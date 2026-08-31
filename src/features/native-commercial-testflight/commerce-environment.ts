import type { CommerceEnvironment } from '@icao/contracts';

export function detectNativeDistributionEnvironment(): CommerceEnvironment {
  return 'production';
}

export function getNativeCommerceEnvironment(): CommerceEnvironment {
  return 'production';
}

export function deactivateNativeCommerceEnvironment(_accountId?: string) {}

export function nativeCommerceEnvironmentSnapshot() {
  return 'production:0';
}

export function subscribeNativeCommerceEnvironment(_listener: () => void) {
  return () => undefined;
}

export async function activateNativeCommerceEnvironment(
  _accountId: string,
  _distributionEnvironment: CommerceEnvironment,
  _options: Readonly<{ signal?: AbortSignal }> = {},
) {
  return 'production' as const;
}

export async function confirmNativeCommerceEnvironment(
  _accountId: string,
  _environment: CommerceEnvironment,
  _options: Readonly<{ signal?: AbortSignal }> = {},
) {
  return !_options.signal?.aborted && _environment === 'production';
}

export async function clearNativeCommerceEnvironment(_accountId?: string) {}
