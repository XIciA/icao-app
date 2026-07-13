import { Injectable } from '@nestjs/common';
import type { VocabularyDataset, VocabularyRelease } from '@icao/contracts';
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

@Injectable()
export class VocabularyService {
  private readonly release: VocabularyRelease;

  constructor() {
    const bytes = readFileSync(datasetPath());
    const dataset = JSON.parse(bytes.toString('utf8')) as VocabularyDataset;
    if (dataset.schemaVersion !== 1 || dataset.books.length !== 3) throw new Error('invalid_vocabulary_dataset');
    this.release = {
      version: dataset.version,
      checksum: createHash('sha256').update(bytes).digest('hex'),
      dataset,
    };
  }

  get() {
    return this.release;
  }
}
