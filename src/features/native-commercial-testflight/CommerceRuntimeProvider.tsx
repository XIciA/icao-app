import type { PropsWithChildren } from 'react';

import type { CommerceRuntimeValue } from './commerce-runtime-types';

const UNAVAILABLE: CommerceRuntimeValue = {
  supported: false,
  phase: 'unavailable',
  offerings: [],
  async purchase() {
    return { ok: false, message: '当前平台暂不支持 App Store 购买。' };
  },
  async refresh() {},
  async restorePurchases() {
    return { ok: false, message: '当前平台暂不支持恢复购买。' };
  },
};

export function CommerceRuntimeProvider({ children }: PropsWithChildren) {
  return children;
}

export function useCommerceRuntime() {
  return UNAVAILABLE;
}
