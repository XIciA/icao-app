import type { NativeCommerceProvider } from './commerce-provider.native';
import { createReactNativeIapStoreKitClient } from './react-native-iap-storekit-client.native';
import { createStoreKitNativeCommerceProvider } from './storekit-commerce-provider.native';

export const APPLE_STOREKIT_COMMERCE_INFRASTRUCTURE_ONLY = true as const;

/** Native iOS adapter construction point. Importing it does not enable commerce in the app. */
export function createAppleStoreKitCommerceProvider(): NativeCommerceProvider {
  return createStoreKitNativeCommerceProvider(createReactNativeIapStoreKitClient());
}
