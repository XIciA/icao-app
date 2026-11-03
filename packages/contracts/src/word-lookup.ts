export type WordLookupEntry = { word: string; ipa: string; aviationMeaning: string; generalMeaning: string };
export type WordLookupRelease = { checksum: string; entries: WordLookupEntry[] };

export const WORD_LOOKUP_SCOPE: Record<string, readonly string[]> = {
  listening: ['audioText', 'choices'], sentences900: ['audioText'],
  radiotelephony: ['audioText', 'referenceText'], opi: ['audioText', 'referenceText'], storytelling: ['audioText'],
};

export function normalizeLookupWord(value: string) {
  const trimmed = value.replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, '');
  return /^[A-Za-z]+(?:[’'-][A-Za-z]+)*$/.test(trimmed) ? trimmed.toLocaleLowerCase('en-US') : undefined;
}

export function lookupWords(bankId: string, card: Record<string, unknown>): string[] {
  return (WORD_LOOKUP_SCOPE[bankId] ?? []).flatMap(field => {
    const value = card[field];
    const texts = Array.isArray(value) ? value : [value];
    return texts.flatMap(text => typeof text === 'string'
      ? text.split(/\s+/u).flatMap(token => { const word = normalizeLookupWord(token); return word ? [word] : []; }) : []);
  });
}

export function isWordLookupRelease(value: unknown): value is WordLookupRelease {
  if (!value || typeof value !== 'object') return false;
  const release = value as WordLookupRelease;
  return /^[a-f0-9]{64}$/.test(release.checksum) && Array.isArray(release.entries) && release.entries.length > 0
    && release.entries.every(entry => entry && typeof entry.word === 'string' && normalizeLookupWord(entry.word) === entry.word
      && [entry.ipa, entry.aviationMeaning, entry.generalMeaning].every(text => typeof text === 'string' && text.trim().length > 0))
    && new Set(release.entries.map(entry => entry.word)).size === release.entries.length;
}
