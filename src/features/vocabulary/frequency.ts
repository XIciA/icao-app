import type { VocabularyFrequency } from '@icao/contracts';

export function vocabularyFrequencyLabel(frequency?: VocabularyFrequency) {
  if (!frequency) return undefined;
  const count = frequency.occurrences;
  if (!Number.isInteger(count) || count < 0) return undefined;
  const band = [10000, 5000, 2000, 1000, 500, 300, 200, 100, 50, 40, 30, 20, 10].find(value => count >= value) ?? 5;
  // Product bands intentionally put zero and rare entries into the same 5+ tier.
  return `词频档位 ${band}+`;
}

export function vocabularyFrequencyBadge(frequency?: VocabularyFrequency) {
  const label = vocabularyFrequencyLabel(frequency);
  return label?.replace('词频档位 ', '');
}
