import { describe, expect, it } from 'vitest';
import { normalizeAviationTranscript as normalize, normalizeAviationTranscriptDetailed } from '../src/ai/aviation-transcript-normalization';

describe('conservative aviation presentation', () => {
  it.each([
    ['Maintaining flight level 310.', 'Maintaining FL310.'],
    ['maintain fl 090', 'maintain FL090'],
    ['flight level two niner zero', 'FL290'],
    ['Q N H one zero one three', 'QNH 1013'],
    ['QFE one zero zero seven', 'QFE 1007'],
    ['heading one eight zero', 'heading 180'],
    ['squawk zero four two one', 'squawk 0421'],
    ['runway zero nine left', 'runway 09 left'],
    ['C P D L C and R V S M', 'CPDLC and RVSM'],
    ['I.L.S. approach, D M E available', 'ILS. approach, DME available'],
    ['Unable tcas R A, request ambulance.', 'Unable TCAS R A, request ambulance.'],
  ])('formats only explicit notation: %s', (input, expected) => {
    expect(normalize(input)).toBe(expected);
    expect(normalize(expected)).toBe(expected);
  });

  it.each([
    'Enable RVSM due to equipment.', 'Unable RVSM due to equipment.',
    'will go', 'flight label 310', 'we has an engine failure',
    'nine thousand or 100 feet', 'contact approach on 12835',
    'QNH two niner niner two', // No invented decimal placement.
    'flight level tree fife zero', 'flight level two',
    'flight level 310.5', 'flight level two nine zero point five',
    'flight level two nine zero thousand', 'flight level 31 0',
    'flight level two nine zero oh', 'flight level two nine zero 1',
    'flight level one two three four', 'squawk eight nine zero one',
    'turn left', 'turn right', 'do not descend', 'we did not say unable',
    'Air China nine a one', 'KODAP or KODAB', 'radial radio',
    'Q and H', 'VOR R', 'there is a tree',
  ])('preserves uncertain or erroneous speech: %s', (input) => {
    const expected = input === 'QNH two niner niner two' ? 'QNH 2992' : input;
    expect(normalize(input)).toBe(expected);
  });

  it('retains every digit, leading zero, polarity and direction over all three-digit flight levels', () => {
    for (let i = 0; i < 1000; i++) {
      const n = String(i).padStart(3, '0');
      expect(normalize(`Unable flight level ${n}, do not turn right.`)).toBe(`Unable FL${n}, do not turn right.`);
    }
  });

  it('keeps a reversible ordered trace and never mutates the input', () => {
    const input = 'We has Q N H one zero one three and flight level 310.';
    const result = normalizeAviationTranscriptDetailed(input);
    let restored = result.transcript;
    for (const change of [...result.transformations].reverse()) {
      expect(restored).toBe(change.after);
      restored = change.before;
    }
    expect(restored).toBe(input);
    expect(result.transcript).toBe('We has QNH 1013 and FL310.');
    expect(result.version).toBe('aviation-normalization:conservative-v1');
    expect(normalizeAviationTranscriptDetailed(result.transcript).transformations).toEqual([]);
  });
});
