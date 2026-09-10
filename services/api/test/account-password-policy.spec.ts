import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isValidPhonePassword } from '@icao/contracts/native-auth';
import { updatePhonePasswordSchema } from '../src/account/account.schemas';
import { passwordRecentAuthSchema } from '../src/auth/recent-auth.schemas';

describe('Native phone password policy', () => {
  it.each([
    ['Abcde12', false], ['Abcdef12', true], [`${'a'.repeat(31)}1`, true],
    [`${'a'.repeat(32)}1`, false], ['abcdefgh', false], ['12345678', false],
    [`A1${'😀'.repeat(30)}`, true], [`A1${'😀'.repeat(31)}`, false],
  ])('agrees between new-password API and client for %s', (password, accepted) => {
    expect(isValidPhonePassword(password)).toBe(accepted);
    expect(updatePhonePasswordSchema.safeParse({ password }).success).toBe(accepted);
  });

  it('continues to accept a longer existing password as current-password proof', () => {
    const existingPassword = `${'a'.repeat(63)}1`;
    expect(updatePhonePasswordSchema.safeParse({ password: 'Newpass8', currentPassword: existingPassword }).success).toBe(true);
    expect(passwordRecentAuthSchema.safeParse({ password: existingPassword, purpose: 'account_delete' }).success).toBe(true);
  });

  it.each(['aliyun-sms', 'testflight'])('keeps the %s provider below the app-owned length and resend rules', (overlay) => {
    const text = readFileSync(resolve(__dirname, `../../../infra/supabase/docker-compose.${overlay}.yml`), 'utf8');
    expect(text).toContain('GOTRUE_PASSWORD_MIN_LENGTH: "8"');
    expect(text).toContain('GOTRUE_SMS_MAX_FREQUENCY: "1s"');
    expect(text).toContain('GOTRUE_PASSWORD_REQUIRED_CHARACTERS:');
  });
});
