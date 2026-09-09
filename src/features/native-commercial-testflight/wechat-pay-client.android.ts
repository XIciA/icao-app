import { requireOptionalNativeModule } from 'expo-modules-core';
import type { WechatCheckout, WechatCheckoutRequest, WechatPayCatalog, WechatPayParameters } from '@icao/contracts/wechat-pay';
import { apiRequestWithAccessToken } from '@/platform/api-client';

export type WechatNativePaymentResult = { state: 'returned' | 'cancelled' | 'unknown' };
export type WechatNativePaymentModule = {
  pay(id: string, payment: WechatPayParameters): Promise<WechatNativePaymentResult>;
  cancelPayment(id: string): void | Promise<void>;
};
export function createWechatPaymentBoundary(module: WechatNativePaymentModule | null, timeoutMs = 125_000) {
  return async (checkout: WechatCheckout, signal?: AbortSignal): Promise<WechatNativePaymentResult> => {
    if (!module || typeof module.pay !== 'function' || !checkout.payment) throw new Error('wechat_pay_unavailable');
    if (signal?.aborted) return { state: 'unknown' };
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopWaiting: (() => void) | undefined;
    try {
      return await Promise.race([module.pay(checkout.id, checkout.payment), new Promise<WechatNativePaymentResult>((resolve) => {
        stopWaiting = () => {
          // This clears the SDK waiter only; cancelling a merchant order requires a separate server request.
          try { void Promise.resolve(module.cancelPayment(checkout.id)).catch(() => undefined); } catch { /* Still reconcile the server order. */ }
          resolve({ state: 'unknown' });
        };
        timer = setTimeout(stopWaiting, timeoutMs);
        signal?.addEventListener('abort', stopWaiting, { once: true });
      })]);
    } finally {
      if (timer) clearTimeout(timer);
      if (stopWaiting) signal?.removeEventListener('abort', stopWaiting);
    }
  };
}
export const launchWechatCheckout = createWechatPaymentBoundary(requireOptionalNativeModule<WechatNativePaymentModule>('IcaoWechatAuth'));
// Each multi-step purchase keeps the original token. An account switch cannot replay a payment write as another account.
export const getWechatPayCatalog = (accessToken: string) => apiRequestWithAccessToken<WechatPayCatalog>('/v1/commerce/wechat/catalog', accessToken);
export const createWechatCheckout = (input: WechatCheckoutRequest, accessToken: string) => apiRequestWithAccessToken<WechatCheckout>('/v1/commerce/wechat/checkouts', accessToken, { method: 'POST', body: JSON.stringify(input) });
export const getPendingWechatCheckout = (accessToken: string) => apiRequestWithAccessToken<WechatCheckout | null>('/v1/commerce/wechat/pending', accessToken);
export const getWechatCheckout = (id: string, accessToken: string) => apiRequestWithAccessToken<WechatCheckout>(`/v1/commerce/wechat/checkouts/${encodeURIComponent(id)}`, accessToken);
export const cancelWechatCheckout = (id: string, accessToken: string) => apiRequestWithAccessToken<WechatCheckout>(`/v1/commerce/wechat/checkouts/${encodeURIComponent(id)}/cancel`, accessToken, { method: 'POST' });
