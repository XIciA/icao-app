import type { CommerceEntitlementSummary } from './index';

export type WechatPayParameters = {
  appId: string; partnerId: string; prepayId: string; packageValue: 'Sign=WXPay';
  nonceStr: string; timeStamp: string; sign: string;
};
export type WechatPayChannel = 'APP' | 'NATIVE';
export type WechatCheckoutRequest = { productKey: string; idempotencyKey: string; channel?: WechatPayChannel };
export type WechatCheckoutState = 'pending' | 'paid' | 'closed' | 'refund_pending' | 'refunded';
export type WechatCheckout = {
  id: string; productKey: string; amountFen: number; currency: 'CNY'; state: WechatCheckoutState;
  expiresAt: string; channel?: WechatPayChannel; codeUrl?: string; payment?: WechatPayParameters; entitlement?: CommerceEntitlementSummary;
};
export type WechatPayCatalog = {
  available: boolean;
  products: Array<{ productKey: string; durationDays: number; amountFen: number; title: string; currency: 'CNY' }>;
};
