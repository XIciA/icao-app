import type { ExactMatchResult, ExactMatchToken } from '@icao/contracts';

function tokens(value: string) {
  return value.toLocaleLowerCase().match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) ?? [];
}

export function exactMatch(expectedText: string, actualText: string): ExactMatchResult {
  const expected = tokens(expectedText);
  const actual = tokens(actualText);
  const rows = Array.from({ length: expected.length + 1 }, () => Array(actual.length + 1).fill(0) as number[]);
  for (let i = expected.length - 1; i >= 0; i -= 1) {
    for (let j = actual.length - 1; j >= 0; j -= 1) {
      rows[i][j] = expected[i] === actual[j] ? rows[i + 1][j + 1] + 1 : Math.max(rows[i + 1][j], rows[i][j + 1]);
    }
  }
  const differences: ExactMatchToken[] = [];
  let i = 0; let j = 0;
  while (i < expected.length || j < actual.length) {
    if (expected[i] === actual[j]) { i += 1; j += 1; continue; }
    if (i < expected.length && j < actual.length && rows[i + 1][j] === rows[i][j + 1]) {
      differences.push({ operation: 'replace', expected: expected[i], actual: actual[j], expectedIndex: i, actualIndex: j }); i += 1; j += 1;
    } else if (j < actual.length && (i >= expected.length || rows[i][j + 1] >= rows[i + 1][j])) {
      differences.push({ operation: 'extra', actual: actual[j], actualIndex: j }); j += 1;
    } else {
      differences.push({ operation: 'missing', expected: expected[i], expectedIndex: i }); i += 1;
    }
  }
  const sameBag = expected.length === actual.length && [...expected].sort().join('\0') === [...actual].sort().join('\0');
  const normalizedDifferences = sameBag && differences.length
    ? differences.map((item) => ({ ...item, operation: 'order' as const }))
    : differences;
  return {
    exact: normalizedDifferences.length === 0,
    differences: normalizedDifferences,
    summary: {
      missing: normalizedDifferences.filter((item) => item.operation === 'missing').length,
      extra: normalizedDifferences.filter((item) => item.operation === 'extra').length,
      replace: normalizedDifferences.filter((item) => item.operation === 'replace').length,
      order: normalizedDifferences.filter((item) => item.operation === 'order').length,
    },
  };
}
