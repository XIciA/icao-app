import { createPrivateKey, createPublicKey } from 'node:crypto';

export type WechatPayConfig = {
  appId: string; merchantId: string; apiV3Key: string; merchantSerial: string;
  privateKey: string; platformPublicKey: string; platformPublicKeyId: string; notifyUrl: string;
};

/** Payment uses the API's one environment loader; login AppSecret is not a payment credential. */
export function parseWechatPayConfig(environment: NodeJS.ProcessEnv, appId?: string): WechatPayConfig | undefined {
  const names = ['WECHAT_PAY_MCH_ID', 'WECHAT_PAY_API_V3_KEY', 'WECHAT_PAY_MERCHANT_SERIAL_NO',
    'WECHAT_PAY_MERCHANT_PRIVATE_KEY', 'WECHAT_PAY_PLATFORM_PUBLIC_KEY', 'WECHAT_PAY_PLATFORM_PUBLIC_KEY_ID', 'WECHAT_PAY_NOTIFY_URL'] as const;
  const values = names.map((name) => environment[name]?.trim());
  if (!values.some(Boolean)) return undefined;
  if (!appId || !values.every(Boolean)) throw new Error('incomplete_wechat_pay_configuration');
  const [merchantId, apiV3Key, merchantSerial, rawPrivateKey, rawPlatformPublicKey, platformPublicKeyId, notifyUrl] = values as string[];
  // Docker env-files carry PEM values on one line, as with the other server signing keys.
  const privateKey = rawPrivateKey!.replaceAll('\\n', '\n');
  const platformPublicKey = rawPlatformPublicKey!.replaceAll('\\n', '\n');
  try {
    const url = new URL(notifyUrl!);
    if (!/^\d{6,32}$/u.test(merchantId!) || Buffer.byteLength(apiV3Key!, 'utf8') !== 32
      || !/^[A-Fa-f0-9]{10,64}$/u.test(merchantSerial!) || !/^PUB_KEY_ID_[A-Za-z0-9_]+$/u.test(platformPublicKeyId!)
      || url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
      || !url.pathname.endsWith('/v1/commerce/wechat/notifications')) throw new Error();
    const signing = createPrivateKey(privateKey!);
    const verifying = createPublicKey(platformPublicKey!);
    if (signing.asymmetricKeyType !== 'rsa' || verifying.asymmetricKeyType !== 'rsa'
      || (signing.asymmetricKeyDetails?.modulusLength ?? 0) < 2048 || (verifying.asymmetricKeyDetails?.modulusLength ?? 0) < 2048) throw new Error();
  } catch { throw new Error('invalid_wechat_pay_configuration'); }
  return { appId, merchantId: merchantId!, apiV3Key: apiV3Key!, merchantSerial: merchantSerial!, privateKey: privateKey!,
    platformPublicKey: platformPublicKey!, platformPublicKeyId: platformPublicKeyId!, notifyUrl: notifyUrl! };
}
