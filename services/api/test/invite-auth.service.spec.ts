import { describe, expect, it, vi } from 'vitest';

import { InviteAuthService } from '../src/auth/invite-auth.service';
import type { SessionSecurityService } from '../src/auth/session-security.service';
import type { ApiConfig } from '../src/config';
import type { DatabaseService } from '../src/database/database.service';

const config = {
  supabaseUrl: 'http://127.0.0.1:8000',
  supabasePublishableKey: 'test-publishable-key-that-is-long-enough',
  supabaseSecretKey: 'test-secret-key-that-is-long-enough',
} as ApiConfig;

function serviceWithInviteRows(rows: { status: string }[]) {
  const limit = vi.fn().mockResolvedValue(rows);
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  const database = { db: { select } } as unknown as DatabaseService;
  const sessions = {} as SessionSecurityService;
  return new InviteAuthService(database, sessions, config);
}

describe('InviteAuthService account access', () => {
  it('allows a Supabase phone account that has no legacy invite row', async () => {
    await expect(serviceWithInviteRows([]).assertAccountAccess('phone-user')).resolves.toBeUndefined();
  });

  it('allows an active legacy invite account', async () => {
    await expect(serviceWithInviteRows([{ status: 'active' }]).assertAccountAccess('invite-user')).resolves.toBeUndefined();
  });

  it('rejects a disabled legacy invite account', async () => {
    await expect(serviceWithInviteRows([{ status: 'disabled' }]).assertAccountAccess('invite-user'))
      .rejects.toMatchObject({ message: 'invite_account_disabled' });
  });
});
