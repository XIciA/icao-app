import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { qrcodegen } from '@/vendor/qrcodegen';
import { randomUUID } from 'expo-crypto';
import type { WechatCheckout, WechatPayCatalog } from '@icao/contracts/wechat-pay';
import { AppText, BottomSheet, Button } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { getAuthService } from '@/features/auth/auth-service';
import { ApiClientError, apiRequestWithAccessToken } from '@/platform/api-client';
import { colors, radii, spacing } from '@/theme';
import { listMembershipProducts } from './membership-products.native';
import { useCommerceRuntime } from './CommerceRuntimeProvider';

type Product = WechatPayCatalog['products'][number];
const root = '/v1/commerce/wechat';
const isPending = (order: WechatCheckout | null) => order?.state === 'pending' || order?.state === 'refund_pending';

/** Encode locally: no payment URL or account information goes to a QR image service. */
export function WechatPaymentQr({ value }: { value: string }) {
  const qr = qrcodegen.QrCode.encodeText(value, qrcodegen.QrCode.Ecc.MEDIUM);
  const size = qr.size;
  let path = '';
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
    if (qr.getModule(x, y)) path += `M${x + 4} ${y + 4}h1v1h-1z`;
  }
  return <View style={styles.qr} accessibilityRole="image" accessibilityLabel="微信支付二维码，请使用另一台设备的微信扫一扫">
    <Svg width={224} height={224} viewBox={`0 0 ${size + 8} ${size + 8}`}>
      <Rect width={size + 8} height={size + 8} fill="#FFFFFF" />
      <Path d={path} fill="#000000" />
    </Svg>
  </View>;
}

function AccountCheckout({ userId }: { userId: string }) {
  const commerce = useCommerceRuntime();
  const refreshEntitlement = useRef(commerce.refresh); refreshEntitlement.current = commerce.refresh;
  const mounted = useRef(true);
  const busy = useRef(false);
  const pending = useRef<WechatCheckout | null>(null);
  const retry = useRef<{ productKey: string; idempotencyKey: string } | undefined>(undefined);
  const [selectedKey, setSelectedKey] = useState('membership_31d_v1');
  const [showTerms, setShowTerms] = useState(false);
  const [catalog, setCatalog] = useState<WechatPayCatalog>();
  const [order, setOrder] = useState<WechatCheckout | null>(null);
  const [working, setWorking] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState<string>();
  const [clock, setClock] = useState(Date.now());

  const freshToken = useCallback(async () => {
    const session = await getAuthService()?.getSession();
    if (!mounted.current || session?.user.id !== userId || !session.accessToken) throw new Error('payment_account_changed');
    return session.accessToken;
  }, [userId]);
  const apply = useCallback(async (result: WechatCheckout | null) => {
    if (!mounted.current) return;
    pending.current = isPending(result) ? result : null;
    setOrder(result);
    if (result && !isPending(result)) retry.current = undefined;
    if (result?.state === 'paid' || result?.state === 'refunded') {
      setMessage(result.state === 'paid' ? '支付成功，正在同步会员权益。' : '订单已退款，正在同步权益。');
      await refreshEntitlement.current();
    } else if (result?.state === 'closed') setMessage('未支付订单已关闭，可以重新选择套餐。');
    else if (result?.state === 'refund_pending') setMessage('退款处理中，请稍后重新检查。');
    else if (result?.state === 'pending') setMessage(result.channel === 'APP'
      ? '你有一笔 APP 订单，请在 APP 完成付款，或取消后重新下单。'
      : result.codeUrl ? '请用另一台设备打开微信扫一扫。付款后将自动核对到账。' : '订单正在核对，请重新检查，或取消未支付订单后重试。');
  }, []);
  const check = useCallback(async (initial = false) => {
    if (!mounted.current || busy.current) return;
    busy.current = true; setWorking(true);
    try {
      const token = await freshToken();
      if (initial) {
        const available = await apiRequestWithAccessToken<WechatPayCatalog>(`${root}/catalog?channel=NATIVE`, token);
        if (!mounted.current) return;
        setCatalog(available);
        setSelectedKey((key) => available.products.some((p) => p.productKey === key) ? key : available.products[0]?.productKey ?? key);
      }
      const current = pending.current ?? await apiRequestWithAccessToken<WechatCheckout | null>(`${root}/pending`, token);
      const result = current ? await apiRequestWithAccessToken<WechatCheckout>(`${root}/checkouts/${encodeURIComponent(current.id)}`, token) : null;
      if (!mounted.current) return;
      await apply(result);
      if (!result) setMessage(retry.current ? '上次下单结果仍未确认，请选择原套餐重试或重新检查订单。' : undefined);
      setLoaded(true);
    } catch {
      if (mounted.current) setMessage('暂时无法核对支付状态，请重新检查；请勿重复付款。');
    } finally { busy.current = false; if (mounted.current) setWorking(false); }
  }, [apply, freshToken]);

  useEffect(() => {
    mounted.current = true;
    void check(true);
    const poll = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      if (pending.current) void check();
      setClock(Date.now());
    }, 5_000);
    const foreground = () => { void check(true); };
    const state = AppState.addEventListener('change', (value) => { if (value === 'active') foreground(); });
    window.addEventListener('focus', foreground);
    window.addEventListener('online', foreground);
    return () => { mounted.current = false; clearInterval(poll); state.remove(); window.removeEventListener('focus', foreground); window.removeEventListener('online', foreground); };
  }, [check]);

  const purchase = async (product: Product) => {
    if (!mounted.current || busy.current || pending.current || !catalog?.available || !loaded) return;
    if (retry.current && retry.current.productKey !== product.productKey) return;
    busy.current = true; setWorking(true); setMessage('正在创建支付订单…');
    try {
      const token = await freshToken();
      // Discover a prior order before retrying, including one created in another browser tab.
      const previous = await apiRequestWithAccessToken<WechatCheckout | null>(`${root}/pending`, token);
      if (!mounted.current) return;
      if (previous) { await apply(await apiRequestWithAccessToken<WechatCheckout>(`${root}/checkouts/${encodeURIComponent(previous.id)}`, token)); return; }
      if (!retry.current) retry.current = { productKey: product.productKey, idempotencyKey: randomUUID() };
      // An uncertain request always retains its original product and idempotency key.
      const result = await apiRequestWithAccessToken<WechatCheckout>(`${root}/checkouts`, token, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...retry.current, channel: 'NATIVE' }),
      });
      await apply(result);
    } catch (error) {
      if (mounted.current) {
        if (error instanceof ApiClientError && error.status >= 400 && error.status < 500) {
          if (error.code !== 'wechat_checkout_pending') retry.current = undefined;
        }
        setLoaded(false);
        setMessage('订单结果尚未确认，请先重新检查；请勿重复付款。');
      }
    } finally { busy.current = false; if (mounted.current) setWorking(false); }
  };
  const cancel = async () => {
    const current = pending.current;
    if (!current || current.state !== 'pending' || busy.current) return;
    busy.current = true; setWorking(true);
    try {
      const token = await freshToken();
      await apply(await apiRequestWithAccessToken<WechatCheckout>(`${root}/checkouts/${encodeURIComponent(current.id)}/cancel`, token, { method: 'POST' }));
    } catch { if (mounted.current) setMessage('暂时无法确认取消结果，请重新检查订单；请勿重复付款。'); }
    finally { busy.current = false; if (mounted.current) setWorking(false); }
  };
  const live = order?.state === 'pending' && order.channel === 'NATIVE' && order.codeUrl && Date.parse(order.expiresAt) > clock;
  const selected = catalog?.products.find((p) => p.productKey === selectedKey);
  const blocked = working || !loaded || Boolean(pending.current);
  const active = commerce.entitlement?.membership.active === true;
  const expiry = commerce.entitlement?.membership.expiresAt;
  const renewal = active && selected && expiry ? new Date(Date.parse(expiry) + selected.durationDays * 86_400_000) : undefined;
  return <View style={styles.card} testID="web-wechat-checkout">
    {catalog?.available ? <>
      <View accessibilityRole="radiogroup" style={styles.plans}>
        {catalog.products.map((product) => {
          const chosen = product.productKey === selectedKey;
          const original = listMembershipProducts().find((p) => p.key === product.productKey)?.originalPriceCny;
          return <Pressable key={product.productKey} accessibilityRole="radio" accessibilityLabel={product.title}
            accessibilityState={{ checked: chosen, disabled: blocked }} disabled={blocked || Boolean(retry.current && retry.current.productKey !== product.productKey)}
            onPress={() => setSelectedKey(product.productKey)} style={[styles.plan, chosen && styles.selectedPlan]}>
            <AppText color={chosen ? colors.primary : colors.foreground} variant="button">{product.durationDays}天</AppText>
            <AppText color={chosen ? colors.primary : colors.foreground} variant="cardTitle">¥{(product.amountFen / 100).toFixed(2)}</AppText>
            {original != null && original * 100 > product.amountFen ? <AppText variant="caption" color={colors.mutedForeground} style={styles.originalPrice}>¥{original}</AppText> : null}
          </Pressable>;
        })}
      </View>
      {renewal && Number.isFinite(renewal.getTime()) ? <AppText variant="caption" style={styles.center}>续费后预计至 {renewal.toLocaleString('zh-CN')}</AppText> : null}
      <Button size="lg" testID="membership-purchase" disabled={blocked || !selected || Boolean(retry.current && retry.current.productKey !== selected.productKey)}
        onPress={() => { if (selected) void purchase(selected); }}>
        {working ? '正在核对…' : pending.current ? '等待购买确认' : selected ? `${active ? '续费' : '开通'}${selected.durationDays}天会员 · ¥${(selected.amountFen / 100).toFixed(2)}` : '暂时没有可购买的套餐'}
      </Button>
      <AppText variant="caption" style={styles.center}>使用另一台设备的微信扫一扫付款；网页与 APP 共享当前账号的会员权益。</AppText>
    </> : <AppText variant="caption">{catalog ? '网页微信支付暂未开放，可在 APP 购买后同步权益。' : '正在读取支付服务…'}</AppText>}
    {live ? <>
      <AppText variant="sectionTitle">待支付 ¥{(order.amountFen / 100).toFixed(2)}</AppText>
      <WechatPaymentQr value={order.codeUrl!} />
      <AppText variant="caption">本订单二维码有效至 {new Date(order.expiresAt).toLocaleTimeString('zh-CN')}。使用另一台设备扫码付款，支付成功后自动同步权益。</AppText>
    </> : null}
    {order?.state === 'pending' && order.channel === 'NATIVE' && !live ? <AppText variant="caption">二维码不可用，请核对订单，确认关闭后可重新下单。</AppText> : null}
    {message ? <AppText accessibilityRole="alert" variant="caption">{message}</AppText> : null}
    <Button disabled={working} variant="outline" onPress={() => { void check(true); }}>{working ? '正在核对…' : '重新检查订单'}</Button>
    {pending.current?.state === 'pending' ? <Button disabled={working} variant="ghost" onPress={() => { void cancel(); }}>取消未支付订单</Button> : null}
    <Button variant="ghost" onPress={() => setShowTerms(true)}>购买须知</Button>
    <BottomSheet visible={showTerms} onClose={() => setShowTerms(false)} accessibilityLabel="购买须知">
      <View style={styles.card}>
        <AppText variant="sectionTitle">购买须知</AppText>
        <AppText>一次购买，到期不自动续费。</AppText>
        <AppText>价格以微信收银台显示为准。有效期内续费将顺延会员时间，不会立即补充 AI 额度；每周额度按原周期恢复。</AppText>
        <AppText>权益归属当前购买账号。若购买结果尚未确认，请先检查订单，避免重复付款。</AppText>
        <AppText>会员到期后保留学习数据；会员题面、参考答案和音频按当前权限开放。退款请通过意见反馈联系处理。</AppText>
        <Button variant="outline" onPress={() => setShowTerms(false)}>关闭</Button>
      </View>
    </BottomSheet>
  </View>;
}

export function WebWechatCheckout() {
  const auth = useAuth();
  const accountId = auth.accountReady ? auth.account?.accountId : undefined;
  const userId = auth.session?.user.id;
  return accountId && userId ? <AccountCheckout key={`${accountId}:${userId}`} userId={userId} /> : null;
}
const styles = StyleSheet.create({
  card: { gap: spacing[4] }, qr: { alignSelf: 'center' }, center: { textAlign: 'center' },
  plans: { flexDirection: 'row', gap: spacing[2] },
  plan: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing[2], paddingHorizontal: spacing[1], paddingVertical: spacing[4], borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  selectedPlan: { backgroundColor: colors.primary08, borderColor: colors.primary }, originalPrice: { textDecorationLine: 'line-through' },
});
