import Dysmsapi20170525, * as AliyunSmsModels from '@alicloud/dysmsapi20170525';
import * as OpenApi from '@alicloud/openapi-client';
import {
  Inject,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';

import { API_CONFIG, type ApiConfig, DISABLED_SMS_CONFIG } from '../../config';

export type SmsSubmission = {
  bizId?: string;
  requestId?: string;
};

type AliyunSmsClient = Pick<Dysmsapi20170525, 'sendSms'>;

export async function submitAliyunOtp(
  client: AliyunSmsClient,
  input: { outId: string; phone: string; signName: string; templateCode: string; otp: string },
): Promise<SmsSubmission> {
  const response = await client.sendSms(new AliyunSmsModels.SendSmsRequest({
    outId: input.outId,
    phoneNumbers: input.phone.slice(3),
    signName: input.signName,
    templateCode: input.templateCode,
    templateParam: JSON.stringify({ code: input.otp }),
  }));
  const body = response.body;
  if (body?.code !== 'OK') {
    const providerCode = body?.code ?? 'UNKNOWN';
    if (/LIMIT|FREQUENCY|THROTTL/iu.test(providerCode)) {
      throw new HttpException('sms_rate_limited', HttpStatus.TOO_MANY_REQUESTS);
    }
    throw new ServiceUnavailableException('sms_delivery_failed');
  }
  return { bizId: body.bizId, requestId: body.requestId };
}

@Injectable()
export class AliyunSmsProvider {
  private readonly logger = new Logger(AliyunSmsProvider.name);
  private client?: Dysmsapi20170525;

  constructor(@Inject(API_CONFIG) private readonly config: ApiConfig) {}

  private sdk() {
    const sms = this.config.sms ?? DISABLED_SMS_CONFIG;
    if (
      sms.provider !== 'aliyun'
      || !sms.aliyunAccessKeyId
      || !sms.aliyunAccessKeySecret
      || !sms.aliyunTemplateCode
    ) {
      throw new ServiceUnavailableException('sms_provider_unavailable');
    }
    this.client ??= new Dysmsapi20170525(new OpenApi.Config({
      accessKeyId: sms.aliyunAccessKeyId,
      accessKeySecret: sms.aliyunAccessKeySecret,
      connectTimeout: 1_500,
      endpoint: sms.aliyunEndpoint,
      readTimeout: 2_500,
    }));
    return this.client;
  }

  async sendOtp(input: { outId: string; phone: string; otp: string }) {
    const sms = this.config.sms ?? DISABLED_SMS_CONFIG;
    const templateCode = sms.aliyunTemplateCode;
    if (!templateCode) throw new ServiceUnavailableException('sms_provider_unavailable');
    try {
      const submitted = await submitAliyunOtp(this.sdk(), {
        ...input,
        signName: sms.aliyunSignName,
        templateCode,
      });
      this.logger.log(`aliyun_sms_submitted requestId=${submitted.requestId ?? 'unknown'} bizId=${submitted.bizId ?? 'unknown'}`);
      return submitted;
    } catch (error) {
      if (error instanceof HttpException || error instanceof ServiceUnavailableException) throw error;
      this.logger.warn('aliyun_sms_submission_failed');
      throw new ServiceUnavailableException('sms_delivery_failed');
    }
  }
}
