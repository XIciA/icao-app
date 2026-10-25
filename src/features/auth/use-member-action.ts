import type { Href } from 'expo-router';
import { useAppRouter } from '@/components/navigation/useAppRouter';
import { useAuth } from './AuthProvider';
import { useCommerceRuntime } from '@/features/native-commercial-testflight/CommerceRuntimeProvider';

/** Deliberate member actions share the protected destination's entitlement gate. */
export function useMemberAction() {
  const auth = useAuth();
  const commerce = useCommerceRuntime();
  const router = useAppRouter();
  return (destination: string) => {
    const membership = commerce.entitlement?.membership;
    const active = auth.canAccessApp && membership?.active === true
      && (!membership.expiresAt || Date.parse(membership.expiresAt) > Date.now());
    const confirmed = commerce.entitlement && !['loading', 'reconciling', 'error'].includes(commerce.phase);
    if (!auth.canAccessApp || (confirmed && !active)) {
      router.push(`/account/membership?next=${encodeURIComponent(destination)}` as Href);
    } else {
      // Unknown status is handled by MemberFeatureGate with retry, never guessed.
      router.push(destination as Href);
    }
  };
}
