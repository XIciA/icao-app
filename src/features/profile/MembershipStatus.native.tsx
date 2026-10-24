import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useAppRouter } from '@/components/navigation/useAppRouter';
import { AppText, BottomSheet, Button } from '@/components/ui';
import { Star } from '@/components/ui/icons';
import { useCommerceRuntime } from '@/features/native-commercial-testflight/CommerceRuntimeProvider';
import type { CommerceEntitlementSummary } from '@icao/contracts';
import { colors, radii, spacing } from '@/theme';

export function membershipPresentation(entitlement?: CommerceEntitlementSummary) {
  if (!entitlement) return { active: false, label: '正在确认会员…', expires: '—' };
  const { active, expiresAt } = entitlement.membership;
  const expires = expiresAt ? new Date(expiresAt).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : '—';
  // Access stays owned by commerce; this only formats the service snapshot.
  const days = expiresAt ? Math.max(0, Math.ceil((Date.parse(expiresAt) - Date.parse(entitlement.serverTime)) / 86_400_000)) : 0;
  return { active, expires, label: active ? `剩余 ${days} 天` : expiresAt ? '会员已过期' : '未开通会员' };
}
export function VipBadge({ active }: { active: boolean }) {
  const color = active ? colors.accent : colors.mutedForeground;
  return <View style={[styles.badge, { borderColor: active ? colors.accent : colors.border }]}><Star size={14} color={color} /><AppText color={color} variant="micro">VIP</AppText></View>;
}
export function MembershipStatus({ pill = false }: { pill?: boolean }) {
  const commerce = useCommerceRuntime(); const router = useAppRouter(); const [open, setOpen] = useState(false);
  const membership = membershipPresentation(commerce.entitlement);
  const statusLabel = commerce.phase === 'error' && !commerce.entitlement ? '会员状态暂时无法读取' : membership.label;
  useEffect(() => { setOpen(false); }, [commerce.entitlementChange?.accountId]);
  return <>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`查看会员状态，${statusLabel}`}
      onPress={(event) => { event.stopPropagation(); setOpen(true); }}
      style={({ pressed }) => [styles.trigger, pill && styles.pill, pill && !membership.active && styles.inactivePill, pressed && styles.pressed]}
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
  pill: { borderRadius: radii.full, paddingHorizontal: spacing[3], paddingVertical: spacing[2], backgroundColor: 'rgba(183, 118, 16, 0.06)', borderWidth: 1, borderColor: 'rgba(183, 118, 16, 0.16)' },
  inactivePill: { backgroundColor: colors.muted, borderColor: colors.border },
  status: { flexShrink: 1 },
  pressed: { opacity: 0.72 },
  sheet: { gap: spacing[4] },
});
