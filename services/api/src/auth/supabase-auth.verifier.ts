import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { API_CONFIG, type ApiConfig } from '../config';
import type { AuthVerifier, VerifiedAuthSession } from './auth.types';

function jwtClaims(token: string) {
  try {
    const segment = token.split('.')[1];
    if (!segment) throw new Error('missing_payload');
    return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as {
      amr?: unknown;
      iat?: unknown;
      session_id?: unknown;
    };
  } catch {
    throw new UnauthorizedException('invalid_access_token');
  }
}

function authenticationMethods(amr: unknown): VerifiedAuthSession['authenticationMethods'] {
  if (!Array.isArray(amr)) return [];
  return amr.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const { method, provider, timestamp } = entry as {
      method?: unknown;
      provider?: unknown;
      timestamp?: unknown;
    };
    if (
      typeof method !== 'string'
      || !method
      || typeof timestamp !== 'number'
      || !Number.isSafeInteger(timestamp)
      || timestamp <= 0
    ) return [];
    return [{
      method,
      ...(typeof provider === 'string' && provider ? { provider } : {}),
      timestamp,
    }];
  });
}

@Injectable()
export class SupabaseAuthVerifier implements AuthVerifier {
  private readonly client: SupabaseClient;

  constructor(@Inject(API_CONFIG) config: ApiConfig) {
    this.client = createClient(config.supabaseUrl, config.supabasePublishableKey, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    });
  }

  async verify(token: string): Promise<VerifiedAuthSession> {
    const { data, error } = await this.client.auth.getUser(token);
    if (error || !data.user) throw new UnauthorizedException('invalid_access_token');
    const claims = jwtClaims(token);
    if (typeof claims.session_id !== 'string' || typeof claims.iat !== 'number') throw new UnauthorizedException('invalid_access_token');
    return {
      accessToken: token,
      authenticationMethods: authenticationMethods(claims.amr),
      authUserId: data.user.id,
      identities: (data.user.identities ?? [])
        .filter((identity) => typeof identity.provider === 'string')
        .map((identity) => ({
          provider: identity.provider,
          subject: identity.identity_id ?? identity.id,
        })),
      issuedAt: claims.iat,
      passwordSet: typeof data.user.user_metadata?.password_set === 'boolean'
        ? data.user.user_metadata.password_set
        : undefined,
      sessionId: claims.session_id,
      user: { id: data.user.id, email: data.user.email, phone: data.user.phone },
    };
  }
}
