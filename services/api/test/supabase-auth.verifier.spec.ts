import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ApiConfig } from '../src/config';
import { SupabaseAuthVerifier } from '../src/auth/supabase-auth.verifier';

const supabase = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: supabase.createClient,
}));

function token(payload: object) {
  return [
    Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
    Buffer.from(JSON.stringify(payload)).toString('base64url'),
    'verified-by-mocked-supabase',
  ].join('.');
}

function verifier(userMetadata?: Record<string, unknown>, phone?: string) {
  const getUser = vi.fn().mockResolvedValue({
    data: {
      user: {
        id: '11111111-1111-4111-8111-111111111111',
        identities: [{ id: 'apple-subject', provider: 'apple' }],
        phone,
        user_metadata: userMetadata,
      },
    },
    error: null,
  });
  supabase.createClient.mockReturnValueOnce({ auth: { getUser } });
  return {
    getUser,
    verifier: new SupabaseAuthVerifier({
      supabasePublishableKey: 'test-publishable-key-that-is-long-enough',
      supabaseUrl: 'http://127.0.0.1:8000',
    } as ApiConfig),
  };
}

describe('SupabaseAuthVerifier authentication time', () => {
  beforeEach(() => supabase.createClient.mockReset());

  it('uses the persistent AMR timestamp instead of a refreshed JWT iat', async () => {
    const { getUser, verifier: service } = verifier();
    const accessToken = token({
      amr: [{ method: 'oauth', provider: 'apple', timestamp: 1_800_000_000 }],
      iat: 1_800_003_600,
      session_id: '22222222-2222-4222-8222-222222222222',
    });

    await expect(service.verify(accessToken)).resolves.toEqual(expect.objectContaining({
      authenticationMethods: [{ method: 'oauth', provider: 'apple', timestamp: 1_800_000_000 }],
      issuedAt: 1_800_003_600,
    }));
    expect(getUser).toHaveBeenCalledWith(accessToken);
  });

  it('fails recent-auth checks closed by omitting an unusable AMR timestamp', async () => {
    const { verifier: service } = verifier();
    const accessToken = token({
      amr: ['oauth'],
      iat: 1_800_003_600,
      session_id: '22222222-2222-4222-8222-222222222222',
    });

    await expect(service.verify(accessToken)).resolves.toEqual(expect.objectContaining({
      authenticationMethods: [],
      issuedAt: 1_800_003_600,
    }));
  });

  it('preserves separate OAuth and TOTP timestamps for method-specific recent-auth checks', async () => {
    const { verifier: service } = verifier();
    const accessToken = token({
      amr: [
        { method: 'oauth', provider: 'apple', timestamp: 1_800_000_000 },
        { method: 'totp', timestamp: 1_800_003_600 },
      ],
      iat: 1_800_003_600,
      session_id: '22222222-2222-4222-8222-222222222222',
    });

    await expect(service.verify(accessToken)).resolves.toEqual(expect.objectContaining({
      authenticationMethods: [
        { method: 'oauth', provider: 'apple', timestamp: 1_800_000_000 },
        { method: 'totp', timestamp: 1_800_003_600 },
      ],
    }));
  });

  it('uses only a boolean server-verified password marker for first-password setup', async () => {
    const accessToken = token({
      amr: [{ method: 'otp', timestamp: 1_800_003_600 }],
      iat: 1_800_003_600,
      session_id: '22222222-2222-4222-8222-222222222222',
    });
    const { verifier: unset } = verifier({ password_set: false });
    await expect(unset.verify(accessToken)).resolves.toEqual(expect.objectContaining({ passwordSet: false }));

    supabase.createClient.mockReset();
    const { verifier: set } = verifier({ password_set: true });
    await expect(set.verify(accessToken)).resolves.toEqual(expect.objectContaining({ passwordSet: true }));

    supabase.createClient.mockReset();
    const { verifier: malformed } = verifier({ password_set: 'false' });
    await expect(malformed.verify(accessToken)).resolves.toEqual(expect.objectContaining({ passwordSet: undefined }));
  });

  it('normalizes Supabase phone identities before account resolution', async () => {
    const accessToken = token({
      amr: [{ method: 'otp', timestamp: 1_800_003_600 }],
      iat: 1_800_003_600,
      session_id: '22222222-2222-4222-8222-222222222222',
    });
    const { verifier: service } = verifier(undefined, '8613800138000');

    await expect(service.verify(accessToken)).resolves.toEqual(expect.objectContaining({
      user: expect.objectContaining({ phone: '+8613800138000' }),
    }));
  });
});
