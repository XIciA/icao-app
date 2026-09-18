import type { WechatCheckout } from '@icao/contracts/wechat-pay';
import { createWechatPaymentBoundary, createWechatCheckout } from '../wechat-pay-client.android';
import { apiRequestWithAccessToken } from '@/platform/api-client';
jest.mock('expo-modules-core', () => ({ requireOptionalNativeModule: () => null }));
jest.mock('@/platform/api-client', () => ({ apiRequestWithAccessToken: jest.fn() }));
const checkout: WechatCheckout = { id: '80000000-0000-4000-8000-000000000001', productKey: 'membership_7d_v1', amountFen: 6800,
  currency: 'CNY', state: 'pending', expiresAt: '2030-01-01T00:00:00Z', payment: { appId: 'wx-test', partnerId: '123456', prepayId: 'prepay',
    packageValue: 'Sign=WXPay', nonceStr: 'nonce', timeStamp: '1', sign: 'test-signature' } };
afterEach(() => { jest.useRealTimers(); jest.clearAllMocks(); });
it('uses the SDK callback only as a return signal, never as verified entitlement', async () => {
  const pay = jest.fn(async () => ({ state: 'returned' as const }));
  const result = await createWechatPaymentBoundary({ pay, cancelPayment: jest.fn() })(checkout);
  expect(result).toEqual({ state: 'returned' });
  expect(pay).toHaveBeenCalledWith(checkout.id, checkout.payment);
});
it('settles a stuck SDK flow as unknown, leaving the server order available for reconciliation', async () => {
  jest.useFakeTimers();
  const cancelPayment = jest.fn();
  const operation = createWechatPaymentBoundary({ pay: () => new Promise(() => undefined), cancelPayment }, 100)(checkout);
  jest.advanceTimersByTime(101);
  await expect(operation).resolves.toEqual({ state: 'unknown' });
  expect(cancelPayment).toHaveBeenCalledTimes(1);
  expect(cancelPayment).toHaveBeenCalledWith(checkout.id);
});
it('does not fall back to a fake payment when the native module is unavailable', async () => {
  await expect(createWechatPaymentBoundary(null)(checkout)).rejects.toThrow('wechat_pay_unavailable');
});
it('stops waiting after foreground or account cancellation without claiming the merchant order was cancelled', async () => {
  const controller = new AbortController();
  const cancelPayment = jest.fn();
  const operation = createWechatPaymentBoundary({ pay: () => new Promise(() => undefined), cancelPayment })(checkout, controller.signal);
  controller.abort();
  await expect(operation).resolves.toEqual({ state: 'unknown' });
  expect(cancelPayment).toHaveBeenCalledWith(checkout.id);
});
it('keeps the original account token fixed for checkout creation', async () => {
  const input = { productKey: checkout.productKey, idempotencyKey: checkout.id };
  await createWechatCheckout(input, 'original-account-token');
  expect(apiRequestWithAccessToken).toHaveBeenCalledWith('/v1/commerce/wechat/checkouts', 'original-account-token', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
  });
});
