import { describe, expect, it } from 'vitest';
import { lookupWords, normalizeLookupWord } from '@icao/contracts';
import { validateLookupCoverage, wordLookupRelease } from './word-lookup';

describe('question content dictionary delivery', () => {
  it('serves the validated authored dictionary from the same source as publication checks', () => {
    expect(wordLookupRelease().entries.find(entry => entry.word === 'descent')).toBeDefined();
    expect(wordLookupRelease().checksum).toMatch(/^[a-f0-9]{64}$/);
  });
  it('rejects a new uncovered word and preserves unrelated legacy content', () => {
    expect(() => validateLookupCoverage('opi', [{ audioText: 'newuncoveredword' }], [])).toThrow('word_lookup_coverage_missing');
    expect(() => validateLookupCoverage('opi', [{ audioText: 'newuncoveredword descent' }], [{ audioText: 'newuncoveredword' }])).not.toThrow();
    expect(() => validateLookupCoverage('listening', [{ audioText: 'descent', referenceText: 'newuncoveredword' }], [])).not.toThrow();
  });
  it('keeps extraction and runtime word boundaries identical', () => {
    expect(lookupWords('listening', { audioText: 'Descend, A320', choices: ["I'm ready."], referenceText: 'exclude' })).toEqual(['descend', "i'm", 'ready']);
    expect(normalizeLookupWord('A320')).toBeUndefined();
  });
});
