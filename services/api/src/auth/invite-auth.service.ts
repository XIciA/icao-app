import { HttpException, HttpStatus, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { and, eq, gt } from 'drizzle-orm';

import { API_CONFIG, type ApiConfig } from '../config';
import { DatabaseService } from '../database/database.service';
import { inviteAccounts, inviteLoginAttempts } from '../database/schema';
import { SessionSecurityService } from './session-security.service';
import { inviteCodeLookup, inviteEmail, invitePassword, inviteSourceLookup, parseInviteCode, verifyInviteCode } from './invite-code';

export type InviteSession = {
  accessToken: string;
  refreshToken: string;
  expiresAt?: number;
  user: { id: string; displayName: string };
};

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 5;

@Injectable()
export class InviteAuthService {
  private readonly publicAuth: SupabaseClient;
  private readonly adminAuth: SupabaseClient;

  constructor(
    private readonly database: DatabaseService,
    private readonly sessions: SessionSecurityService,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
  ) {
    const auth = { auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false } };
    this.publicAuth = createClient(config.supabaseUrl, config.supabasePublishableKey, auth);
    this.adminAuth = createClient(config.supabaseUrl, config.supabaseSecretKey, auth);
  }

  async exchange(rawCode: string, source: string): Promise<InviteSession> {
    const parsed = parseInviteCode(rawCode);
    const sourceHash = inviteSourceLookup(this.config.inviteAuthSecret, source);
    await this.assertSourceAllowed(sourceHash);
    if (!parsed) return this.rejectLogin(sourceHash);

    const lookup = inviteCodeLookup(this.config.inviteAuthSecret, parsed.code);
    const [invite] = await this.database.db.select().from(inviteAccounts)
      .where(eq(inviteAccounts.codeLookup, lookup)).limit(1);
    if (!invite || invite.status !== 'active' || !invite.userId || !verifyInviteCode(parsed.code, invite.codeHash)) {
      return this.rejectLogin(sourceHash);
    }

    const { data, error } = await this.publicAuth.auth.signInWithPassword({
      email: inviteEmail(invite.userId),
      password: invitePassword(this.config.inviteAuthSecret, parsed.code),
    });
    if (error || !data.session) return this.rejectLogin(sourceHash);

    await Promise.all([
      this.database.db.delete(inviteLoginAttempts).where(eq(inviteLoginAttempts.sourceHash, sourceHash)),
      this.database.db.update(inviteAccounts).set({ lastLoginAt: new Date() }).where(eq(inviteAccounts.userId, invite.userId)),
    ]);
    return {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresAt: data.session.expires_at,
      user: { id: invite.userId, displayName: invite.displayName },
    };
  }

  async assertActiveAccount(userId: string) {
    const [invite] = await this.database.db.select({ userId: inviteAccounts.userId }).from(inviteAccounts)
      .where(and(eq(inviteAccounts.userId, userId), eq(inviteAccounts.status, 'active'))).limit(1);
    if (!invite) throw new UnauthorizedException('invite_account_required');
  }

  async deleteAccount(userId: string, rawCode: string) {
    const parsed = parseInviteCode(rawCode);
    if (!parsed) throw new UnauthorizedException('invalid_invite_code');
    const [invite] = await this.database.db.select().from(inviteAccounts)
      .where(and(eq(inviteAccounts.userId, userId), eq(inviteAccounts.status, 'active'))).limit(1);
    if (!invite || !verifyInviteCode(parsed.code, invite.codeHash)) throw new UnauthorizedException('invalid_invite_code');

    await this.sessions.revokeAll(userId);
    const { error } = await this.adminAuth.auth.admin.deleteUser(userId, false);
    if (error) throw new Error('account_deletion_failed');
    await this.database.db.update(inviteAccounts)
      .set({ status: 'deleted', userId: null, deletedAt: new Date() })
      .where(eq(inviteAccounts.codeLookup, invite.codeLookup));
  }

  private async assertSourceAllowed(sourceHash: string) {
    const [attempt] = await this.database.db.select({ blockedUntil: inviteLoginAttempts.blockedUntil })
      .from(inviteLoginAttempts)
      .where(and(eq(inviteLoginAttempts.sourceHash, sourceHash), gt(inviteLoginAttempts.blockedUntil, new Date())))
      .limit(1);
    if (attempt) throw new HttpException('invite_login_rate_limited', HttpStatus.TOO_MANY_REQUESTS);
  }

  private async rejectLogin(sourceHash: string): Promise<never> {
    const now = new Date();
    const [attempt] = await this.database.db.select().from(inviteLoginAttempts)
      .where(eq(inviteLoginAttempts.sourceHash, sourceHash)).limit(1);
    const inWindow = attempt && now.getTime() - attempt.windowStartedAt.getTime() < LOGIN_WINDOW_MS;
    const failures = inWindow ? attempt.failureCount + 1 : 1;
    const blockedUntil = failures >= LOGIN_MAX_FAILURES ? new Date(now.getTime() + LOGIN_WINDOW_MS) : null;
    if (attempt) {
      await this.database.db.update(inviteLoginAttempts).set({
        failureCount: failures,
        windowStartedAt: inWindow ? attempt.windowStartedAt : now,
        blockedUntil,
        updatedAt: now,
      }).where(eq(inviteLoginAttempts.sourceHash, sourceHash));
    } else {
      await this.database.db.insert(inviteLoginAttempts).values({ sourceHash, failureCount: failures, windowStartedAt: now, blockedUntil });
    }
    throw new UnauthorizedException('invalid_invite_code');
  }
}
