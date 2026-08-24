import { Injectable } from '@nestjs/common';

export const APPLE_AUTH_HTTP = Symbol('APPLE_AUTH_HTTP');

export type AppleTokenResponse = {
  accessToken: string;
  idToken: string;
  refreshToken: string;
};

export type AppleAuthHttp = {
  exchangeAuthorizationCode(input: {
    authorizationCode: string;
    clientId: string;
    clientSecret: string;
  }): Promise<AppleTokenResponse>;
  revoke(input: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
  }): Promise<void>;
};

export class AppleAuthHttpError extends Error {
  constructor(
    readonly code: 'invalid_grant' | 'invalid_client' | 'rate_limited' | 'server_error' | 'invalid_response' | 'unavailable',
  ) {
    super(code);
  }
}

@Injectable()
export class FetchAppleAuthHttp implements AppleAuthHttp {
  async exchangeAuthorizationCode(input: {
    authorizationCode: string;
    clientId: string;
    clientSecret: string;
  }): Promise<AppleTokenResponse> {
    const response = await this.post('https://appleid.apple.com/auth/token', {
      client_id: input.clientId,
      client_secret: input.clientSecret,
      code: input.authorizationCode,
      grant_type: 'authorization_code',
    });
    const body = await response.json().catch(() => undefined) as {
      access_token?: unknown;
      error?: unknown;
      id_token?: unknown;
      refresh_token?: unknown;
    } | undefined;
    if (!response.ok) throw new AppleAuthHttpError(this.errorCode(response.status, body?.error));
    if (
      typeof body?.access_token !== 'string'
      || typeof body.id_token !== 'string'
      || typeof body.refresh_token !== 'string'
    ) throw new AppleAuthHttpError('invalid_response');
    return {
      accessToken: body.access_token,
      idToken: body.id_token,
      refreshToken: body.refresh_token,
    };
  }

  async revoke(input: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
  }) {
    const response = await this.post('https://appleid.apple.com/auth/revoke', {
      client_id: input.clientId,
      client_secret: input.clientSecret,
      token: input.refreshToken,
      token_type_hint: 'refresh_token',
    });
    if (response.status !== 200) {
      const body = await response.json().catch(() => undefined) as { error?: unknown } | undefined;
      throw new AppleAuthHttpError(this.errorCode(response.status, body?.error));
    }
  }

  private async post(url: string, body: Record<string, string>) {
    return fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body),
      signal: AbortSignal.timeout(10_000),
    }).catch(() => {
      throw new AppleAuthHttpError('unavailable');
    });
  }

  private errorCode(status: number, error: unknown): AppleAuthHttpError['code'] {
    if (status === 429) return 'rate_limited';
    if (status >= 500) return 'server_error';
    if (error === 'invalid_grant') return 'invalid_grant';
    if (error === 'invalid_client') return 'invalid_client';
    return 'invalid_response';
  }
}
