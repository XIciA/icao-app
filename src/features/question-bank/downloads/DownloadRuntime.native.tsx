import { nativeCommerceEnvironmentSnapshot, subscribeNativeCommerceEnvironment } from '@/features/native-commercial-testflight/commerce-environment';
import { useEffect, useSyncExternalStore } from 'react';
import { observeDownloadRuntime } from './download-manager.native';

export function DownloadRuntime() {
  const identity = useSyncExternalStore(subscribeNativeCommerceEnvironment, nativeCommerceEnvironmentSnapshot, nativeCommerceEnvironmentSnapshot);
  useEffect(observeDownloadRuntime, [identity]);
  return null;
}
