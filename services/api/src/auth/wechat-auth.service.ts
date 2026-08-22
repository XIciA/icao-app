import { createHmac } from 'node:crypto';

import { BadGatewayException, HttpException, HttpStatus, Inject, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import type { SocialAuthSessionResponse } from '@icao/contracts';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { AccountIdentityService } from '../account/account-identity.service';
import { API_CONFIG, type ApiConfig } from '../config';
import { AUTH_VERIFIER, type AuthVerifier } from './auth.types';
import { RecentSocialAuthGrantService } from './recent-social-auth-grant.service';

type WechatTokenResponse = {
  access_token?: string;
  errcode?: number;
  openid?: string;
  unionid?: string;
};

type WechatUserResponse = {
  errcode?: number;
  openid?: string;
  unionid?: string;
};

@Injectable()
export class WechatAuthService {
  private readonly adminAuth: SupabaseClient;
  private readonly publicAuth: SupabaseClient;
  private readonly exchangeAttempts = new Map<string, { count: number; expiresAt: number }>();
  private readonly usedCodes = new Map<string, number>();

  constructor(
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    @Inject(AUTH_VERIFIER) private readonly verifier: AuthVerifier,
    private readonly identities: AccountIdentityService,
    private readonly recentSocialAuth: RecentSocialAuthGrantService,
  ) {
    this.adminAuth = createClient(config.supabaseUrl, config.supabaseSecretKey, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    });
    this.publicAuth = createClient(config.supabaseUrl, config.supabasePublishableKey, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    });
  }

  private async wechatJson<T>(path: string, query: Record<string, string>) {
    const wechat = this.config.wechat;
    if (!wechat) throw new ServiceUnavailableException('wechat_auth_unavailable');
    const url = new URL(path, wechat.apiBaseUrl);
    Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, value));
    let response: Response;
    try {
      response = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
    } catch {
      throw new BadGatewayException('wechat_auth_upstream_unavailable');
    }
    if (!response.ok) throw new BadGatewayException('wechat_auth_upstream_unavailable');
    return await response.json() as T;
  }

  private syntheticEmail(unionId: string) {
    const digest = createHmac('sha256', this.config.accountIdentityHashSecret)
      .update(`wechat-session-email-v1\0${unionId}`)
      .digest('hex');
    return `wechat-${digest}@auth.readyoufife.invalid`;
  }

  async exchange(code: string, sourceIp = 'internal'): Promise<SocialAuthSessionResponse> {
    const wechat = this.config.wechat;
    if (!wechat) throw new ServiceUnavailableException('wechat_auth_unavailable');
    this.reserveExchange(code, sourceIp);
    const token = await this.wechatJson<WechatTokenResponse>('/sns/oauth2/access_token', {
      appid: wechat.appId,
      secret: wechat.appSecret,
      code,
      grant_type: 'authorization_code',
    });
    if (token.errcode || !token.access_token || !token.openid) {
      throw new UnauthorizedException('wechat_authorization_invalid');
    }

    let unionId = token.unionid;
    if (!unionId) {
      const user = await this.wechatJson<WechatUserResponse>('/sns/userinfo', {
        access_token: token.access_token,
        openid: token.openid,
        lang: 'zh_CN',
      });
      if (user.errcode) throw new UnauthorizedException('wechat_authorization_invalid');
      unionId = user.unionid;
    }
    if (!unionId) throw new ServiceUnavailableException('wechat_unionid_unavailable');

    const email = this.syntheticEmail(unionId);
    const { data: link, error: linkError } = await this.adminAuth.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { data: { account_provider: 'wechat' } },
    });
    const verificationType = link.properties?.verification_type;
    if (
      linkError
      || !link.user
      || !link.properties?.hashed_token
      || (verificationType !== 'signup' && verificationType !== 'magiclink')
    ) {
      throw new ServiceUnavailableException('wechat_session_bridge_unavailable');
    }

    const { data, error } = await this.publicAuth.auth.verifyOtp({
      type: verificationType,
      token_hash: link.properties.hashed_token,
    });
    if (error || !data.session || data.user?.id !== link.user.id) {
      throw new ServiceUnavailableException('wechat_session_bridge_unavailable');
    }
    try {
      const verified = await this.verifier.verify(data.session.access_token);
      if (verified.authUserId !== data.user.id) throw new ServiceUnavailableException('wechat_session_bridge_unavailable');
      await this.identities.registerWechatIdentity(data.user.id, unionId);
      this.recentSocialAuth.issue('wechat', verified.authUserId, verified.sessionId);
    } catch (cause) {
      await this.adminAuth.auth.admin.signOut(data.session.access_token, 'local').catch(() => undefined);
      throw cause;
    }
    return {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresAt: data.session.expires_at,
    };
  }

  private reserveExchange(code: string, sourceIp: string, now = Date.now()) {
    for (const [key, value] of this.exchangeAttempts) if (value.expiresAt <= now) this.exchangeAttempts.delete(key);
    for (const [key, expiresAt] of this.usedCodes) if (expiresAt <= now) this.usedCodes.delete(key);
    const sourceHash = createHmac('sha256', this.config.accountIdentityHashSecret)
      .update(`wechat-exchange-source-v1\0${sourceIp}`)
      .digest('hex');
    const codeHash = createHmac('sha256', this.config.accountIdentityHashSecret)
      .update(`wechat-exchange-code-v1\0${code}`)
      .digest('hex');
    if (this.usedCodes.has(codeHash)) throw new UnauthorizedException('wechat_authorization_invalid');
    const attempt = this.exchangeAttempts.get(sourceHash);
    if ((attempt?.count ?? 0) >= 10) throw new HttpException('wechat_auth_rate_limited', HttpStatus.TOO_MANY_REQUESTS);
    this.exchangeAttempts.set(sourceHash, {
      count: (attempt?.count ?? 0) + 1,
      expiresAt: attempt?.expiresAt ?? now + 10 * 60 * 1_000,
    });
    this.usedCodes.set(codeHash, now + 10 * 60 * 1_000);
  }
}
