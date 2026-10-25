import { Injectable } from '@nestjs/common';
import type { VocabularyDataset, VocabularyRelease } from '@icao/contracts';
import { validateVocabularyCatalog } from '@icao/contracts';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

function datasetPath() {
  const candidates = [
    join(__dirname, 'dataset.json'),
    resolve(process.cwd(), '../../content/vocabulary/dataset.json'),
    resolve(process.cwd(), 'content/vocabulary/dataset.json'),
  ];
  const path = candidates.find((candidate) => existsSync(candidate));
  if (!path) throw new Error('vocabulary_dataset_missing');
  return path;
}

function coreBookPath() {
  const candidates = [join(__dirname, 'question-bank-core.json'), resolve(process.cwd(), '../../content/vocabulary/question-bank-core/book.json'), resolve(process.cwd(), 'content/vocabulary/question-bank-core/book.json')];
  const path = candidates.find(candidate => existsSync(candidate));
  if (!path) throw new Error('question_bank_vocabulary_missing');
  return path;
}

@Injectable()
export class VocabularyService {
  private readonly release: VocabularyRelease;
  private readonly expandedRelease: VocabularyRelease;

  constructor() {
    const bytes = readFileSync(datasetPath());
    const dataset = JSON.parse(bytes.toString('utf8')) as VocabularyDataset;
    validateVocabularyCatalog(dataset);
    this.release = {
      version: dataset.version,
      checksum: createHash('sha256').update(bytes).digest('hex'),
      dataset,
    };
    const core = JSON.parse(readFileSync(coreBookPath(), 'utf8')) as VocabularyDataset['books'][number];
    const expanded: VocabularyDataset = {
      ...dataset,
      version: 2,
      source: { ...dataset.source, name: `${dataset.source.name} + 全题库高频核心词`, generatedAt: '2026-10-25T00:00:00.000Z', sourceRows: dataset.source.sourceRows + core.words.length, validRows: dataset.source.validRows + core.words.length },
      books: [...dataset.books, core],
    };
    validateVocabularyCatalog(expanded);
    this.expandedRelease = { version: expanded.version, checksum: createHash('sha256').update(JSON.stringify(expanded)).digest('hex'), dataset: expanded };
  }

  get(catalog?: string) {
    // Old clients validate exactly three books. Their response and ETag stay unchanged.
    return catalog === 'question-bank-core' ? this.expandedRelease : this.release;
  }
}
