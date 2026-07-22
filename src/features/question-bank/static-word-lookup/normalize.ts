const ENGLISH_WORD = /^[A-Za-z]+(?:[’'-][A-Za-z]+)*$/;

/**
 * Keeps the runtime lookup boundary identical to the content extraction rule.
 * Number-bearing callsigns and malformed joined tokens are intentionally not
 * treated as dictionary words.
 */
export function normalizeStaticLookupWord(value: string) {
  const trimmed = value.replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, '');
  return ENGLISH_WORD.test(trimmed) ? trimmed.toLocaleLowerCase('en-US') : undefined;
}
