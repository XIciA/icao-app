import { Inject, Injectable } from '@nestjs/common';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { API_CONFIG, type ApiConfig } from '../config';

export const ACCOUNT_AUTH_ADMIN = Symbol('ACCOUNT_AUTH_ADMIN');

export type AccountAuthAdmin = {
  deleteUser(authUserId: string): Promise<void>;
};

export class AccountAuthAdminError extends Error {
  constructor() {
    super('auth_user_delete_failed');
  }
}

@Injectable()
export class SupabaseAccountAuthAdmin implements AccountAuthAdmin {
  private readonly client: SupabaseClient;

  constructor(@Inject(API_CONFIG) config: ApiConfig) {
    this.client = createClient(config.supabaseUrl, config.supabaseSecretKey, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    });
  }

  async deleteUser(authUserId: string) {
    const { error } = await this.client.auth.admin.deleteUser(authUserId, false);
    if (!error) return;
    if (error.code === 'user_not_found' || error.status === 404) return;
    throw new AccountAuthAdminError();
  }
}
