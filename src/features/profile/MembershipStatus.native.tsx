import { useAuth } from '@/features/auth/AuthProvider';
import { secureSessionStorage } from '@/features/auth/secure-session-storage';
import { getNativeCommerceEnvironment } from '@/features/native-commercial-testflight/commerce-environment';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useAppRouter } from '@/components/navigation/useAppRouter';
import { AppText, BottomSheet, Button } from '@/components/ui';
import { Star } from '@/components/ui/icons';
import { useCommerceRuntime } from '@/features/native-commercial-testflight/CommerceRuntimeProvider';
import type { CommerceEntitlementSummary } from '@icao/contracts';
import { colors, radii, spacing } from '@/theme';

export function membershipPresentation(entitlement?: CommerceEntitlementSummary) {
  if (!entitlement) return { active: false, label: '待验证', expires: '—' };
  const { expiresAt } = entitlement.membership;
  const active = entitlement.membership.active && (!expiresAt || Date.parse(expiresAt) > Date.parse(entitlement.serverTime));
  const expires = expiresAt ? new Date(expiresAt).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : '—';
  // Access stays owned by commerce; this only formats the service snapshot.
  const days = expiresAt ? Math.max(0, Math.ceil((Date.parse(expiresAt) - Date.parse(entitlement.serverTime)) / 86_400_000)) : 0;
  return { active, expires, label: active ? `剩余 ${days} 天` : expiresAt ? '会员已过期' : '未开通会员' };
}
export function VipBadge({ active }: { active: boolean }) {
  const color = active ? colors.accent : colors.mutedForeground;
  return <View style={[styles.badge, { borderColor: active ? colors.accent : colors.border }]}><Star size={14} color={color} /><AppText color={color} variant="micro">VIP</AppText></View>;
}
export function MembershipStatus({ pill = false, align = 'start' }: { pill?: boolean; align?: 'start' | 'end' }) {
  const commerce = useCommerceRuntime(); const router = useAppRouter(); const [open, setOpen] = useState(false);
  const auth = useAuth();
  const owner = auth.accountReady ? auth.account?.accountId : undefined;
  const environment = getNativeCommerceEnvironment();
  const entitlementKey = JSON.stringify(commerce.entitlement);
  const cacheKey = `icao.membership.presentation.v1.${owner}.${environment}`;
  const [cached, setCached] = useState<{ key: string; snapshot: CommerceEntitlementSummary; receivedAt: number }>();
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    let active = true;
    if (!owner) return;
    if (entitlementKey) {
      const snapshot = JSON.parse(entitlementKey) as CommerceEntitlementSummary;
      void secureSessionStorage.setItem(cacheKey, JSON.stringify({ snapshot, receivedAt: Date.now() })).catch(() => undefined);
      setCached({ key: cacheKey, snapshot, receivedAt: Date.now() });
    } else {
      void secureSessionStorage.getItem(cacheKey).then(raw => {
        if (!raw || !active) return;
        const value = JSON.parse(raw) as { snapshot: CommerceEntitlementSummary; receivedAt: number };
        const elapsed = Date.now() - value.receivedAt;
        if (elapsed < 0 || elapsed > 72 * 60 * 60 * 1000) return;
        const time = Date.parse(value.snapshot.serverTime) + elapsed;
        if (value.snapshot.membership.active && Date.parse(value.snapshot.membership.expiresAt ?? '') <= time) return;
        setCached({ key: cacheKey, snapshot: value.snapshot, receivedAt: value.receivedAt });
      }).catch(() => undefined);
    }
    return () => { active = false; };
  }, [cacheKey, owner, entitlementKey]);
  // A presentation snapshot never feeds commerce permissions or purchase decisions.
  const elapsed = cached ? Math.max(0, now - cached.receivedAt) : 0;
  const display = cached?.key === cacheKey && (commerce.entitlement || elapsed <= 72 * 60 * 60 * 1000)
    ? { ...cached.snapshot, serverTime: new Date(Date.parse(cached.snapshot.serverTime) + elapsed).toISOString() }
    : commerce.entitlement;
  const membership = membershipPresentation(display);
  const statusLabel = commerce.phase === 'error' && !display ? '会员状态暂时无法读取' : membership.label;
  useEffect(() => { setOpen(false); }, [commerce.entitlementChange?.accountId]);
  return <>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`查看会员状态，${statusLabel}`}
      onPress={(event) => { event.stopPropagation(); setOpen(true); }}
      style={({ pressed }) => [styles.trigger, align === 'end' && styles.alignEnd, pill && styles.pill, pill && !membership.active && styles.inactivePill, pressed && styles.pressed]}
    >
      {pill ? <Star size={16} color={membership.active ? colors.accent : colors.mutedForeground} /> : <VipBadge active={membership.active} />}
      <AppText color={pill && membership.active ? colors.accent : colors.mutedForeground} style={styles.status} variant="caption">
        {pill ? 'VIP · ' : ''}{statusLabel}
      </AppText>
    </Pressable>
    <BottomSheet visible={open} onClose={() => setOpen(false)} accessibilityLabel="会员状态"><View style={styles.sheet}>
      <AppText variant="sectionTitle">会员状态</AppText><VipBadge active={membership.active} /><AppText variant="cardTitle">{membership.label}</AppText>
      <AppText variant="caption">到期时间：{membership.expires}</AppText><AppText variant="caption">会员权益相同，购买天数决定有效时长。</AppText>
      <Button onPress={() => { setOpen(false); router.push('/account/membership'); }}>查看会员与购买</Button>
    </View></BottomSheet>
  </>;
}
const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, flexShrink: 0, width: 58, height: 32, borderWidth: 1, borderRadius: radii.sm },
  trigger: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], minWidth: 0, maxWidth: '100%', minHeight: 44, alignSelf: 'flex-start' },
  alignEnd: { alignSelf: 'flex-end' },
  pill: { borderRadius: radii.full, paddingHorizontal: spacing[3], paddingVertical: spacing[2], backgroundColor: 'rgba(183, 118, 16, 0.06)', borderWidth: 1, borderColor: 'rgba(183, 118, 16, 0.16)' },
  inactivePill: { backgroundColor: colors.muted, borderColor: colors.border },
  status: { flexShrink: 1 },
  pressed: { opacity: 0.72 },
  sheet: { gap: spacing[4] },
});
