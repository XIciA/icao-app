import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { lexicalSignature, textFields } from './question-bank-format.mjs';
import { prepareNativeContentRelease } from '../services/api/scripts/native-content-release.mjs';

const root = new URL('../', import.meta.url);
const read = path => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
const proofPath = 'docs/records/workstreams/question-bank-standardization-20261022/identity-proofs.json';
const resources = read('content/question-banks/resources/manifest.source.json');
const sourceBanks = read('src/features/question-bank/data/question-bank.json');
const release = prepareNativeContentRelease(
  { schemaVersion: 1, banks: sourceBanks.map(bank => ({ id: bank.id })) },
  resources,
  new Map(sourceBanks.map(bank => [bank.id, bank])),
  26,
);
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  return value;
}
function proof(bank) {
  const dependentSequences = bank.categories.flatMap(category => category.topics
    .filter(topic => bank.id === 'radiotelephony' || topic.cards.some(card => card.kind === 'image'))
    .map(topic => [topic.id, topic.cards.map(card => card.id)]))
    .sort((a, b) => a[0].localeCompare(b[0]));
  const tuples = bank.categories.flatMap(category => category.topics.flatMap(topic => topic.cards.map(card => {
    const content = { ...card };
    delete content.audioDurationSeconds;
    for (const field of textFields) {
      if (typeof content[field] === 'string') content[field] = lexicalSignature(content[field], { bankId: bank.id, field });
      else if (Array.isArray(content[field])) content[field] = content[field].map(text => lexicalSignature(text, { bankId: bank.id, field }));
    }
    if (content.reportedPrompts) content.reportedPrompts = Object.fromEntries(Object.entries(content.reportedPrompts).map(([id, prompts]) => [id, prompts.map(text => lexicalSignature(text, { bankId: bank.id, field: 'audioText' }))]));
    return { categoryId: category.id, topicId: topic.id, content };
  }))).sort((a, b) => a.content.id.localeCompare(b.content.id));
  return { cards: tuples.length, checksum: createHash('sha256').update(JSON.stringify(stable(tuples))).digest('hex'), dependentSequenceChecksum: createHash('sha256').update(JSON.stringify(dependentSequences)).digest('hex') };
}
if (process.argv.includes('--record-live-baseline')) {
  const live = read('.generated/standardization/live-before.json');
  const proofs = Object.fromEntries(live.map(bank => [bank.bankId, proof(bank.payload)]));
  writeFileSync(new URL(proofPath, root), `${JSON.stringify({ schemaVersion: 1, proofs }, null, 2)}\n`);
}
const { proofs } = read(proofPath);
for (const bank of release.banks) assert.deepEqual(proof(bank.payload), proofs[bank.id], `identity_media_or_lexical_change:${bank.id}`);
const orders = read('docs/records/workstreams/question-bank-standardization-20261022/order-changes.json').orders;
for (const order of orders) {
  assert.deepEqual([...order.before].sort(), [...order.after].sort());
  if (order.before.length > 1) assert(order.after.every((id, index) => id !== order.before[index]), `fixed_position:${order.topicId ?? order.categoryId}`);
}
console.log('format_invariants_ok banks=5 cards=10900 identity_media_answers_scopes_and_lexical_content_preserved');
