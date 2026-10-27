import { useRouter, useLocalSearchParams, type Href } from 'expo-router';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { useCallback, useEffect, useRef } from 'react';
import { safeAppDestination } from '@/features/auth/guest-access';
import { StyleSheet, View } from 'react-native';
import { TopBar } from '@/components/navigation/TopBar';
import { Flame, Headphones, Library, Mic, Sparkles } from '@/components/ui/icons';
import { AppText, Button, Card, Screen } from '@/components/ui';
import { isEdgeOneProductionWeb } from '@/config/web-runtime';
import { colors, radii, spacing } from '@/theme';
import { useCommerceRuntime } from './CommerceRuntimeProvider';
import { MembershipPage } from './MembershipPage';
import { WebWechatCheckout } from './WebWechatCheckout.browser';

function WebMembership() {
  const commerce = useCommerceRuntime();
  const router = useRouter();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const focused = useIsFocused();
  const resumed = useRef(false);
  const refresh = commerce.refresh;
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  const membership = commerce.entitlement?.membership;
  const loading = commerce.phase === 'loading' || commerce.phase === 'reconciling';
  const expiry = membership?.expiresAt ? new Date(membership.expiresAt) : undefined;
  const active = membership?.active === true && (!expiry || expiry.getTime() > Date.now());
  useEffect(() => {
    if (!focused) { resumed.current = false; return; }
    const target = safeAppDestination(next);
    if (active && !resumed.current && target && !target.startsWith('/account/membership')) {
      resumed.current = true;
      router.replace(target as Href);
    }
  }, [active, focused, next, router]);
  return <Screen bottomInset scroll contentStyle={styles.screen} header={<TopBar title={active ? '会员续费' : '会员开通'} />}>
    <View style={{ gap: spacing[4] }}>
      {active && expiry && Number.isFinite(expiry.getTime()) ? <AppText variant="caption">有效期至 {expiry.toLocaleString('zh-CN')}</AppText> : null}
      <Card style={{ gap: spacing[4], padding: spacing[4] }}>
        <AppText variant="caption" color={colors.mutedForeground}>会员权益</AppText>
        <View style={styles.benefitGrid}>
          {[
            { Icon: Library, title: '解锁会员题库', detail: '完整会员题库内容' },
            { Icon: Sparkles, title: '每周 AI 学习额度', detail: '转写、语法纠错与表达优化' },
            { Icon: Headphones, title: '会员音频', detail: '随身听解锁会员音频与跟听' },
            { Icon: Mic, title: '模拟练习', detail: '按题目练习与作答' },
            { Icon: Flame, title: 'OPI 热点', detail: '参考答案、音频与作答练习；热点概览免费' },
          ].map(({ Icon, title, detail }) => <View key={title} style={styles.benefit}>
            <View style={styles.icon}><Icon color={colors.primary} size={19} /></View>
            <View style={{ flex: 1 }}><AppText variant="button">{title}</AppText><AppText variant="micro" color={colors.mutedForeground}>{detail}</AppText></View>
          </View>)}
        </View>
      </Card>
      <WebWechatCheckout />
      {commerce.message ? <AppText accessibilityRole="alert" variant="caption">{commerce.message}</AppText> : null}
      <Button disabled={loading} variant="secondary" onPress={() => { void commerce.refresh(); }}>{loading ? '同步中…' : '重新同步权益'}</Button>
    </View>
  </Screen>;
}

export function MembershipRoutePage() {
  return isEdgeOneProductionWeb() ? <WebMembership /> : <MembershipPage />;
}

const styles = StyleSheet.create({
  screen: { gap: spacing[4] }, benefitGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing[5] },
  benefit: { width: '50%', paddingRight: spacing[2], flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  icon: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary08, borderRadius: radii.full, width: 36, height: 36 },
});
