import { Injectable, UnauthorizedException } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';

import { DatabaseService } from '../database/database.service';
import { accountSessionRevocations } from '../database/schema';
import type { VerifiedAuthSession } from './auth.types';

@Injectable()
export class SessionSecurityService {
  constructor(private readonly database: DatabaseService) {}

  async assertActive(auth: VerifiedAuthSession) {
    const [revoked] = await this.database.db.select({ sessionId: accountSessionRevocations.sessionId })
      .from(accountSessionRevocations)
      .where(eq(accountSessionRevocations.sessionId, auth.sessionId))
      .limit(1);
    if (revoked) throw new UnauthorizedException('session_revoked');
  }

  async revokeAll(userId: string) {
    await this.database.db.execute(sql`
      insert into account_session_revocations (session_id, user_id, revoked_at)
      select id, user_id, now()
      from auth.sessions
      where user_id = ${userId}::uuid
      on conflict (session_id) do update set revoked_at = excluded.revoked_at
    `);
  }
}
