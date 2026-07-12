import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AuthenticatedUser } from '@icao/contracts';

import { API_CONFIG, type ApiConfig } from '../config';
import type { AuthVerifier } from './auth.types';

@Injectable()
export class SupabaseAuthVerifier implements AuthVerifier {
  private readonly client: SupabaseClient;

  constructor(@Inject(API_CONFIG) config: ApiConfig) {
    this.client = createClient(config.supabaseUrl, config.supabasePublishableKey, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    });
  }

  async verify(token: string): Promise<AuthenticatedUser> {
    const { data, error } = await this.client.auth.getUser(token);
    if (error || !data.user) throw new UnauthorizedException('invalid_access_token');
    return { id: data.user.id, email: data.user.email };
  }
}
