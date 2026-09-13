import { trackProductClick } from '@/platform/product-clicks.native';
import { useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { TopBar } from '@/components/navigation/TopBar';
import { NativeScreenBoundary } from '@/components/states/NativeScreenBoundary.native';
import { BookOpen, FileText, Flame, Headphones, Library, Mic, Sparkles, type LucideIcon } from '@/components/ui/icons';
import { AppText, BottomSheet, Button, Card, Screen } from '@/components/ui';
import { colors, radii, spacing } from '@/theme';
import { useCommerceRuntime } from './CommerceRuntimeProvider';
import { listMembershipProducts } from './membership-products.native';
import type { CommerceRuntimeOffering } from './commerce-runtime-types';

const benefits: { icon: LucideIcon; title: string; detail: string }[] = [
  { icon: Library, title: '解锁会员题库', detail: '完整会员题库内容' },
  { icon: Sparkles, title: '每周 AI 学习额度', detail: '转写、语法纠错与表达优化' },
  { icon: BookOpen, title: '单词学习', detail: '航空词汇记忆与测试' },
  { icon: Headphones, title: '随身听', detail: '音频播放与跟听' },
  { icon: Mic, title: '模拟考试', detail: '按题目练习与作答' },
  { icon: Flame, title: 'OPI 热点', detail: '热点资讯与关联练习' },
  { icon: FileText, title: '资源分享', detail: '畅读备考文章' },
];

function displayDate(value: string | number | undefined | null) {
  if (value == null) return undefined;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return undefined;
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(date);
}

function Benefit({ icon: Icon, title, detail }: { icon: LucideIcon; title: string; detail: string }) {
  return <View style={styles.benefit}>
    <View style={styles.icon}><Icon color={colors.primary} size={19} /></View>
    <View style={styles.flex}><AppText variant="button">{title}</AppText><AppText variant="micro" color={colors.mutedForeground}>{detail}</AppText></View>
  </View>;
}

export function MembershipPage() {
  return <NativeScreenBoundary title="会员与购买" fallbackHref="/(tabs)/profile"><MembershipContent /></NativeScreenBoundary>;
}

function MembershipContent() {
  const commerce = useCommerceRuntime();
  const router = useRouter();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const [selectedKey, setSelectedKey] = useState<CommerceRuntimeOffering['productKey']>('membership_31d_v1');
  const [showTerms, setShowTerms] = useState(false);
  const [actionError, setActionError] = useState('');
  const [localBusy, setLocalBusy] = useState(false);
  const actionRef = useRef(false);
  const activeRef = useRef(true);
  const returnedRef = useRef(false);
  useEffect(() => { activeRef.current = true; return () => { activeRef.current = false; }; }, []);
  const selected = commerce.offerings.find((offering) => offering.productKey === selectedKey);
  const active = commerce.entitlement?.membership.active === true;
  const busy = localBusy || ['loading', 'purchasing', 'restoring', 'reconciling'].includes(commerce.phase);
  const pending = commerce.phase === 'pending';
  const expiry = commerce.entitlement?.membership.expiresAt;
  const expiresLabel = displayDate(expiry);
  const renewalLabel = active && selected && expiry ? displayDate(Date.parse(expiry) + selected.durationDays * 86_400_000) : undefined;
  const canPurchase = commerce.supported && commerce.phase === 'ready' && Boolean(selected) && !busy;
  const status = actionError || commerce.error?.userMessage || commerce.message;

  useEffect(() => {
    if (from !== 'learning' || !active || commerce.phase !== 'ready' || returnedRef.current) return;
    returnedRef.current = true;
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  }, [active, commerce.phase, from, router]);

  async function run(action: () => Promise<unknown>) {
    if (actionRef.current) return;
    actionRef.current = true; setLocalBusy(true); setActionError('');
    try { await action(); }
    catch { if (activeRef.current) setActionError('操作未完成，请稍后重试。'); }
    finally { actionRef.current = false; if (activeRef.current) setLocalBusy(false); }
  }
  const label = busy ? commerce.phase === 'restoring' ? '正在恢复购买…' : commerce.phase === 'purchasing' ? '正在确认购买…' : '正在核对…'
    : pending ? '等待购买确认' : selected ? `${active ? '续费' : '开通'}${selected.durationDays}天会员 · ${selected.localizedPrice}` : '正在读取套餐价格';

  return <Screen bottomInset contentStyle={styles.screen} scroll>
    <TopBar title={active ? '会员续费' : '会员开通'} />
    {active && expiresLabel ? <AppText variant="caption">有效期至 {expiresLabel}</AppText> : null}
    <Card style={styles.benefits}>
      <AppText color={colors.mutedForeground} variant="caption">会员权益</AppText>
      <View style={styles.benefitGrid}>
        {benefits.map((benefit) => <View key={benefit.title} style={styles.half}><Benefit {...benefit} /></View>)}
      </View>
    </Card>
    <View accessibilityRole="radiogroup" style={styles.plans}>
      {listMembershipProducts().map((product) => {
        const offering = commerce.offerings.find((item) => item.productKey === product.key);
        const selected = selectedKey === product.key;
        return <Pressable key={product.key} accessibilityRole="radio" accessibilityLabel={`${product.durationDays}天会员`}
          accessibilityState={{ selected, disabled: busy || pending }} disabled={busy || pending}
          onPress={() => setSelectedKey(product.key)} style={({ pressed }) => [styles.plan, selected && styles.selectedPlan, pressed && styles.pressed]}>
          <AppText color={selected ? colors.primary : colors.foreground} variant="button">{product.durationDays}天</AppText>
          <AppText color={selected ? colors.primary : colors.foreground} variant="cardTitle">{offering?.localizedPrice ?? '—'}</AppText>
        </Pressable>;
      })}
    </View>
    {renewalLabel ? <AppText variant="caption" style={styles.center}>续费后预计至 {renewalLabel}</AppText> : null}
    <Button disabled={!canPurchase} onPress={() => { if (selected) { trackProductClick('purchase', selected.productKey); void run(() => commerce.purchase(selected.productKey)); } }} size="lg" style={styles.purchase} testID="membership-purchase">{label}</Button>
    {status ? <AppText accessibilityLiveRegion="polite" style={styles.center} variant="caption">{status}</AppText> : null}
    {!commerce.supported ? <AppText style={styles.center} variant="caption">当前设备暂不支持购买。已购买的权益以账号实际状态为准。</AppText> : null}
    {commerce.supported && (pending || (['error', 'unavailable'].includes(commerce.phase) && commerce.error?.retryable !== false)) ?
      <Button disabled={busy} onPress={() => void run(commerce.refresh)} variant="outline">{pending ? '检查购买结果' : '重新检查'}</Button> : null}
    {Platform.OS === 'android' && commerce.canCancelPendingPurchase && commerce.cancelPendingPurchase ?
      <Button disabled={busy} onPress={() => void run(commerce.cancelPendingPurchase!)} variant="ghost">取消未支付订单</Button> : null}
    <View style={styles.footer}>
      {Platform.OS === 'ios' ? <Button disabled={busy || !commerce.supported} onPress={() => void run(commerce.restorePurchases)} variant="ghost">恢复购买</Button> : null}
      <Button onPress={() => setShowTerms(true)} variant="ghost">购买须知</Button>
    </View>
    <BottomSheet visible={showTerms} onClose={() => setShowTerms(false)} accessibilityLabel="购买须知">
      <View style={styles.terms}>
        <AppText variant="sectionTitle">购买须知</AppText>
        <AppText>一次购买，到期不自动续费。</AppText>
        <AppText>价格以支付平台显示为准。有效期内续费将顺延会员时间，不会立即补充 AI 额度；每周额度按原周期恢复。</AppText>
        <AppText>购买和恢复的权益归属原购买账号。若购买结果尚未确认，请等待自动核对，避免重复付款。</AppText>
        <AppText>会员到期后保留学习数据；会员题面、参考答案和音频按当前权限开放。</AppText>
        <Button onPress={() => setShowTerms(false)} variant="outline">关闭</Button>
      </View>
    </BottomSheet>
  </Screen>;
}

const styles = StyleSheet.create({
  screen: { gap: spacing[4] }, flex: { flex: 1 },
  benefits: { gap: spacing[4], padding: spacing[4] },
  benefit: { alignItems: 'center', flexDirection: 'row', gap: spacing[2] },
  icon: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary08, borderRadius: radii.full, width: 36, height: 36 },
  benefitGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing[5] },
  half: { width: '50%', paddingRight: spacing[2] },
  plans: { flexDirection: 'row', gap: spacing[2], marginTop: spacing[2] },
  plan: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing[2], paddingHorizontal: spacing[1], paddingVertical: spacing[4], borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  selectedPlan: { backgroundColor: colors.primary08, borderColor: colors.primary }, pressed: { opacity: 0.8 },
  purchase: { marginTop: spacing[1] }, center: { textAlign: 'center' },
  footer: { flexDirection: 'row', justifyContent: 'center', gap: spacing[5] }, terms: { gap: spacing[4] },
});
