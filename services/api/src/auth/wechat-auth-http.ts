import { Injectable } from '@nestjs/common';

export const WECHAT_AUTH_HTTP = Symbol('WECHAT_AUTH_HTTP');

export type WechatTokenResponse = {
  access_token?: string;
  errcode?: number;
  errmsg?: string;
  expires_in?: number;
  openid?: string;
  refresh_token?: string;
  scope?: string;
  unionid?: string;
};

export type WechatAuthHttp = {
  exchangeCode(input: { appId: string; appSecret: string; code: string }): Promise<WechatTokenResponse>;
};

@Injectable()
export class FetchWechatAuthHttp implements WechatAuthHttp {
  async exchangeCode(input: { appId: string; appSecret: string; code: string }) {
    const url = new URL('https://api.weixin.qq.com/sns/oauth2/access_token');
    url.searchParams.set('appid', input.appId);
    url.searchParams.set('secret', input.appSecret);
    url.searchParams.set('code', input.code);
    url.searchParams.set('grant_type', 'authorization_code');
    const response = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error('wechat_provider_unavailable');
    const body = await response.json() as WechatTokenResponse;
    return body;
  }
}
