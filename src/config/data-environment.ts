import { CONTENT_CREDENTIAL_PUBLIC_KEY_BASE64 } from '@icao/contracts';

/** Backend data ownership is independent of StoreKit's sandbox/production mode. */
export function resolveDataEnvironment(value: string | undefined) {
  if (!value || value === 'production') return 'production';
  if (value === 'testing') return 'testing';
  throw new Error('invalid_data_environment');
}

export const DATA_ENVIRONMENT = resolveDataEnvironment(process.env.EXPO_PUBLIC_ICAO_DATA_ENVIRONMENT);

/** Keep shipped production names intact, including when an older app is reinstalled. */
export function dataStorageName(name: string) {
  return DATA_ENVIRONMENT === 'production' ? name : `icao-testing.${name}`;
}

export function contentCredentialPublicKey() {
  if (DATA_ENVIRONMENT === 'production') return CONTENT_CREDENTIAL_PUBLIC_KEY_BASE64;
  const key = process.env.EXPO_PUBLIC_ICAO_CONTENT_PUBLIC_KEY;
  if (!key || !/^[A-Za-z0-9+/]{43}=$/u.test(key) || key === CONTENT_CREDENTIAL_PUBLIC_KEY_BASE64) {
    throw new Error('testing_content_public_key_missing_or_shared');
  }
  return key;
}
