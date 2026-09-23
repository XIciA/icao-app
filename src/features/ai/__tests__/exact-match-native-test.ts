import { exactMatch } from '../exact-match.native';

it.each([
  ['Contact 118.5', 'Contact 118 5'], ['Contact 118.5', 'Contact 1185'],
  ['Turn left', 'Turn right'], ['Do not climb', 'Do climb'], ['Report position', 'Reports position'],
  ['Heading two seven zero', 'Heading to seven zero'],
])('does not normalize away a significant difference: %s / %s', (expected, actual) => {
  expect(exactMatch(expected, actual).exact).toBe(false);
});
it('uses the same conservative aviation normalization on both sides', () => {
  expect(exactMatch('Maintain FL310, QNH 1013.', 'Maintain flight level three one zero Q N H one zero one three').exact).toBe(true);
});
it('detects moved words even when extra words coexist', () => {
  const result = exactMatch('Contact tower now', 'Tower contact please now');
  expect(result.summary).toEqual({ order: 1, extra: 1, missing: 0, replace: 0 });
});
it('matches repeated words one-to-one', () => {
  expect(exactMatch('Report report position', 'Report position').summary.missing).toBe(1);
  expect(exactMatch('Report position', 'Report report position').summary.extra).toBe(1);
});

it('maps normalized differences back to exact original text spans', () => {
  const expected = 'Maintain flight level three one zero.';
  const actual = 'Maintain FL320.';
  const result = exactMatch(expected, actual);
  expect(result.differences).toHaveLength(1);
  const difference = result.differences[0];
  expect(difference.expectedSource?.text).toBe('flight level three one zero');
  expect(difference.actualSource?.text).toBe('FL320');
  expect(expected.slice(difference.expectedSource!.start, difference.expectedSource!.end)).toBe(difference.expectedSource!.text);
});
it('bounds pathological edited input before allocating the alignment matrix', () => {
  expect(() => exactMatch('hello', 'word '.repeat(2000))).toThrow('ai_input_too_long');
});
