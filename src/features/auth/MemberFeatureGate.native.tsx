import { useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { useLocalSearchParams, usePathname, type Href } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { useAppRouter } from '@/components/navigation/useAppRouter';
import { Button, Screen } from '@/components/ui';
import { GlobalLoadingScreen } from '@/components/states/GlobalLoadingScreen';
import { CenteredState } from '@/components/states/CenteredState';
import { TopBar } from '@/components/navigation/TopBar';
import { useLoginEntry } from './use-login-entry';
import { useAuth } from './AuthProvider';
import { destinationWithQuery } from './guest-access';
import { useCommerceRuntime } from '@/features/native-commercial-testflight/CommerceRuntimeProvider';

/** Protect the destination too: deep links and alternate entries use the same gate. */
export function MemberFeatureGate({ children }: PropsWithChildren) {
  const auth = useAuth();
  const login = useLoginEntry();
  const commerce = useCommerceRuntime();
  const router = useAppRouter();
  const pathname = usePathname();
  const focused = useIsFocused();
  const redirected = useRef(false);
  const params = useLocalSearchParams();
  const [clock, setClock] = useState(Date.now());
  const membership = commerce.entitlement?.membership;
  const active = membership?.active === true && (!membership.expiresAt || Date.parse(membership.expiresAt) > Math.max(clock, Date.now()));
  const destination = destinationWithQuery(pathname, params);
  useEffect(() => {
    if (!membership?.expiresAt) return;
    const remaining = Date.parse(membership.expiresAt) - Date.now();
    if (!Number.isFinite(remaining) || remaining <= 0) return;
    const timer = setTimeout(() => setClock(Date.now()), Math.min(2147483647, remaining + 25));
    return () => clearTimeout(timer);
  }, [membership?.expiresAt, clock]);
  useEffect(() => {
    if (!focused) { redirected.current = false; return; }
    if (redirected.current) return;
    if (!auth.canAccessApp) { redirected.current = true; login(destination, undefined, { replace: true, returnTo: '/(tabs)/discover' }); return; }
    // Missing or failed entitlement reads are not evidence of a non-member.
    if (commerce.entitlement && !active && !['loading', 'reconciling', 'error'].includes(commerce.phase)) {
      redirected.current = true;
      router.replace(`/account/membership?next=${encodeURIComponent(destination)}` as Href);
    }
  }, [auth.canAccessApp, active, commerce.entitlement, commerce.phase, destination, focused]); // eslint-disable-line react-hooks/exhaustive-deps
  if (auth.canAccessApp && active) return children;
  if (commerce.phase !== 'error') return <GlobalLoadingScreen />;
  return <Screen header={<TopBar title="暂时无法打开" onBack={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/discover')} />}>
    <CenteredState title="暂时无法确认会员状态" description="请检查网络后重试。" secondary={<Button variant="outline" onPress={() => { void commerce.refresh(); }}>重新检查</Button>} />
  </Screen>;
}
