import { useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { useLocalSearchParams, usePathname, type Href } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { useAppRouter } from '@/components/navigation/useAppRouter';
import { AppText, Button, Screen } from '@/components/ui';
import { TopBar } from '@/components/navigation/TopBar';
import { useAuth } from './AuthProvider';
import { useLoginEntry } from './use-login-entry';
import { destinationWithQuery } from './guest-access';
import { useCommerceRuntime } from '@/features/native-commercial-testflight/CommerceRuntimeProvider';

/** Protect the destination too: deep links and alternate entries use the same gate. */
export function MemberFeatureGate({ children }: PropsWithChildren) {
  const auth = useAuth();
  const commerce = useCommerceRuntime();
  const login = useLoginEntry();
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
    if (!auth.canAccessApp) { redirected.current = true; login(destination, '登录后查看会员权益'); return; }
    // Missing or failed entitlement reads are not evidence of a non-member.
    if (commerce.entitlement && !active && !['loading', 'reconciling', 'error'].includes(commerce.phase)) {
      redirected.current = true;
      router.replace(`/account/membership?next=${encodeURIComponent(destination)}` as Href);
    }
  }, [auth.canAccessApp, active, commerce.entitlement, commerce.phase, destination, focused]); // eslint-disable-line react-hooks/exhaustive-deps
  if (auth.canAccessApp && active) return children;
  return <Screen header={<TopBar title="会员功能" onBack={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/discover')} />}>
    <AppText variant="sectionTitle">{commerce.phase === 'error' ? '暂时无法确认会员状态' : '正在确认会员权益…'}</AppText>
    {commerce.phase === 'error' ? <Button variant="outline" onPress={() => { void commerce.refresh(); }}>重新检查</Button> : null}
  </Screen>;
}
