import type { ExactMatchResult, ExactMatchToken } from '@icao/contracts';
import { normalizeAviationTranscriptWithSource } from '@icao/contracts/aviation-transcript-normalization';

function tokens(text: string) {
  if (text.length > 12000) throw new Error('ai_input_too_long');
  const normalized = normalizeAviationTranscriptWithSource(text);
  const result = [...normalized.transcript.matchAll(/[\p{L}\p{N}]+(?:\.\d+)?(?:['’\-][\p{L}\p{N}]+)*/gu)].map((match) => {
    const spans = normalized.sourceSpans.slice(match.index, match.index + match[0].length);
    const start = spans[0].start; const end = spans.at(-1)!.end;
    return { value: match[0].toLowerCase().replace(/’/gu, "'"), source: { start, end, text: text.slice(start, end) } };
  });
  if (result.length > 1500) throw new Error('ai_input_too_long');
  return result;
}

/** LCS first, then pair moved words before pairing substitutions. Repeats stay one-to-one. */
export function exactMatch(expectedText: string, actualText: string): ExactMatchResult {
  const expectedTokens = tokens(expectedText); const actualTokens = tokens(actualText);
  const expected = expectedTokens.map((token) => token.value); const actual = actualTokens.map((token) => token.value);
  const rows = Array.from({ length: expected.length + 1 }, () => new Uint16Array(actual.length + 1));
  for (let i = expected.length - 1; i >= 0; i--) for (let j = actual.length - 1; j >= 0; j--) {
    rows[i][j] = expected[i] === actual[j] ? rows[i + 1][j + 1] + 1 : Math.max(rows[i + 1][j], rows[i][j + 1]);
  }
  const missing: number[] = []; const extra: number[] = [];
  let i = 0; let j = 0;
  while (i < expected.length || j < actual.length) {
    if (i < expected.length && j < actual.length && expected[i] === actual[j]) { i++; j++; }
    else if (j < actual.length && (i >= expected.length || rows[i][j + 1] >= rows[i + 1][j])) extra.push(j++);
    else missing.push(i++);
  }
  const differences: ExactMatchToken[] = [];
  const moved = new Set<number>();
  for (const expectedIndex of missing) {
    const match = extra.find((actualIndex) => !moved.has(actualIndex) && actual[actualIndex] === expected[expectedIndex]);
    if (match !== undefined) {
      moved.add(match);
      differences.push({ operation: 'order', expected: expected[expectedIndex], actual: actual[match], expectedIndex, actualIndex: match });
    }
  }
  const movedExpected = new Set(differences.map((entry) => entry.expectedIndex));
  const absent = missing.filter((index) => !movedExpected.has(index));
  const added = extra.filter((index) => !moved.has(index));
  // Only pair replacements between the same neighboring unchanged tokens.
  // Otherwise unrelated distant omissions/additions would be mislabeled as a correction.
  const aligned = new Map<number, number>();
  i = 0; j = 0;
  const missingSet = new Set(missing); const extraSet = new Set(extra);
  while (i < expected.length && j < actual.length) {
    if (missingSet.has(i)) { i++; continue; }
    if (extraSet.has(j)) { j++; continue; }
    aligned.set(i++, j++);
  }
  const consumed = new Set<number>();
  for (const expectedIndex of absent) {
    const anchors = [...aligned].filter(([index]) => index < expectedIndex);
    const left = anchors.at(-1)?.[1] ?? -1;
    const right = [...aligned].find(([index]) => index > expectedIndex)?.[1] ?? actual.length;
    const actualIndex = added.find((index) => !consumed.has(index) && index > left && index < right);
    if (actualIndex !== undefined) { consumed.add(actualIndex); differences.push({ operation: 'replace', expected: expected[expectedIndex], actual: actual[actualIndex], expectedIndex, actualIndex }); }
    else differences.push({ operation: 'missing', expected: expected[expectedIndex], expectedIndex });
  }
  for (const actualIndex of added) if (!consumed.has(actualIndex)) differences.push({ operation: 'extra', actual: actual[actualIndex], actualIndex });
  for (const difference of differences) {
    if (difference.expectedIndex !== undefined) difference.expectedSource = expectedTokens[difference.expectedIndex].source;
    if (difference.actualIndex !== undefined) difference.actualSource = actualTokens[difference.actualIndex].source;
  }
  differences.sort((a, b) => (a.expectedIndex ?? a.actualIndex ?? 0) - (b.expectedIndex ?? b.actualIndex ?? 0));
  return { exact: differences.length === 0, differences, summary: {
    missing: differences.filter((d) => d.operation === 'missing').length,
    extra: differences.filter((d) => d.operation === 'extra').length,
    replace: differences.filter((d) => d.operation === 'replace').length,
    order: differences.filter((d) => d.operation === 'order').length,
  } };
}
