import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { API_CONFIG, type ApiConfig } from '../config';
import { SessionSecurityService } from '../auth/session-security.service';

@Injectable()
export class AccountService {
  private readonly publicAuth: SupabaseClient;
  private readonly adminAuth: SupabaseClient;

  constructor(
    @Inject(API_CONFIG) config: ApiConfig,
    private readonly sessions: SessionSecurityService,
  ) {
    const authOptions = { auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false } };
    this.publicAuth = createClient(config.supabaseUrl, config.supabasePublishableKey, authOptions);
    this.adminAuth = createClient(config.supabaseUrl, config.supabaseSecretKey, authOptions);
  }

  async revokeAll(userId: string, accessToken: string) {
    await this.sessions.revokeAll(userId);
    const { error } = await this.adminAuth.auth.admin.signOut(accessToken, 'global');
    if (error) throw new Error('global_sign_out_failed');
    return { revoked: true as const };
  }

  async deleteAccount(userId: string, email: string | undefined, currentPassword: string) {
    if (!email) throw new UnauthorizedException('account_email_missing');
    const { error: passwordError } = await this.publicAuth.auth.signInWithPassword({ email, password: currentPassword });
    if (passwordError) throw new UnauthorizedException('invalid_current_password');
    const { error } = await this.adminAuth.auth.admin.deleteUser(userId, false);
    if (error) throw new Error('account_deletion_failed');
  }
}
