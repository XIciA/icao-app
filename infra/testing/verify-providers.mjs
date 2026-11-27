// Read-only provider preflight. Actual SMS delivery, OAuth and payment still need
// separate user/device evidence. Run inside the testing API container from /app.
import { createRequire } from 'node:module';
import { createSign, randomUUID } from 'node:crypto';
const require = createRequire(`${process.cwd()}/services/api/package.json`);
require('reflect-metadata');
if (process.env.ICAO_DATA_ENVIRONMENT !== 'testing') throw new Error('testing_only');
const { loadConfig } = require('./dist/src/config.js');
const { WechatMerchantClient } = require('./dist/src/commerce/wechat-merchant-client.js');
const config = loadConfig();
const checks = {};
const merchant = new WechatMerchantClient(config);
try {
  await merchant.request('GET', `/v3/pay/transactions/out-trade-no/icao-probe-${randomUUID().replaceAll('-','').slice(0,20)}?mchid=${encodeURIComponent(config.wechatPay.merchantId)}`);
  throw new Error('unexpected_probe_order');
} catch (error) {
  if (error.providerCode !== 'ORDER_NOT_EXIST') throw new Error(`wechat_merchant_probe_failed:${error.providerCode ?? 'transport_or_signature'}`);
  checks.wechatMerchantAuthenticatedAndResponseVerified = true;
}
const wechat = new URL('https://api.weixin.qq.com/sns/oauth2/access_token');
for (const [key,value] of Object.entries({appid:config.wechatAppId,secret:config.wechatAppSecret,code:'icao-invalid-probe-code',grant_type:'authorization_code'})) wechat.searchParams.set(key,value);
const wechatBody = await (await fetch(wechat,{signal:AbortSignal.timeout(10000)})).json();
if (wechatBody.errcode !== 40029) throw new Error(`wechat_oauth_preflight:${wechatBody.errcode}`);
checks.wechatOAuthRejectsInvalidCode = true;
const now = Math.floor(Date.now()/1000);
const b64 = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const unsigned = `${b64({alg:'ES256',kid:config.appleKeyId})}.${b64({iss:config.appleTeamId,iat:now,exp:now+300,aud:'https://appleid.apple.com',sub:config.appleSignInClientId})}`;
const signature = createSign('SHA256').update(unsigned).sign({key:config.applePrivateKey,dsaEncoding:'ieee-p1363'}).toString('base64url');
const apple = await (await fetch('https://appleid.apple.com/auth/token',{
  method:'POST',body:new URLSearchParams({client_id:config.appleSignInClientId,client_secret:`${unsigned}.${signature}`,code:'icao-invalid-probe-code',grant_type:'authorization_code'}),signal:AbortSignal.timeout(10000),
})).json();
if (apple.error !== 'invalid_grant') throw new Error(`apple_oauth_preflight:${apple.error ?? 'unexpected_response'}`);
checks.appleOAuthRejectsInvalidGrant = true;
const Sms = require('@alicloud/dysmsapi20170525');
const OpenApi = require('@alicloud/openapi-client');
const client = new Sms.default(new OpenApi.Config({accessKeyId:config.sms.aliyunAccessKeyId,accessKeySecret:config.sms.aliyunAccessKeySecret,endpoint:config.sms.aliyunEndpoint,connectTimeout:3000,readTimeout:5000}));
const date = new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'}).replaceAll('-','');
try {
  const result = await client.querySendDetails(new Sms.QuerySendDetailsRequest({phoneNumber:'19900000001',sendDate:date,pageSize:1,currentPage:1}));
  if (result.body?.code !== 'OK') throw new Error('query_rejected');
} catch { throw new Error('aliyun_sms_readonly_authentication_failed'); }
checks.aliyunSmsReadOnlyAuthentication = true;
console.log(JSON.stringify({environment:'testing',verifiedAt:new Date().toISOString(),checks,limits:'No SMS sent, no successful user OAuth, no money paid by this preflight.'}));
