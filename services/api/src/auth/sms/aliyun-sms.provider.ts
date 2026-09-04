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

type AliyunSmsSubmitClient = Pick<Dysmsapi20170525, 'sendSms'>;
type AliyunSmsReconciliationClient = Pick<Dysmsapi20170525, 'querySendDetails'>;

export class DefinitiveSmsSubmissionError extends HttpException {
  readonly definitive = true;
}

export async function submitAliyunOtp(
  client: AliyunSmsSubmitClient,
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
  if (!body?.code) {
    // A fulfilled SDK promise without the documented provider result is not
    // proof of rejection; treat it as ambiguous and reconcile by OutId.
    throw new ServiceUnavailableException('sms_delivery_failed');
  }
  if (body.code !== 'OK') {
    const providerCode = body.code;
    if (/LIMIT|FREQUENCY|THROTTL/iu.test(providerCode)) {
      throw new DefinitiveSmsSubmissionError('sms_rate_limited', HttpStatus.TOO_MANY_REQUESTS);
    }
    throw new DefinitiveSmsSubmissionError('sms_delivery_failed', HttpStatus.SERVICE_UNAVAILABLE);
  }
  return { bizId: body.bizId, requestId: body.requestId };
}

function aliyunSendDate(value: Date) {
  const chinaTime = new Date(value.getTime() + 8 * 60 * 60 * 1_000);
  return [
    chinaTime.getUTCFullYear(),
    String(chinaTime.getUTCMonth() + 1).padStart(2, '0'),
    String(chinaTime.getUTCDate()).padStart(2, '0'),
  ].join('');
}

export async function reconcileAliyunOtpSubmission(
  client: AliyunSmsReconciliationClient,
  input: { outId: string; phone: string; submissionStartedAt: Date },
) {
  const response = await client.querySendDetails(new AliyunSmsModels.QuerySendDetailsRequest({
    currentPage: 1,
    pageSize: 50,
    phoneNumber: input.phone.slice(3),
    sendDate: aliyunSendDate(input.submissionStartedAt),
  }));
  if (response.body?.code !== 'OK') throw new ServiceUnavailableException('sms_delivery_reconciliation_failed');
  const delivery = response.body.smsSendDetailDTOs?.smsSendDetailDTO
    ?.find((entry) => entry.outId === input.outId);
  return delivery
    // QuerySendDetails' requestId identifies this query, not the original
    // SendSms request. Presence of our provider OutId is the positive
    // acceptance evidence; do not persist the query id as submission data.
    ? { found: true as const, submission: {} }
    : { found: false as const };
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

  prepare() {
    const sms = this.config.sms ?? DISABLED_SMS_CONFIG;
    if (!sms.aliyunTemplateCode) throw new ServiceUnavailableException('sms_provider_unavailable');
    this.sdk();
  }

  async sendOtp(input: { outId: string; phone: string; otp: string }) {
    const sms = this.config.sms ?? DISABLED_SMS_CONFIG;
    const templateCode = sms.aliyunTemplateCode;
    if (!templateCode) throw new ServiceUnavailableException('sms_provider_unavailable');
    try {
      this.prepare();
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

  async reconcileOtpSubmission(input: { outId: string; phone: string; submissionStartedAt: Date }) {
    try {
      return await reconcileAliyunOtpSubmission(this.sdk(), input);
    } catch (error) {
      if (error instanceof HttpException || error instanceof ServiceUnavailableException) throw error;
      this.logger.warn('aliyun_sms_reconciliation_failed');
      throw new ServiceUnavailableException('sms_delivery_reconciliation_failed');
    }
  }
}
