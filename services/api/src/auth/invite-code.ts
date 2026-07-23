import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const INVITE_CODE_PATTERN = /^[\u3400-\u9fff]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/u;
const RANDOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export type ParsedInviteCode = {
  code: string;
  displayName: string;
};

export function parseInviteCode(value: string): ParsedInviteCode | undefined {
  const code = value.normalize('NFKC').trim().replace(/[\s–—]/gu, '').toUpperCase();
  if (!INVITE_CODE_PATTERN.test(code)) return undefined;
  return { code, displayName: code.slice(0, 4) };
}

export function createInviteCode(displayName: string) {
  const name = displayName.normalize('NFKC').trim();
  if (!/^[\u3400-\u9fff]{4}$/u.test(name)) throw new Error('invalid_invite_display_name');
  const suffix = Array.from(randomBytes(8), (byte) => RANDOM_ALPHABET[byte % RANDOM_ALPHABET.length]).join('');
  return `${name}-${suffix.slice(0, 4)}-${suffix.slice(4)}`;
}

export function inviteCodeLookup(secret: string, code: string) {
  return hmac(secret, `invite-code-lookup:v1\0${code}`);
}

export function inviteSourceLookup(secret: string, source: string) {
  return hmac(secret, `invite-source:v1\0${source}`);
}

export function invitePassword(secret: string, code: string) {
  return `IcaoInvite!${hmac(secret, `invite-password:v1\0${code}`)}`;
}

export function inviteEmail(userId: string) {
  return `invite-${userId}@accounts.feizhuicao.invalid`;
}

export function hashInviteCode(code: string) {
  const salt = randomBytes(16);
  const digest = scryptSync(code, salt, 64);
  return `scrypt$v1$${salt.toString('base64url')}$${digest.toString('base64url')}`;
}

export function verifyInviteCode(code: string, encoded: string) {
  const [algorithm, version, saltValue, digestValue] = encoded.split('$');
  if (algorithm !== 'scrypt' || version !== 'v1' || !saltValue || !digestValue) return false;
  try {
    const expected = Buffer.from(digestValue, 'base64url');
    const actual = scryptSync(code, Buffer.from(saltValue, 'base64url'), expected.length);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

function hmac(secret: string, input: string) {
  return createHmac('sha256', secret).update(input, 'utf8').digest('base64url');
}
