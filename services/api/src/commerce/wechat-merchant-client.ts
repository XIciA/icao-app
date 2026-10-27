import { createDecipheriv, createSign, createVerify, randomBytes } from 'node:crypto';
import { Inject, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import type { WechatPayParameters } from '@icao/contracts/wechat-pay';
import { API_CONFIG, type ApiConfig } from '../config';
import type { WechatPayConfig } from './wechat-pay-config';

const ORIGIN = 'https://api.mch.weixin.qq.com';
type HeadersLike = { get(name: string): string | null };
export class WechatMerchantError extends ServiceUnavailableException {
  constructor(readonly providerCode: string, readonly providerStatus: number) { super('wechat_pay_request_failed'); }
}

/** APIv3 request/response authentication. Never trust SDK success or unverified notification JSON. */
@Injectable()
export class WechatMerchantClient {
  constructor(@Inject(API_CONFIG) private readonly runtime: Pick<ApiConfig, 'wechatPay'>) {}
  get available() { return Boolean(this.runtime.wechatPay); }
  get nativeAvailable() { return this.available && this.runtime.wechatPay?.nativeEnabled === true; }
  config(): WechatPayConfig {
    if (!this.runtime.wechatPay) throw new ServiceUnavailableException('wechat_pay_unavailable');
    return this.runtime.wechatPay;
  }
  private signature(message: string) {
    return createSign('RSA-SHA256').update(message).sign(this.config().privateKey, 'base64');
  }
  paymentParameters(prepayId: string, at = new Date()): WechatPayParameters {
    const config = this.config();
    const nonceStr = randomBytes(16).toString('hex');
    const timeStamp = String(Math.floor(at.getTime() / 1000));
    return { appId: config.appId, partnerId: config.merchantId, prepayId, packageValue: 'Sign=WXPay', nonceStr, timeStamp,
      sign: this.signature(`${config.appId}\n${timeStamp}\n${nonceStr}\n${prepayId}\n`) };
  }
  verify(body: string, headers: HeadersLike, at = new Date()) {
    const config = this.config();
    const timestamp = headers.get('wechatpay-timestamp');
    const nonce = headers.get('wechatpay-nonce');
    const signature = headers.get('wechatpay-signature');
    if (!timestamp || !/^\d{10}$/u.test(timestamp) || Math.abs(at.getTime() / 1000 - Number(timestamp)) > 300
      || !nonce || nonce.length > 128 || !signature || signature.length > 1024
      || headers.get('wechatpay-serial') !== config.platformPublicKeyId
      || !createVerify('RSA-SHA256').update(`${timestamp}\n${nonce}\n${body}\n`).verify(config.platformPublicKey, signature, 'base64')) {
      throw new UnauthorizedException('invalid_wechat_pay_signature');
    }
  }
  async request(method: 'GET' | 'POST', path: string, input?: object): Promise<unknown> {
    const config = this.config();
    if (!path.startsWith('/v3/') || path.includes('\n') || path.includes('\r')) throw new Error('invalid_wechat_pay_path');
    const body = input ? JSON.stringify(input) : '';
    const timestamp = String(Math.floor(Date.now() / 1000));
    const nonce = randomBytes(16).toString('hex');
    const signature = this.signature(`${method}\n${path}\n${timestamp}\n${nonce}\n${body}\n`);
    let response: Response;
    try {
      response = await fetch(`${ORIGIN}${path}`, { method, redirect: 'error', signal: AbortSignal.timeout(15_000),
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'Wechatpay-Serial': config.platformPublicKeyId,
          Authorization: `WECHATPAY2-SHA256-RSA2048 mchid="${config.merchantId}",nonce_str="${nonce}",timestamp="${timestamp}",serial_no="${config.merchantSerial}",signature="${signature}"` },
        ...(method === 'POST' ? { body } : {}),
      });
    } catch { throw new ServiceUnavailableException('wechat_pay_request_uncertain'); }
    const text = await response.text();
    if (text.length > 1_048_576) throw new ServiceUnavailableException('wechat_pay_invalid_response');
    this.verify(text, response.headers);
    let parsed: unknown;
    try { parsed = text ? JSON.parse(text) : {}; } catch { throw new ServiceUnavailableException('wechat_pay_invalid_response'); }
    if (!response.ok) {
      const raw = (parsed as { code?: unknown })?.code;
      const code = typeof raw === 'string' && /^[A-Z0-9_]{1,64}$/u.test(raw) ? raw : 'UNKNOWN';
      throw new WechatMerchantError(code, response.status);
    }
    return parsed;
  }
  notification(raw: Buffer, headers: HeadersLike): { eventType: string; resource: unknown } {
    if (raw.length > 1_048_576) throw new UnauthorizedException('invalid_wechat_pay_notification');
    const body = raw.toString('utf8');
    this.verify(body, headers);
    try {
      const envelope = JSON.parse(body) as { event_type?: unknown; resource?: { algorithm?: unknown; ciphertext?: unknown; nonce?: unknown; associated_data?: unknown } };
      const resource = envelope.resource;
      if (!resource || resource.algorithm !== 'AEAD_AES_256_GCM' || typeof envelope.event_type !== 'string'
        || typeof resource.ciphertext !== 'string' || typeof resource.nonce !== 'string'
        || (resource.associated_data !== undefined && typeof resource.associated_data !== 'string')) throw new Error();
      const encrypted = Buffer.from(resource.ciphertext, 'base64');
      if (encrypted.length < 17) throw new Error();
      const decipher = createDecipheriv('aes-256-gcm', Buffer.from(this.config().apiV3Key, 'utf8'), Buffer.from(resource.nonce));
      decipher.setAAD(Buffer.from(resource.associated_data ?? ''));
      decipher.setAuthTag(encrypted.subarray(-16));
      const plain = Buffer.concat([decipher.update(encrypted.subarray(0, -16)), decipher.final()]);
      return { eventType: envelope.event_type, resource: JSON.parse(plain.toString('utf8')) as unknown };
    } catch { throw new UnauthorizedException('invalid_wechat_pay_notification'); }
  }
}
