import { createCipheriv, createSign, createVerify, generateKeyPairSync } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WechatMerchantClient } from '../src/commerce/wechat-merchant-client';
import { parseWechatPayConfig, type WechatPayConfig } from '../src/commerce/wechat-pay-config';
const key = () => generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
const merchant = key();
const platform = key();
const config: WechatPayConfig = { appId: 'wx1234567890', merchantId: '1900000001', merchantSerial: 'ABCDEF0123456789',
  apiV3Key: '0123456789abcdef'.repeat(2), privateKey: merchant.privateKey, platformPublicKey: platform.publicKey,
  platformPublicKeyId: 'PUB_KEY_ID_TEST', notifyUrl: 'https://test.invalid/v1/commerce/wechat/notifications' };
const client = new WechatMerchantClient({ wechatPay: config });
function signed(body: string, at = Math.floor(Date.now() / 1000)) {
  const timestamp = String(at); const nonce = 'test-response-nonce';
  return new Headers({ 'wechatpay-timestamp': timestamp, 'wechatpay-nonce': nonce, 'wechatpay-serial': config.platformPublicKeyId,
    'wechatpay-signature': createSign('RSA-SHA256').update(`${timestamp}\n${nonce}\n${body}\n`).sign(platform.privateKey, 'base64') });
}
afterEach(() => vi.unstubAllGlobals());
describe('Wechat APIv3 trust boundary', () => {
  it('does not advertise Native payment from APP credentials alone', () => {
    expect(client.nativeAvailable).toBe(false);
    expect(new WechatMerchantClient({ wechatPay: { ...config, nativeEnabled: true } }).nativeAvailable).toBe(true);
    expect(() => parseWechatPayConfig({ WECHAT_PAY_NATIVE_ENABLED: 'true' }, config.appId)).toThrow('invalid_wechat_pay_native_enabled');
    expect(() => parseWechatPayConfig({ WECHAT_PAY_NATIVE_ENABLED: '1' }, config.appId)).toThrow('incomplete_wechat_pay_configuration');
  });
  it('does not create payment capability from a login AppSecret or incomplete configuration', () => {
    expect(parseWechatPayConfig({ WECHAT_APP_SECRET: 'login-only' }, config.appId)).toBeUndefined();
    expect(() => parseWechatPayConfig({ WECHAT_PAY_MCH_ID: config.merchantId }, config.appId)).toThrow('incomplete_wechat_pay_configuration');
    expect(() => new WechatMerchantClient({}).config()).toThrow('wechat_pay_unavailable');
  });
  it('normalizes env-file escaped PEM newlines before validating and using both keys', () => {
    const parsed = parseWechatPayConfig({
      WECHAT_PAY_MCH_ID: config.merchantId,
      WECHAT_PAY_API_V3_KEY: config.apiV3Key,
      WECHAT_PAY_MERCHANT_SERIAL_NO: config.merchantSerial,
      WECHAT_PAY_MERCHANT_PRIVATE_KEY: config.privateKey.replaceAll('\n', '\\n'),
      WECHAT_PAY_PLATFORM_PUBLIC_KEY: config.platformPublicKey.replaceAll('\n', '\\n'),
      WECHAT_PAY_PLATFORM_PUBLIC_KEY_ID: config.platformPublicKeyId,
      WECHAT_PAY_NOTIFY_URL: config.notifyUrl,
    }, config.appId)!;
    expect(parsed.privateKey.trim()).toBe(config.privateKey.trim());
    expect(parsed.platformPublicKey.trim()).toBe(config.platformPublicKey.trim());
    const configured = new WechatMerchantClient({ wechatPay: parsed });
    expect(() => configured.paymentParameters('prepay-test')).not.toThrow();
    expect(() => configured.verify('{}', signed('{}'))).not.toThrow();
  });
  it('signs the exact APP payload with the merchant RSA key', () => {
    const parameters = client.paymentParameters('prepay-test');
    expect(parameters.packageValue).toBe('Sign=WXPay');
    expect(createVerify('RSA-SHA256').update(`${parameters.appId}\n${parameters.timeStamp}\n${parameters.nonceStr}\n${parameters.prepayId}\n`)
      .verify(merchant.publicKey, parameters.sign, 'base64')).toBe(true);
  });
  it('rejects forged bodies, missing signatures, wrong keys and expired responses', () => {
    const raw = '{"prepay_id":"test"}';
    expect(() => client.verify(raw, signed(raw))).not.toThrow();
    expect(() => client.verify('changed', signed(raw))).toThrow('invalid_wechat_pay_signature');
    expect(() => client.verify(raw, new Headers())).toThrow('invalid_wechat_pay_signature');
    expect(() => client.verify(raw, signed(raw, Math.floor(Date.now() / 1000) - 301))).toThrow('invalid_wechat_pay_signature');
    const wrong = signed(raw); wrong.set('wechatpay-serial', 'another-key');
    expect(() => client.verify(raw, wrong)).toThrow('invalid_wechat_pay_signature');
  });
  it('authenticates raw callback bytes before AES-GCM decryption, with authentication-tag validation', () => {
    const nonce = '123456789012'; const associated = 'transaction'; const plain = '{"out_trade_no":"test"}';
    const cipher = createCipheriv('aes-256-gcm', Buffer.from(config.apiV3Key), Buffer.from(nonce));
    cipher.setAAD(Buffer.from(associated));
    const ciphertext = Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()]).toString('base64');
    const envelope = { event_type: 'TRANSACTION.SUCCESS', resource: { algorithm: 'AEAD_AES_256_GCM', nonce, associated_data: associated, ciphertext } };
    const raw = JSON.stringify(envelope);
    expect(client.notification(Buffer.from(raw), signed(raw))).toEqual({ eventType: 'TRANSACTION.SUCCESS', resource: { out_trade_no: 'test' } });
    envelope.resource.associated_data = 'tampered';
    const changed = JSON.stringify(envelope);
    expect(() => client.notification(Buffer.from(changed), signed(changed))).toThrow('invalid_wechat_pay_notification');
  });
  it('signs the HTTP method, path including query, and exact body; accepts only verified responses', async () => {
    const response = '{"prepay_id":"prepay-test"}';
    const request = vi.fn(async (url: string, options: RequestInit) => {
      expect(url).toBe('https://api.mch.weixin.qq.com/v3/pay/transactions/app');
      const headers = options.headers as Record<string, string>;
      const fields = Object.fromEntries([...headers.Authorization!.matchAll(/(\w+)="([^"]+)"/gu)].map((match) => [match[1], match[2]]));
      expect(createVerify('RSA-SHA256').update(`POST\n/v3/pay/transactions/app\n${fields.timestamp}\n${fields.nonce_str}\n${options.body}\n`)
        .verify(merchant.publicKey, fields.signature!, 'base64')).toBe(true);
      return new Response(response, { headers: signed(response) });
    });
    vi.stubGlobal('fetch', request);
    await expect(client.request('POST', '/v3/pay/transactions/app', { amount: { total: 6800 } })).resolves.toEqual({ prepay_id: 'prepay-test' });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(response)));
    await expect(client.request('POST', '/v3/pay/transactions/app', {})).rejects.toThrow('invalid_wechat_pay_signature');
  });
  it('accepts an authenticated callback with omitted optional associated_data', () => {
    const nonce = '123456789012';
    const cipher = createCipheriv('aes-256-gcm', Buffer.from(config.apiV3Key), Buffer.from(nonce));
    const ciphertext = Buffer.concat([cipher.update('{"out_trade_no":"test"}'), cipher.final(), cipher.getAuthTag()]).toString('base64');
    const raw = JSON.stringify({ event_type: 'REFUND.SUCCESS', resource: { algorithm: 'AEAD_AES_256_GCM', nonce, ciphertext } });
    expect(client.notification(Buffer.from(raw), signed(raw))).toEqual({ eventType: 'REFUND.SUCCESS', resource: { out_trade_no: 'test' } });
  });
});
