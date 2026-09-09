import { useCallback, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';
import * as Crypto from 'expo-crypto';
import type { CommerceEntitlementsResponse } from '@icao/contracts';
import type { WechatCheckout } from '@icao/contracts/wechat-pay';
import { useAuth } from '@/features/auth/AuthProvider';
import { activateQuestionBankContentAccount } from '@/features/question-bank/data/member-content-cache';
import { apiRequestWithAccessToken } from '@/platform/api-client';
import { CommerceRuntimeContext } from './commerce-runtime-context.native';
import type { CommerceActionResult, CommerceEntitlementChange, CommerceEntitlementChangeReason, CommerceRuntimeOffering, CommerceRuntimePhase, CommerceRuntimeValue } from './commerce-runtime-types';
import { beginCommerceEntitlementGeneration, clearCommerceEntitlementGeneration, publishCommerceEntitlementChange } from './commerce-entitlement-events';
import { activateNativeCommerceEnvironment, deactivateNativeCommerceEnvironment } from './commerce-environment';
import { scheduleMembershipExpiry } from './membership-expiry.native';
import { cancelWechatCheckout, createWechatCheckout, getPendingWechatCheckout, getWechatCheckout, getWechatPayCatalog, launchWechatCheckout } from './wechat-pay-client.android';
import { listMembershipProducts } from './membership-products.native';

type Owner = { id: string; generation: number };
const changed = { ok: false, message: '账号已变化，请重新查看购买状态。' } as const;
export function AndroidCommerceRuntimeProvider({ children }: PropsWithChildren) {
  const auth = useAuth();
  const accountId = auth.accountReady ? auth.account?.accountId : undefined;
  const tokenRef = useRef(auth.session?.accessToken); tokenRef.current = auth.session?.accessToken;
  const accountRef = useRef(accountId); accountRef.current = accountId;
  const ownerRef = useRef<Owner | undefined>(undefined);
  const busy = useRef<Owner | undefined>(undefined);
  const paymentWaiter = useRef<{ owner: Owner; controller: AbortController } | undefined>(undefined);
  const pending = useRef<WechatCheckout | undefined>(undefined);
  const retryKey = useRef<{ productKey: string; id: string } | undefined>(undefined);
  const available = useRef(false);
  const uncertain = useRef(false);
  const [phase, setPhase] = useState<CommerceRuntimePhase>('unavailable');
  const [offerings, setOfferings] = useState<readonly CommerceRuntimeOffering[]>([]);
  const [change, setChange] = useState<CommerceEntitlementChange>();
  const [message, setMessage] = useState<string>();
  const [canCancel, setCanCancel] = useState(false);
  const valid = useCallback((owner: Owner) => ownerRef.current === owner && accountRef.current === owner.id, []);
  const publish = useCallback((owner: Owner, snapshot: CommerceRuntimeValue['entitlement'], reason: CommerceEntitlementChangeReason) => {
    if (!valid(owner)) return;
    setChange(publishCommerceEntitlementChange({ accountId: owner.id, generation: owner.generation, environment: 'production', snapshot, reason }));
  }, [valid]);
  const applyCheckout = useCallback((owner: Owner, checkout: WechatCheckout | null) => {
    if (!valid(owner)) return;
    uncertain.current = false;
    pending.current = checkout && ['pending', 'refund_pending'].includes(checkout.state) ? checkout : undefined;
    setCanCancel(checkout?.state === 'pending');
    if (checkout?.entitlement) publish(owner, checkout.entitlement, 'transaction-verification');
    if (checkout?.state === 'paid') { retryKey.current = undefined; setMessage('购买成功，会员权益已更新。'); }
    else if (checkout?.state === 'closed') { retryKey.current = undefined; setMessage('已取消未支付订单。'); }
    else if (checkout?.state === 'refunded') { retryKey.current = undefined; setMessage('订单已退款，权益已更新。'); }
    else if (checkout) setMessage('正在核对购买状态，请勿重复付款。');
    setPhase(pending.current ? 'pending' : available.current ? 'ready' : 'unavailable');
  }, [publish, valid]);
  const reconcile = useCallback(async (owner: Owner, token: string, reason: CommerceEntitlementChangeReason) => {
    const checkout = pending.current ?? await getPendingWechatCheckout(token);
    if (!valid(owner)) return;
    const current = checkout ? await getWechatCheckout(checkout.id, token) : null;
    if (!valid(owner)) return;
    const entitlement = await apiRequestWithAccessToken<CommerceEntitlementsResponse>('/v1/commerce/entitlements/current', token);
    if (!valid(owner)) return;
    publish(owner, entitlement.production, reason);
    applyCheckout(owner, current);
  }, [applyCheckout, publish, valid]);
  const refresh = useCallback(async () => {
    const owner = ownerRef.current; const token = tokenRef.current;
    if (!owner || !token || busy.current) return;
    busy.current = owner; setPhase('reconciling');
    try {
      const catalog = await getWechatPayCatalog(token);
      if (!valid(owner)) return;
      available.current = catalog.available;
      const known = listMembershipProducts();
      const mapped = catalog.products.map((product) => {
        const local = known.find((entry) => entry.key === product.productKey && entry.durationDays === product.durationDays);
        if (!local || product.currency !== 'CNY' || !Number.isSafeInteger(product.amountFen) || product.amountFen <= 0) throw new Error('invalid_commerce_catalog');
        return { productKey: local.key, displayName: product.title, durationDays: local.durationDays, recommended: local.recommended,
          localizedPrice: `¥${(product.amountFen / 100).toFixed(2).replace(/\.00$/u, '')}`, currencyCode: 'CNY' };
      });
      if (catalog.available && (mapped.length !== known.length || new Set(mapped.map((entry) => entry.productKey)).size !== known.length)) throw new Error('invalid_commerce_catalog');
      setOfferings(mapped);
      await reconcile(owner, token, 'manual-refresh');
      if (valid(owner) && !catalog.available) { setPhase('unavailable'); setMessage('微信支付暂不可用，请稍后重试。'); }
    } catch { if (valid(owner)) { setPhase(pending.current ? 'pending' : 'error'); setMessage('暂时无法核对购买状态，请检查网络后重试。'); } }
    finally { if (busy.current === owner) busy.current = undefined; }
  }, [reconcile, valid]);

  useEffect(() => {
    uncertain.current = false; pending.current = undefined; retryKey.current = undefined; busy.current = undefined; available.current = false;
    setOfferings([]); setCanCancel(false); setMessage(undefined); setChange(undefined); setPhase(accountId ? 'loading' : 'unavailable');
    void activateQuestionBankContentAccount(accountId).catch(() => undefined);
    if (!accountId) { ownerRef.current = undefined; deactivateNativeCommerceEnvironment(); clearCommerceEntitlementGeneration(); return; }
    const initial = beginCommerceEntitlementGeneration(accountId, 'production', 'account-change');
    const owner = { id: accountId, generation: initial.generation }; ownerRef.current = owner; setChange(initial);
    void activateNativeCommerceEnvironment(accountId, 'production').then(() => { if (valid(owner)) return refresh(); }).catch(() => {
      if (valid(owner)) { setPhase('error'); setMessage('购买服务暂不可用，请稍后重试。'); }
    });
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || !valid(owner)) return;
      // Returning from WeChat starts server verification even if its native callback was lost.
      if (paymentWaiter.current?.owner === owner) paymentWaiter.current.controller.abort();
      else void refresh();
    });
    const interval = setInterval(() => { if (valid(owner) && (pending.current || uncertain.current) && AppState.currentState === 'active') void refresh(); }, 15_000);
    return () => { subscription.remove(); clearInterval(interval); if (ownerRef.current === owner) {
      if (paymentWaiter.current?.owner === owner) { paymentWaiter.current.controller.abort(); paymentWaiter.current = undefined; }
      ownerRef.current = undefined; deactivateNativeCommerceEnvironment(owner.id); clearCommerceEntitlementGeneration();
    } };
  }, [accountId, refresh, valid]);
  useEffect(() => {
    const owner = ownerRef.current;
    if (!owner || !change?.snapshot) return;
    return scheduleMembershipExpiry(change.snapshot, () => publish(owner, { ...change.snapshot!, membership: { ...change.snapshot!.membership, active: false } }, 'membership-expired'));
  }, [change, publish]);

  const purchase = useCallback(async (productKey: CommerceRuntimeOffering['productKey']): Promise<CommerceActionResult> => {
    const owner = ownerRef.current; const token = tokenRef.current;
    if (!owner || !token || !valid(owner)) return changed;
    if (busy.current || pending.current || !available.current) return { ok: false, message: '请先完成当前订单状态核对。' };
    busy.current = owner; setPhase('purchasing'); setMessage(undefined);
    try {
      // Recover a server-persisted uncertain creation before assigning a new purchase intent.
      const previous = await getPendingWechatCheckout(token);
      if (!valid(owner)) return changed;
      if (previous) { applyCheckout(owner, await getWechatCheckout(previous.id, token)); return { ok: false, message: '已有订单等待确认，请先核对或取消。' }; }
      if (retryKey.current?.productKey !== productKey) retryKey.current = { productKey, id: Crypto.randomUUID() };
      const checkout = await createWechatCheckout({ productKey, idempotencyKey: retryKey.current.id }, token);
      if (!valid(owner)) return changed;
      pending.current = checkout;
      if (checkout.state === 'pending' && checkout.payment) {
        const waiter = { owner, controller: new AbortController() }; paymentWaiter.current = waiter;
        try { await launchWechatCheckout(checkout, waiter.controller.signal); } catch { /* A launch error is not proof that no payment occurred. */ }
        finally { if (paymentWaiter.current === waiter) paymentWaiter.current = undefined; }
      }
      if (!valid(owner)) return changed;
      const verified = await getWechatCheckout(checkout.id, token);
      if (!valid(owner)) return changed;
      applyCheckout(owner, verified);
      return { ok: verified.state === 'paid', message: verified.state === 'paid' ? '购买成功，会员权益已更新。' : '购买结果正在核对，请勿重复付款。' };
    } catch { if (!valid(owner)) return changed;
      uncertain.current = true; setPhase('pending'); setCanCancel(Boolean(pending.current)); setMessage('购买状态暂未确认，稍后会自动核对，请勿重复付款。');
      return { ok: false, message: '购买状态暂未确认，请稍后重新检查。' };
    } finally { if (busy.current === owner) busy.current = undefined; }
  }, [applyCheckout, valid]);
  const cancelPendingPurchase = useCallback(async (): Promise<CommerceActionResult> => {
    const owner = ownerRef.current; const token = tokenRef.current; const checkout = pending.current;
    if (!owner || !token || !checkout || busy.current) return { ok: false, message: '请稍后重试。' };
    busy.current = owner; setPhase('reconciling');
    try {
      const result = await cancelWechatCheckout(checkout.id, token);
      if (!valid(owner)) return changed;
      applyCheckout(owner, result);
      return { ok: result.state === 'closed' || result.state === 'paid', message: result.state === 'paid' ? '订单已支付，权益已更新。' : '未支付订单已取消。' };
    } catch { if (valid(owner)) { setPhase('pending'); setMessage('订单状态尚未确认，请稍后重试。'); } return { ok: false, message: '订单状态尚未确认。' }; }
    finally { if (busy.current === owner) busy.current = undefined; }
  }, [applyCheckout, valid]);
  const activeChange = change?.accountId === accountId ? change : undefined;
  const value = useMemo<CommerceRuntimeValue>(() => ({ supported: Boolean(accountId), phase, offerings, message,
    entitlement: activeChange?.snapshot, entitlementEnvironment: 'production', entitlementChange: activeChange, purchase, refresh,
    canCancelPendingPurchase: canCancel, cancelPendingPurchase,
    restorePurchases: async () => ({ ok: false, message: '请使用重新检查核对会员权益。' }),
  }), [accountId, activeChange, canCancel, cancelPendingPurchase, message, offerings, phase, purchase, refresh]);
  return <CommerceRuntimeContext.Provider value={value}>{children}</CommerceRuntimeContext.Provider>;
}
