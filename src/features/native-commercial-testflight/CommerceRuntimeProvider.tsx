import type { PropsWithChildren } from 'react';

import type { CommerceRuntimeValue } from './commerce-runtime-types';

const UNAVAILABLE: CommerceRuntimeValue = {
  supported: false,
  phase: 'unavailable',
  offerings: [],
  async purchase() {
    const userMessage = '当前平台暂不支持 App Store 购买。';
    return {
      ok: false,
      message: userMessage,
      error: {
        code: 'not-supported',
        operation: 'purchase',
        userMessage,
        retryable: false,
        chargeStatus: 'not-applicable',
      },
    };
  },
  async refresh() {},
  async restorePurchases() {
    const userMessage = '当前平台暂不支持恢复购买。';
    return {
      ok: false,
      message: userMessage,
      error: {
        code: 'not-supported',
        operation: 'restore',
        userMessage,
        retryable: false,
        chargeStatus: 'not-applicable',
      },
    };
  },
};

export function CommerceRuntimeProvider({ children }: PropsWithChildren) {
  return children;
}

export function useCommerceRuntime() {
  return UNAVAILABLE;
}
