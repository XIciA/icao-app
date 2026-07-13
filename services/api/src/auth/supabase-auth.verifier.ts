import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { API_CONFIG, type ApiConfig } from '../config';
import type { AuthVerifier, VerifiedAuthSession } from './auth.types';

function jwtClaims(token: string) {
  try {
    const segment = token.split('.')[1];
    if (!segment) throw new Error('missing_payload');
    return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as { iat?: unknown; session_id?: unknown };
  } catch {
    throw new UnauthorizedException('invalid_access_token');
  }
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
      issuedAt: claims.iat,
      sessionId: claims.session_id,
      user: { id: data.user.id, email: data.user.email },
    };
  }
}
