import { ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AccountPhoneIdentityService } from '../src/account/account-phone-identity.service';
import type { ApiConfig } from '../src/config';
import type { DatabaseService } from '../src/database/database.service';

const supabase = vi.hoisted(() => ({ createClient: vi.fn() }));

vi.mock('@supabase/supabase-js', () => ({ createClient: supabase.createClient }));

function fixture(rows: Array<{ authUserId: string }>) {
  const getUserById = vi.fn().mockResolvedValue({
    data: {
      user: {
        phone: '8613800138000',
        user_metadata: { password_set: true },
      },
    },
    error: null,
  });
  supabase.createClient.mockReturnValue({ auth: { admin: { getUserById } } });
  const database = {
    db: {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue(rows) })),
        })),
      })),
    },
  } as unknown as DatabaseService;
  const service = new AccountPhoneIdentityService({
    supabaseSecretKey: 'test-secret-key-that-is-long-enough',
    supabaseUrl: 'http://127.0.0.1:8000',
  } as ApiConfig, database);
  return { getUserById, service };
}

describe('AccountPhoneIdentityService', () => {
  beforeEach(() => supabase.createClient.mockReset());

  it('returns the sole account-owned phone principal and its password capability', async () => {
    const authUserId = '10000000-0000-4000-8000-000000000001';
    const { getUserById, service } = fixture([{ authUserId }]);

    await expect(service.resolve('20000000-0000-4000-8000-000000000002')).resolves.toEqual({
      authUserId,
      passwordSet: true,
      phone: '+8613800138000',
    });
    expect(getUserById).toHaveBeenCalledWith(authUserId);
  });

  it('fails closed instead of guessing between ambiguous phone principals', async () => {
    const { getUserById, service } = fixture([
      { authUserId: '10000000-0000-4000-8000-000000000001' },
      { authUserId: '10000000-0000-4000-8000-000000000002' },
    ]);

    await expect(service.resolve('20000000-0000-4000-8000-000000000002'))
      .rejects.toSatisfy((error: unknown) => error instanceof ForbiddenException
        && error.message === 'phone_reauthentication_required');
    expect(getUserById).not.toHaveBeenCalled();
  });
});
