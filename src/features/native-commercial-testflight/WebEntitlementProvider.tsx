import type { CommerceEntitlementsResponse } from '@icao/contracts';
import { useCallback, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '@/features/auth/AuthProvider';
import { activateQuestionBankContentAccount } from '@/features/question-bank/data/member-content-cache';
import { apiRequest } from '@/platform/api-client';
import { CommerceRuntimeContext } from './commerce-runtime-context.native';
import { activateNativeCommerceEnvironment, deactivateNativeCommerceEnvironment } from './commerce-environment.native';
import { beginCommerceEntitlementGeneration, clearCommerceEntitlementGeneration, publishCommerceEntitlementChange } from './commerce-entitlement-events';
import { scheduleMembershipExpiry } from './membership-expiry.native';
import type { CommerceEntitlementChange, CommerceRuntimePhase, CommerceRuntimeValue } from './commerce-runtime-types';

type Owner = { id: string; generation: number; ready: boolean };

/** The browser only reads the shared ledger. It never starts a payment. */
export function WebEntitlementProvider({ children }: PropsWithChildren) {
  const auth = useAuth();
  const accountId = auth.accountReady ? auth.account?.accountId : undefined;
  const currentAccount = useRef(accountId); currentAccount.current = accountId;
  const token = useRef(auth.session?.accessToken); token.current = auth.session?.accessToken;
  const ownerRef = useRef<Owner | undefined>(undefined);
  const busy = useRef<Owner | undefined>(undefined);
  const [change, setChange] = useState<CommerceEntitlementChange>();
  const [phase, setPhase] = useState<CommerceRuntimePhase>('unavailable');
  const [message, setMessage] = useState<string>();
  const valid = useCallback((owner: Owner) => ownerRef.current === owner && currentAccount.current === owner.id, []);
  const refresh = useCallback(async () => {
    const owner = ownerRef.current;
    const accessToken = token.current;
    if (!owner?.ready || !accessToken || busy.current === owner || !valid(owner)) return;
    busy.current = owner;
    setPhase('reconciling');
    try {
      // The shared client refreshes expired sessions; owner validation below
      // rejects any response that outlives the account which requested it.
      const response = await apiRequest<CommerceEntitlementsResponse>('/v1/commerce/entitlements/current');
      if (!valid(owner)) return;
      setChange(publishCommerceEntitlementChange({ accountId: owner.id, generation: owner.generation,
        environment: 'production', snapshot: response.production, reason: 'manual-refresh' }));
      setMessage(undefined); setPhase('ready');
    } catch {
      if (valid(owner)) { setPhase('error'); setMessage('暂时无法同步会员权益，请检查网络后重新同步。'); }
    } finally { if (busy.current === owner) busy.current = undefined; }
  }, [valid]);

  useEffect(() => {
    setChange(undefined); setMessage(undefined); setPhase(accountId ? 'loading' : 'unavailable');
    if (!accountId) { ownerRef.current = undefined; deactivateNativeCommerceEnvironment(); clearCommerceEntitlementGeneration();
      void activateQuestionBankContentAccount(undefined).catch(() => undefined); return; }
    const initial = beginCommerceEntitlementGeneration(accountId, 'production');
    const owner: Owner = { id: accountId, generation: initial.generation, ready: false };
    ownerRef.current = owner; setChange(initial);
    void Promise.all([activateQuestionBankContentAccount(accountId), activateNativeCommerceEnvironment(accountId, 'production')])
      .then(() => { if (valid(owner)) { owner.ready = true; return refresh(); } })
      .catch(() => { if (valid(owner)) { setPhase('error'); setMessage('会员状态准备失败，请刷新页面重试。'); } });
    const foreground = AppState.addEventListener('change', (state) => { if (state === 'active') void refresh(); });
    const interval = setInterval(() => { if (typeof document === 'undefined' || document.visibilityState === 'visible') void refresh(); }, 60_000);
    const online = () => { void refresh(); };
    if (typeof window !== 'undefined') window.addEventListener('online', online);
    return () => {
      foreground.remove(); clearInterval(interval);
      if (typeof window !== 'undefined') window.removeEventListener('online', online);
      if (ownerRef.current === owner) { ownerRef.current = undefined; deactivateNativeCommerceEnvironment(owner.id); clearCommerceEntitlementGeneration(); }
    };
  }, [accountId, refresh, valid]);

  useEffect(() => {
    const owner = ownerRef.current;
    if (!owner || change?.accountId !== owner.id || !change.snapshot) return;
    const snapshot = change.snapshot;
    return scheduleMembershipExpiry(snapshot, () => {
      if (!valid(owner)) return;
      setChange(publishCommerceEntitlementChange({ accountId: owner.id, generation: owner.generation,
        environment: 'production', snapshot: { ...snapshot, membership: { ...snapshot.membership, active: false } }, reason: 'membership-expired' }));
      void refresh();
    });
  }, [change, refresh, valid]);
  const current = change?.accountId === accountId ? change : undefined;
  const value = useMemo<CommerceRuntimeValue>(() => ({ supported: false, offerings: [], phase, message,
    entitlement: current?.snapshot, entitlementEnvironment: 'production', entitlementChange: current, refresh,
    async purchase() { return { ok: false, message: '请在 APP 中购买，当前账号的权益会同步到网页。' }; },
    async restorePurchases() { return { ok: false, message: '请在购买时使用的 APP 中恢复购买，再返回网页同步。' }; },
  }), [current, message, phase, refresh]);
  return <CommerceRuntimeContext.Provider value={value}>{children}</CommerceRuntimeContext.Provider>;
}
