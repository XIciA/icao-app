import { ForbiddenException, Inject, Injectable, Optional, ServiceUnavailableException } from '@nestjs/common';
import { isChinaMobileE164, normalizeChinaMobile } from '@icao/contracts';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { API_CONFIG, type ApiConfig } from '../config';
import { AccountPhoneIdentityService } from '../account/account-phone-identity.service';
import type { VerifiedAuthSession } from './auth.types';

export const RECENT_AUTH_PASSWORD_VERIFIER = Symbol('RECENT_AUTH_PASSWORD_VERIFIER');

export type RecentAuthPasswordVerifier = {
  verify(source: VerifiedAuthSession, password: string): Promise<void>;
};

@Injectable()
export class SupabaseRecentAuthPasswordVerifier implements RecentAuthPasswordVerifier {
  private readonly adminAuth: SupabaseClient;
  private readonly publicAuth: SupabaseClient;

  constructor(
    @Inject(API_CONFIG) config: ApiConfig,
    @Optional() private readonly accountPhones?: AccountPhoneIdentityService,
  ) {
    const authOptions = { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false };
    this.publicAuth = createClient(config.supabaseUrl, config.supabasePublishableKey, { auth: authOptions });
    this.adminAuth = createClient(config.supabaseUrl, config.supabaseSecretKey, { auth: authOptions });
  }

  async verify(source: VerifiedAuthSession, password: string) {
    if (!source.user.providers?.includes('phone')) {
      throw new ForbiddenException('password_reauthentication_unavailable');
    }
    const identity = isChinaMobileE164(source.user.phone) && source.authUserId
      ? {
        authUserId: source.authUserId,
        passwordSet: source.passwordSet === true,
        phone: source.user.phone,
      }
      : this.accountPhones
        ? await this.accountPhones.resolve(source.user.id)
        : undefined;
    if (!identity) throw new ForbiddenException('password_reauthentication_unavailable');
    if (!identity.passwordSet) throw new ForbiddenException('password_reauthentication_unavailable');

    const { data, error } = await this.publicAuth.auth.signInWithPassword({
      phone: identity.phone,
      password,
    });
    if (
      error
      || !data.session
      || data.user.id !== identity.authUserId
      || normalizeChinaMobile(data.user.phone ?? '') !== identity.phone
    ) {
      if (data.session) {
        await this.adminAuth.auth.admin.signOut(data.session.access_token, 'local').catch(() => undefined);
      }
      throw new ForbiddenException('invalid_phone_or_password');
    }

    const { error: signOutError } = await this.adminAuth.auth.admin.signOut(data.session.access_token, 'local');
    if (signOutError) throw new ServiceUnavailableException('recent_auth_unavailable');
  }
}
