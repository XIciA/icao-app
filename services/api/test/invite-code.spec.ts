import { describe, expect, it } from 'vitest';

import { createInviteCode, hashInviteCode, inviteCodeLookup, invitePassword, parseInviteCode, verifyInviteCode } from '../src/auth/invite-code';

describe('invite-code', () => {
  const secret = 'test-invite-auth-secret-that-is-long-enough';

  it('accepts the four-character display-name plus two suffix groups', () => {
    expect(parseInviteCode(' 起落平安-7k4m-2q9x ')).toEqual({ code: '起落平安-7K4M-2Q9X', displayName: '起落平安' });
    expect(parseInviteCode('起落平安-7K4M')).toBeUndefined();
    expect(parseInviteCode('起落平-7K4M-2Q9X')).toBeUndefined();
  });

  it('generates a valid code and stores only a verifiable hash', () => {
    const code = createInviteCode('起落平安');
    const parsed = parseInviteCode(code)!;
    const encoded = hashInviteCode(parsed.code);
    expect(code).toMatch(/^起落平安-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(verifyInviteCode(parsed.code, encoded)).toBe(true);
    expect(verifyInviteCode('起落平安-AAAA-AAAA', encoded)).toBe(false);
  });

  it('uses a stable secret-derived lookup and internal password', () => {
    const code = '起落平安-7K4M-2Q9X';
    expect(inviteCodeLookup(secret, code)).toBe(inviteCodeLookup(secret, code));
    expect(invitePassword(secret, code)).toBe(invitePassword(secret, code));
    expect(inviteCodeLookup(secret, code)).not.toBe(inviteCodeLookup(secret, '起落平安-7K4M-2Q9Y'));
  });
});
