import { ForbiddenException, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { normalizeChinaMobile } from '@icao/contracts';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { and, eq } from 'drizzle-orm';

import { API_CONFIG, type ApiConfig } from '../config';
import { accountIdentities } from '../database/schema';
import { DatabaseService } from '../database/database.service';

export type BoundPhoneIdentity = {
  authUserId: string;
  passwordSet: boolean;
  phone: string;
};

/** Resolves the account-owned phone principal independently of the active provider session. */
@Injectable()
export class AccountPhoneIdentityService {
  private readonly adminAuth: SupabaseClient;

  constructor(
    @Inject(API_CONFIG) config: ApiConfig,
    private readonly database: DatabaseService,
  ) {
    this.adminAuth = createClient(config.supabaseUrl, config.supabaseSecretKey, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    });
  }

  async resolve(accountId: string): Promise<BoundPhoneIdentity> {
    const rows = await this.database.db.select({ authUserId: accountIdentities.authUserId })
      .from(accountIdentities)
      .where(and(
        eq(accountIdentities.accountId, accountId),
        eq(accountIdentities.provider, 'phone'),
      ))
      .limit(2);
    // A valid account owns exactly one phone principal. Ambiguity is a security
    // error: never guess which credential is allowed to authorize the action.
    if (rows.length !== 1) throw new ForbiddenException('phone_reauthentication_required');

    const authUserId = rows[0]!.authUserId;
    const { data, error } = await this.adminAuth.auth.admin.getUserById(authUserId);
    if (error) throw new ServiceUnavailableException('phone_auth_unavailable');
    const phone = normalizeChinaMobile(data.user?.phone ?? '');
    if (!phone) throw new ForbiddenException('phone_reauthentication_required');
    return {
      authUserId,
      passwordSet: data.user?.user_metadata?.password_set === true,
      phone,
    };
  }
}
