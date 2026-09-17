import type { PropsWithChildren } from 'react';
import { useContext } from 'react';
import { isEdgeOneProductionWeb } from '@/config/web-runtime';
import { CommerceRuntimeContext } from './commerce-runtime-context.native';
import { WebEntitlementProvider } from './WebEntitlementProvider';
import type { CommerceRuntimeValue } from './commerce-runtime-types';

const unavailable: CommerceRuntimeValue = {
  supported: false, phase: 'unavailable', offerings: [],
  async purchase() { return { ok: false, message: '请在 APP 中购买会员。' }; },
  async restorePurchases() { return { ok: false, message: '请在 APP 中恢复购买。' }; },
  async refresh() {},
};

export function CommerceRuntimeProvider({ children }: PropsWithChildren) {
  return isEdgeOneProductionWeb()
    ? <WebEntitlementProvider>{children}</WebEntitlementProvider>
    : children;
}

export function useCommerceRuntime() {
  const value = useContext(CommerceRuntimeContext);
  return isEdgeOneProductionWeb() ? value ?? unavailable : unavailable;
}
