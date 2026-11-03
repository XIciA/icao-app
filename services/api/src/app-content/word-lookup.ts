import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { isWordLookupRelease, lookupWords, type WordLookupRelease } from '@icao/contracts';
import { BadRequestException } from '@nestjs/common';

let cached: WordLookupRelease | undefined;
export function wordLookupRelease(): WordLookupRelease {
  if (cached) return cached;
  const path = [join(__dirname, 'word-lookup.json'), resolve(process.cwd(), '../../content/word-lookup/dataset.json'),
    resolve(process.cwd(), 'content/word-lookup/dataset.json')].find(candidate => existsSync(candidate));
  if (!path) throw new Error('word_lookup_dataset_missing');
  const bytes = readFileSync(path);
  const release = { checksum: createHash('sha256').update(bytes).digest('hex'), entries: JSON.parse(bytes.toString('utf8')).entries };
  if (!isWordLookupRelease(release)) throw new Error('word_lookup_dataset_invalid');
  cached = release;
  return release;
}

export function validateLookupCoverage(bankId: string, cards: Record<string, unknown>[], previous: Record<string, unknown>[]) {
  const oldWords = new Set(previous.flatMap(card => lookupWords(bankId, card)));
  const available = new Set(wordLookupRelease().entries.map(entry => entry.word));
  const missing = [...new Set(cards.filter(card => !card.retired).flatMap(card => lookupWords(bankId, card)))]
    .filter(word => !oldWords.has(word) && !available.has(word));
  if (missing.length) throw new BadRequestException({ message: 'word_lookup_coverage_missing', words: missing });
}
