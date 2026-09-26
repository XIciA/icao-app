import {
  ForbiddenException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { OpsStaffSession } from '@icao/contracts';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';

import { OPS_API_CONFIG, type OpsApiConfig } from '../config';
import { opsStaffAccounts, opsStaffSessions } from '../database/schema';
import { DatabaseService } from '../database/database.service';
import { AdminAuditService } from './admin-audit.service';
import {
  hashOpsSecret,
  verifyOpsPassword,
} from './admin-crypto';
import { OpsLoginRateLimiter } from './admin-login-rate-limiter';
import type { OpsAuthenticatedStaff } from './admin.types';

const SESSION_MS = 12 * 60 * 60 * 1_000;
const UNKNOWN_STAFF_PASSWORD_HASH =
  'scrypt-v1$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

@Injectable()
export class AdminAuthService {
  constructor(
    @Inject(OPS_API_CONFIG) private readonly config: OpsApiConfig,
    private readonly database: DatabaseService,
    private readonly audit: AdminAuditService,
    private readonly loginRateLimiter: OpsLoginRateLimiter,
  ) {}

  private assertEnabled() {
    if (
      !this.config.opsEnabled
      || !this.config.opsSessionHashSecret
      || !this.config.opsTrustedProxySharedSecret
    ) throw new ServiceUnavailableException('ops_console_disabled');
  }

  private tokenHash(token: string) {
    return hashOpsSecret(token, this.config.opsSessionHashSecret, 'ops-session-v1');
  }

  async login(input: {
    deviceName?: string;
    email: string;
    password: string;
    totpCode?: string;
  }, requestId: string, source: string): Promise<OpsStaffSession> {
    this.assertEnabled();
    // This synchronous gate runs before database lookup, scrypt, and audit.
    this.loginRateLimiter.assertAllowed(source);
    const now = new Date();
    const [staff] = await this.database.db.select().from(opsStaffAccounts)
      .where(eq(opsStaffAccounts.email, input.email)).limit(1);
    const passwordValid = staff
      ? await verifyOpsPassword(input.password, staff.passwordHash)
      : await verifyOpsPassword(input.password, UNKNOWN_STAFF_PASSWORD_HASH);
    if (
      !staff
      || staff.disabledAt
      || !passwordValid
    ) {
      await this.recordFailure(staff, requestId);
      throw new UnauthorizedException('invalid_ops_credentials');
    }

    const accessToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(now.getTime() + SESSION_MS);
    const session = await this.database.db.transaction(async (transaction) => {
      await transaction.execute(sql`
        select pg_advisory_xact_lock(hashtextextended(${`ops-staff:${staff.id}`}, 0))
      `);
      const [created] = await transaction.insert(opsStaffSessions).values({
        staffId: staff.id,
        tokenHash: this.tokenHash(accessToken),
        deviceName: input.deviceName ?? null,
        // Legacy database column stores the successful authentication timestamp.
        totpVerifiedAt: now,
        lastSeenAt: now,
        expiresAt,
        createdAt: now,
      }).returning({ id: opsStaffSessions.id });
      if (!created) throw new Error('ops_session_insert_failed');
      await this.audit.record({
        requestId,
        actorStaffId: staff.id,
        actorRole: staff.role as 'admin' | 'support',
        action: 'ops.auth.login',
        targetType: 'ops_session',
        targetId: created.id,
        reason: '工作人员完成账号密码登录',
        metadata: { authenticationMethod: 'password' },
      }, transaction);
      return created;
    });
    if (!session) {
      await this.recordFailure(staff, requestId);
      throw new UnauthorizedException('invalid_ops_credentials');
    }
    return {
      accessToken,
      expiresAt: expiresAt.toISOString(),
      staff: { id: staff.id, email: staff.email, role: staff.role as 'admin' | 'support' },
    };
  }

  async authenticate(token: string): Promise<OpsAuthenticatedStaff> {
    this.assertEnabled();
    const now = new Date();
    const [row] = await this.database.db.select({
      email: opsStaffAccounts.email,
      role: opsStaffAccounts.role,
      staffId: opsStaffAccounts.id,
      disabledAt: opsStaffAccounts.disabledAt,
      sessionId: opsStaffSessions.id,
    }).from(opsStaffSessions)
      .innerJoin(opsStaffAccounts, eq(opsStaffSessions.staffId, opsStaffAccounts.id))
      .where(and(
        eq(opsStaffSessions.tokenHash, this.tokenHash(token)),
        isNull(opsStaffSessions.revokedAt),
        gt(opsStaffSessions.expiresAt, now),
      )).limit(1);
    if (!row || row.disabledAt) throw new UnauthorizedException('invalid_ops_session');
    await this.database.db.update(opsStaffSessions).set({ lastSeenAt: now })
      .where(eq(opsStaffSessions.id, row.sessionId));
    return {
      id: row.staffId,
      email: row.email,
      role: row.role as 'admin' | 'support',
      sessionId: row.sessionId,
    };
  }

  async logout(staff: OpsAuthenticatedStaff, requestId: string) {
    const now = new Date();
    await this.database.db.transaction(async (transaction) => {
      await transaction.update(opsStaffSessions).set({ revokedAt: now })
        .where(and(
          eq(opsStaffSessions.id, staff.sessionId),
          isNull(opsStaffSessions.revokedAt),
        ));
      await this.audit.record({
        requestId,
        actorStaffId: staff.id,
        actorRole: staff.role,
        action: 'ops.auth.logout',
        targetType: 'ops_session',
        targetId: staff.sessionId,
        reason: '工作人员主动退出运营后台',
      }, transaction);
    });
    return { revoked: true as const };
  }

  async revokeAllSessions(staff: OpsAuthenticatedStaff, requestId: string) {
    const now = new Date();
    await this.database.db.transaction(async (transaction) => {
      await transaction.update(opsStaffSessions).set({ revokedAt: now })
        .where(and(
          eq(opsStaffSessions.staffId, staff.id),
          isNull(opsStaffSessions.revokedAt),
        ));
      await this.audit.record({
        requestId,
        actorStaffId: staff.id,
        actorRole: staff.role,
        action: 'ops.auth.sessions_revoke_all',
        targetType: 'ops_staff',
        targetId: staff.id,
        reason: '工作人员撤销本人全部后台会话',
      }, transaction);
    });
    return { revoked: true as const };
  }

  assertAdmin(staff: OpsAuthenticatedStaff) {
    if (staff.role !== 'admin') throw new ForbiddenException('ops_admin_required');
  }

  private async recordFailure(
    staff: typeof opsStaffAccounts.$inferSelect | undefined,
    requestId: string,
  ) {
    // Unknown email attempts never create immutable audit rows. Known staff
    // failures are already bounded by OpsLoginRateLimiter before this method.
    if (!staff) return;
    await this.audit.record({
      requestId,
      actorStaffId: staff.id,
      actorRole: staff.role as 'admin' | 'support',
      action: 'ops.auth.login_failed',
      targetType: 'ops_staff',
      targetId: staff.id,
      reason: '工作人员登录凭据校验失败',
    });
  }
}
