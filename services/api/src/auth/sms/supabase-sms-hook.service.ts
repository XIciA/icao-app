import { createHmac } from 'node:crypto';

import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { normalizeChinaMobile } from '@icao/contracts';
import { Webhook } from 'standardwebhooks';
import { z } from 'zod';

import { API_CONFIG, type ApiConfig, DISABLED_SMS_CONFIG } from '../../config';
import { AliyunSmsProvider } from './aliyun-sms.provider';
import { SmsDeliveryAuthority } from './sms-delivery-authority';

const payloadSchema = z.object({
  user: z.object({ phone: z.string().nullish() }).passthrough().nullish(),
  sms: z.object({
    otp: z.string().regex(/^\d{6}$/u),
    phone: z.string().nullish(),
  }).passthrough(),
}).passthrough();

const SMS_HOOK_MAX_BODY_BYTES = 64 * 1024;

type HookHeaders = Record<string, string | string[] | undefined>;

function header(headers: HookHeaders, name: string) {
  const value = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

@Injectable()
export class SupabaseSmsHookService {
  private readonly logger = new Logger(SupabaseSmsHookService.name);

  constructor(
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    private readonly provider: AliyunSmsProvider,
    private readonly authority: SmsDeliveryAuthority,
  ) {}

  private verifier() {
    const sms = this.config.sms ?? DISABLED_SMS_CONFIG;
    const configured = sms.supabaseHookSecret;
    if (sms.provider !== 'aliyun' || !configured) {
      throw new ServiceUnavailableException('sms_provider_unavailable');
    }
    return new Webhook(configured.replace(/^v1,/u, ''));
  }

  private dedupeKey(phone: string, otp: string) {
    const secret = (this.config.sms ?? DISABLED_SMS_CONFIG).supabaseHookSecret;
    if (!secret) throw new ServiceUnavailableException('sms_provider_unavailable');
    return createHmac('sha256', secret)
      .update('icao:sms-dedupe:v1\0')
      .update(phone)
      .update('\0')
      .update(otp)
      .digest('hex');
  }

  private verify(rawBody: Buffer, headers: HookHeaders) {
    const webhookId = header(headers, 'webhook-id');
    const webhookTimestamp = header(headers, 'webhook-timestamp');
    const webhookSignature = header(headers, 'webhook-signature');
    if (!webhookId || !webhookTimestamp || !webhookSignature) {
      throw new UnauthorizedException('invalid_sms_hook_signature');
    }
    let payload: unknown;
    try {
      payload = this.verifier().verify(rawBody, {
        'webhook-id': webhookId,
        'webhook-timestamp': webhookTimestamp,
        'webhook-signature': webhookSignature,
      });
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new UnauthorizedException('invalid_sms_hook_signature');
    }
    const parsed = payloadSchema.safeParse(payload);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .slice(0, 4)
        .map((issue) => `${issue.path.join('.') || 'root'}:${issue.code}`)
        .join(',');
      this.logger.warn(`sms_hook_payload_rejected reason=schema issues=${issues}`);
      throw new BadRequestException('invalid_sms_hook_payload');
    }
    const userPhone = parsed.data.user?.phone;
    const smsPhone = parsed.data.sms.phone;
    const normalizedUserPhone = userPhone ? normalizeChinaMobile(userPhone) : undefined;
    const normalizedSmsPhone = smsPhone ? normalizeChinaMobile(smsPhone) : undefined;
    if (userPhone && smsPhone && normalizedUserPhone !== normalizedSmsPhone) {
      this.logger.warn('sms_hook_payload_rejected reason=phone_mismatch');
      throw new BadRequestException('invalid_sms_hook_payload');
    }
    const phone = normalizedSmsPhone ?? normalizedUserPhone;
    const phoneLength = (smsPhone ?? userPhone)?.length ?? 0;
    if (!phone) {
      this.logger.warn(`sms_hook_payload_rejected reason=phone_format source=${smsPhone ? 'sms' : userPhone ? 'user' : 'missing'} length=${phoneLength}`);
      throw new BadRequestException('invalid_sms_hook_payload');
    }
    return {
      dedupeKey: this.dedupeKey(phone, parsed.data.sms.otp),
      otp: parsed.data.sms.otp,
      phone,
    };
  }

  async handle(rawBody: Buffer | undefined, headers: HookHeaders) {
    if (!rawBody) throw new BadRequestException('sms_hook_raw_body_required');
    if (rawBody.byteLength > SMS_HOOK_MAX_BODY_BYTES) {
      throw new BadRequestException('sms_hook_payload_too_large');
    }
    const input = this.verify(rawBody, headers);
    const claimed = await this.authority.claim(input.dedupeKey, input.phone);
    if (claimed.outcome === 'duplicate_completed') return;
    if (claimed.outcome === 'duplicate_inflight') {
      throw new ServiceUnavailableException('sms_delivery_in_progress');
    }
    try {
      await this.provider.sendOtp({ outId: input.dedupeKey, phone: input.phone, otp: input.otp });
      await this.authority.complete(input.dedupeKey, claimed.leaseToken);
    } catch (error) {
      await this.authority.fail(input.dedupeKey, claimed.leaseToken, claimed.rules).catch(() => undefined);
      throw error;
    }
  }
}
