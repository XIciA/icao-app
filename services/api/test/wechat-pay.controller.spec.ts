import { describe, expect, it, vi } from 'vitest';
import { COMMERCE_ENVIRONMENT_HEADER } from '@icao/contracts';
import { WechatPayController, WechatPayNotificationController } from '../src/commerce/wechat-pay.controller';
describe('WeChat payment routes', () => {
  it('accepts only explicit supported payment channels and never client QR/payment URLs', async () => {
    const catalog = vi.fn(); const create = vi.fn(async () => ({})); const controller = new WechatPayController({ catalog, create } as never);
    const request = { id: 'r', user: { id: 'account-a' }, headers: {} };
    controller.catalog(request as never, 'NATIVE'); expect(catalog).toHaveBeenCalledWith('NATIVE');
    expect(() => controller.catalog(request as never, 'H5')).toThrow('invalid_wechat_channel');
    const input = { productKey: 'membership_7d_v1', idempotencyKey: '80000000-0000-4000-8000-000000000001', channel: 'NATIVE' };
    await controller.create(request as never, input); expect(create).toHaveBeenCalledWith('account-a', input);
    await expect(controller.create(request as never, { ...input, codeUrl: 'weixin://bad' })).rejects.toThrow('invalid_wechat_checkout');
  });
  it('never routes a claimed sandbox order into real merchant payment', async () => {
    const create = vi.fn(); const controller = new WechatPayController({ create } as never);
    await expect(controller.create({ headers: { [COMMERCE_ENVIRONMENT_HEADER]: 'sandbox' } } as never, {})).rejects.toThrow('wechat_pay_environment_unsupported');
    expect(create).not.toHaveBeenCalled();
  });
  it('derives the order owner from authenticated context and rejects client prices', async () => {
    const create = vi.fn(async () => ({})); const controller = new WechatPayController({ create } as never);
    const request = { id: 'r', user: { id: 'account-a' }, headers: {} };
    const input = { productKey: 'membership_7d_v1', idempotencyKey: '80000000-0000-4000-8000-000000000001' };
    await controller.create(request as never, input);
    expect(create).toHaveBeenCalledExactlyOnceWith('account-a', input);
    await expect(controller.create(request as never, { ...input, amount: 1 })).rejects.toThrow('invalid_wechat_checkout');
  });
  it('requires original callback bytes, never reserialized request JSON', async () => {
    const notification = vi.fn(); const controller = new WechatPayNotificationController({ notification } as never);
    await expect(controller.receive({ body: {} } as never)).rejects.toThrow('wechat_notification_raw_body_required');
    expect(notification).not.toHaveBeenCalled();
  });
});
