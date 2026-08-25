import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CONTENT_ACCESS_POLICY_VERSION, isFreeQuestionBankCard } from '../packages/contracts/src/index';

type Card = Record<string, unknown> & { id: string };
type Topic = Record<string, unknown> & { id: string; declaredCardCount: number; cards: Card[] };
type Category = Record<string, unknown> & { topics: Topic[] };
type Dataset = Record<string, unknown> & { id: string; categories: Category[] };

const mode = process.argv[2];
if (mode !== 'generate' && mode !== 'check') throw new Error('usage: native-public-question-bank <generate|check>');

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = resolve(repositoryRoot, 'src/features/question-bank/data/question-bank.json');
const outputPath = resolve(repositoryRoot, 'src/features/question-bank/data/question-bank-public.json');
const releasePath = resolve(repositoryRoot, 'src/features/question-bank/data/question-bank-public-release.json');
const source = JSON.parse(readFileSync(sourcePath, 'utf8')) as Dataset[];
const output = source.map((bank) => ({
  ...bank,
  categories: bank.categories.map((category) => ({
    ...category,
    topics: category.topics.map((topic) => {
      const cards = topic.cards.filter((card) => isFreeQuestionBankCard(bank.id, topic.id, card.id));
      return {
        ...topic,
        cards,
        access: {
          level: cards.length >= topic.declaredCardCount ? 'free' : 'member',
          availableCardCount: cards.length,
          declaredCardCount: topic.declaredCardCount,
        },
      };
    }),
  })),
  access: {
    policyVersion: CONTENT_ACCESS_POLICY_VERSION,
    environment: null,
    membershipActive: false,
    membershipExpiresAt: null,
  },
}));
const json = `${JSON.stringify(output, null, 2)}\n`;
const release = `${JSON.stringify({
  policyVersion: CONTENT_ACCESS_POLICY_VERSION,
  checksum: createHash('sha256').update(json).digest('hex'),
}, null, 2)}\n`;

if (mode === 'generate') {
  writeFileSync(outputPath, json);
  writeFileSync(releasePath, release);
} else {
  if (readFileSync(outputPath, 'utf8') !== json || readFileSync(releasePath, 'utf8') !== release) {
    throw new Error('native_public_question_bank_out_of_date');
  }
}

const cardCount = output.reduce((sum, bank) => sum + bank.categories.reduce(
  (categorySum, category) => categorySum + category.topics.reduce((topicSum, topic) => topicSum + topic.cards.length, 0),
  0,
), 0);
console.log(`native_public_question_bank_ok mode=${mode} banks=${output.length} freeCards=${cardCount}`);
