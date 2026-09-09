import { useEffect } from 'react';
import { AppState } from 'react-native';
import { usePathname } from 'expo-router';
import { subscribeNativeCommerceEnvironment } from '@/features/native-commercial-testflight/commerce-environment.native';
import { recoverPendingAiOperations } from './ai-operation-recovery.native';

/** Mounted only inside the signed-in Native app. No extra surface or polling loop. */
export function NativeAiRecovery() {
  const pathname = usePathname();
  useEffect(() => {
    const recover = () => { void recoverPendingAiOperations().catch(() => undefined); };
    recover();
    const unsubscribe = subscribeNativeCommerceEnvironment(recover);
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') recover(); });
    return () => { unsubscribe(); subscription.remove(); };
  }, [pathname]);
  return null;
}
