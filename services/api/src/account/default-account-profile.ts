import { randomInt } from 'node:crypto';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DIGITS = '0123456789';
const ALPHANUMERIC = LETTERS + DIGITS;

/** Generated once on account creation, then owned by the normal editable profile document. */
export function createDefaultAccountProfile() {
  const suffix = [LETTERS[randomInt(LETTERS.length)], DIGITS[randomInt(DIGITS.length)],
    ALPHANUMERIC[randomInt(ALPHANUMERIC.length)], ALPHANUMERIC[randomInt(ALPHANUMERIC.length)]];
  for (let i = suffix.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [suffix[i], suffix[j]] = [suffix[j], suffix[i]];
  }
  return { displayName: `飞行员${suffix.join('')}`, avatarUri: null, target: 'icao4-first' as const };
}
