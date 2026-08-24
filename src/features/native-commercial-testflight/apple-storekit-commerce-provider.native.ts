import type { NativeCommerceProvider } from './commerce-provider.native';
import { createStoreKitNativeCommerceProvider } from './storekit-commerce-provider.native';

export const APPLE_STOREKIT_COMMERCE_RUNTIME_READY = true as const;

/** Native iOS adapter construction point. Importing it does not load the Nitro StoreKit bridge. */
export function createAppleStoreKitCommerceProvider(): NativeCommerceProvider {
  // Deliberately lazy: app shells, Android, and unit tests must not evaluate the
  // Nitro native module unless an authenticated iOS commerce runtime is enabled.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createReactNativeIapStoreKitClient } = require('./react-native-iap-storekit-client.native') as typeof import('./react-native-iap-storekit-client.native');
  return createStoreKitNativeCommerceProvider(createReactNativeIapStoreKitClient());
}
