import { Injectable } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const capabilityFiles = {
  word: 'capabilities/word-lookup-v1.md',
} as const;

const domainFiles = [
  'domain/aviation-terminology.md',
  'domain/aviation-hotwords.md',
  'domain/aviation-number-readings.md',
  'domain/aviation-phrasebook.md',
  'domain/sentence900-ai-corpus.md',
  'shared/output-quality-rules-v1.md',
] as const;

@Injectable()
export class AiAssetsService {
  private readonly cache = new Map<string, Promise<string>>();

  private read(path: string) {
    let cached = this.cache.get(path);
    if (!cached) {
      cached = readFile(join(__dirname, 'assets', path), 'utf8');
      this.cache.set(path, cached);
    }
    return cached;
  }

  async promptRules(capability: keyof typeof capabilityFiles, terms: string[]) {
    const capabilityRules = await this.read(capabilityFiles[capability]);
    const documents = await Promise.all(domainFiles.map((path) => this.read(path)));
    const needles = terms.flatMap((term) => term.toLocaleLowerCase().split(/\s+/)).filter(Boolean);
    const selected = documents.flatMap((document) => {
      const blocks = document.split(/\n(?=##?\s)/);
      const matches = blocks.filter((block) => needles.some((needle) => block.toLocaleLowerCase().includes(needle)));
      return (matches.length ? matches : blocks.slice(0, 1)).slice(0, 5);
    });
    return `${capabilityRules}\n\n# Selected civil aviation language assets\n${selected.join('\n\n')}`.slice(0, 24_000);
  }
}
