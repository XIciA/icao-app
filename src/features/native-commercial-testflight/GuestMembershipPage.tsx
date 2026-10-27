import { useEffect, useRef } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { GlobalLoadingScreen } from '@/components/states/GlobalLoadingScreen';
import { useLoginEntry } from '@/features/auth/use-login-entry';
import { safeAppDestination } from '@/features/auth/guest-access';

/** The membership route is a destination, never an extra guest explanation page. */
export function GuestMembershipPage() {
  const login = useLoginEntry();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const target = safeAppDestination(next);
  const destination = `/account/membership${target ? `?next=${encodeURIComponent(target)}` : ''}`;
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    login(destination, undefined, { replace: true });
  }, [destination, login]);
  return <GlobalLoadingScreen />;
}
