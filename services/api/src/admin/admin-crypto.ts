import { createCipheriv, createDecipheriv, createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const PASSWORD_KEY_LENGTH = 32;
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function derivePassword(password: string, salt: Buffer, keyLength = PASSWORD_KEY_LENGTH) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, keyLength, {
      N: SCRYPT_N,
      r: SCRYPT_R,
      p: SCRYPT_P,
      maxmem: 64 * 1024 * 1024,
    }, (error, derived) => error ? reject(error) : resolve(derived as Buffer));
  });
}

export async function hashOpsPassword(password: string) {
  const salt = randomBytes(16);
  const derived = await derivePassword(password, salt);
  return `scrypt-v1$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

export async function verifyOpsPassword(password: string, encoded: string) {
  const [version, rawN, rawR, rawP, rawSalt, rawHash] = encoded.split('$');
  if (
    version !== 'scrypt-v1'
    || Number(rawN) !== SCRYPT_N
    || Number(rawR) !== SCRYPT_R
    || Number(rawP) !== SCRYPT_P
    || !rawSalt
    || !rawHash
  ) return false;
  const expected = Buffer.from(rawHash, 'base64url');
  if (expected.byteLength !== PASSWORD_KEY_LENGTH) return false;
  const actual = await derivePassword(password, Buffer.from(rawSalt, 'base64url'), expected.byteLength);
  return timingSafeEqual(actual, expected);
}

export function hashOpsSecret(value: string, secret: string, domain: string) {
  return createHmac('sha256', secret).update(`${domain}\0${value}`).digest('hex');
}

export function encryptOpsTotpSecret(secret: string, encryptionKeyBase64: string) {
  const key = Buffer.from(encryptionKeyBase64, 'base64');
  if (key.byteLength !== 32) throw new Error('invalid_ops_totp_encryption_key');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from('icao-ops-totp-v1'));
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
  };
}

export function decryptOpsTotpSecret(
  encrypted: { ciphertext: string; iv: string; tag: string },
  encryptionKeyBase64: string,
) {
  const key = Buffer.from(encryptionKeyBase64, 'base64');
  if (key.byteLength !== 32) throw new Error('invalid_ops_totp_encryption_key');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(encrypted.iv, 'base64'));
  decipher.setAAD(Buffer.from('icao-ops-totp-v1'));
  decipher.setAuthTag(Buffer.from(encrypted.tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

function decodeBase32(value: string) {
  const normalized = value.toUpperCase().replace(/[=\s-]/gu, '');
  let bits = '';
  for (const character of normalized) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index < 0) throw new Error('invalid_totp_secret');
    bits += index.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) {
    bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2));
  }
  return Buffer.from(bytes);
}

export function totpCodeAt(secret: string, at = new Date()) {
  const counter = Math.floor(at.getTime() / 30_000);
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', decodeBase32(secret)).update(message).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary = (
    ((digest[offset]! & 0x7f) << 24)
    | ((digest[offset + 1]! & 0xff) << 16)
    | ((digest[offset + 2]! & 0xff) << 8)
    | (digest[offset + 3]! & 0xff)
  );
  return String(binary % 1_000_000).padStart(6, '0');
}

export function verifyOpsTotp(secret: string, code: string, at = new Date()) {
  return matchingOpsTotpStep(secret, code, at) !== undefined;
}

export function matchingOpsTotpStep(secret: string, code: string, at = new Date()) {
  if (!/^\d{6}$/u.test(code)) return undefined;
  const match = [-30_000, 0, 30_000].find((offset) => {
    const expected = Buffer.from(totpCodeAt(secret, new Date(at.getTime() + offset)));
    const actual = Buffer.from(code);
    return expected.byteLength === actual.byteLength && timingSafeEqual(expected, actual);
  });
  return match === undefined ? undefined : Math.floor((at.getTime() + match) / 30_000);
}

export function createOpsTotpSecret() {
  const bytes = randomBytes(20);
  let bits = [...bytes].map((byte) => byte.toString(2).padStart(8, '0')).join('');
  let result = '';
  while (bits.length > 0) {
    result += BASE32_ALPHABET[Number.parseInt(bits.slice(0, 5).padEnd(5, '0'), 2)];
    bits = bits.slice(5);
  }
  return result;
}

export function createOpsRecoveryCodes(count = 10) {
  return Array.from({ length: count }, () => {
    const value = randomBytes(8).toString('hex').toUpperCase();
    return `${value.slice(0, 4)}-${value.slice(4, 8)}-${value.slice(8, 12)}-${value.slice(12)}`;
  });
}
