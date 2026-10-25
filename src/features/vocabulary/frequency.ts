import type { VocabularyFrequency } from '@icao/contracts';

export function vocabularyFrequencyLabel(frequency?: VocabularyFrequency) {
  if (!frequency) return undefined;
  const count = frequency.occurrences;
  if (!Number.isInteger(count) || count < 0) return undefined;
  if (count === 0) return '题库原文未检出';
  const band = [1000, 500, 200, 100, 50, 10].find(value => count >= value);
  return `题库原文 ${band ? `${band}+` : count}次`;
}
