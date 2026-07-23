import { Inject, Injectable } from '@nestjs/common';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { InviteAuthService } from '../auth/invite-auth.service';
import { SessionSecurityService } from '../auth/session-security.service';
import { API_CONFIG, type ApiConfig } from '../config';
import { FeedbackService } from '../feedback/feedback.service';

@Injectable()
export class AccountService {
  private readonly adminAuth: SupabaseClient;

  constructor(
    @Inject(API_CONFIG) config: ApiConfig,
    private readonly sessions: SessionSecurityService,
    private readonly invites: InviteAuthService,
    private readonly feedback: FeedbackService,
  ) {
    this.adminAuth = createClient(config.supabaseUrl, config.supabaseSecretKey, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    });
  }

  async revokeAll(userId: string, accessToken: string) {
    await this.sessions.revokeAll(userId);
    const { error } = await this.adminAuth.auth.admin.signOut(accessToken, 'global');
    if (error) throw new Error('global_sign_out_failed');
    return { revoked: true as const };
  }

  async deleteAccount(userId: string, inviteCode: string) {
    const feedbackObjectKeys = await this.feedback.userObjectKeys(userId);
    await this.invites.deleteAccount(userId, inviteCode);
    await this.feedback.removeObjects(feedbackObjectKeys).catch(() => undefined);
  }
}
