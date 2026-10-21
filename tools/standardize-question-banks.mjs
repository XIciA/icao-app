import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatText, lexicalSignature, reorder, textFields } from './question-bank-format.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'content/question-banks');
const recordRoot = join(root, 'docs/records/workstreams/question-bank-standardization-20261022');
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const write = (path, value) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`); };
const sha = text => createHash('sha256').update(text).digest('hex');

export function run() {
  const changes = [], orders = [], accepted = {}, summary = {};
  const registry = read(join(source, 'registry.json'));
  assert(registry.releaseVersion < 26, 'format_release_already_applied_do_not_reshuffle');
  for (const bankId of registry.bankIds) {
    const directory = join(source, 'banks', bankId);
    const bank = read(join(directory, 'bank.json'));
    let changedCards = 0, cards = 0;
    const update = (value, context) => {
      const after = formatText(value, context);
      assert(after.length > 0, `empty_text:${context.cardId}:${context.field}`);
      assert.equal(lexicalSignature(value, context), lexicalSignature(after, context), `lexical_change:${context.cardId}:${context.field}`);
      assert.equal(formatText(after, context), after, `non_idempotent:${context.cardId}:${context.field}`);
      if (after !== value) {
        changes.push({ ...context, before: value, after, beforeSha256: sha(value), afterSha256: sha(after) });
        const key = `${context.cardId ?? context.topicId}#${context.field}`;
        (accepted[key] ??= []).push(sha(after));
      }
      return after;
    };
    for (const categoryId of bank.categoryIds) {
      const categoryPath = join(directory, 'categories', `${categoryId}.json`);
      const category = read(categoryPath);
      for (const topicId of category.topicIds) {
        const path = join(directory, 'topics', `${topicId}.json`);
        const topic = read(path);
        for (const card of topic.cards) {
          const start = changes.length;
          for (const field of textFields) {
            const context = { bankId, categoryId, topicId, cardId: card.id, field };
            if (typeof card[field] === 'string') card[field] = update(card[field], context);
            else if (Array.isArray(card[field])) card[field] = card[field].map((text, choiceIndex) => update(text, { ...context, choiceIndex }));
          }
          // Reported exam variants are question text too; preserve association keys.
          for (const [hotspotId, prompts] of Object.entries(card.reportedPrompts ?? {})) {
            card.reportedPrompts[hotspotId] = prompts.map((text, promptIndex) => update(text, { bankId, categoryId, topicId, cardId: card.id, field: 'audioText', hotspotId, promptIndex }));
          }
          if (bankId === 'listening' && /^正确答案：[A-D]\.\s*/u.test(card.referenceText ?? '')) {
            const before = card.referenceText;
            const after = `正确答案：${String.fromCharCode(65 + card.correctChoiceIndex)}. ${card.choices[card.correctChoiceIndex]}`;
            assert.equal(lexicalSignature(before, { bankId, field: 'referenceText' }), lexicalSignature(after, { bankId, field: 'referenceText' }));
            if (before !== after) {
              changes.push({ bankId, categoryId, topicId, cardId: card.id, field: 'referenceText', before, after, beforeSha256: sha(before), afterSha256: sha(after) });
              (accepted[`${card.id}#referenceText`] ??= []).push(sha(after));
              card.referenceText = after;
            }
          }
          if (changes.length > start) changedCards += 1;
          cards += 1;
        }
        // Radiotelephony cards are sequential questions in a scenario. Move
        // scenarios via category.topicIds, never the questions inside them.
        if (bankId !== 'radiotelephony' && !topic.cards.some(card => card.kind === 'image')) {
          const before = topic.cards.map(card => card.id);
          topic.cards = reorder(topic.cards, `${bankId}/${categoryId}/${topicId}`);
          orders.push({ bankId, categoryId, topicId, unit: 'cards', before, after: topic.cards.map(card => card.id) });
        }
        write(path, topic);
      }
      if (bankId === 'radiotelephony' || bankId === 'opi') {
        const before = category.topicIds;
        category.topicIds = reorder(before, `${bankId}/${categoryId}`);
        orders.push({ bankId, categoryId, unit: 'topics', before, after: category.topicIds });
        write(categoryPath, category);
      }
    }
    summary[bankId] = { cards, changedCards };
  }
  registry.releaseVersion = 26;
  registry.releasedAt = '2026-10-21T19:02:07.000Z';
  write(join(source, 'registry.json'), registry);
  write(join(recordRoot, 'text-changes.json'), { schemaVersion: 1, changes });
  write(join(recordRoot, 'order-changes.json'), { schemaVersion: 1, orders });
  write(join(recordRoot, 'accepted-format.json'), { schemaVersion: 1, fields: accepted });
  write(join(recordRoot, 'summary.json'), { schemaVersion: 1, releaseVersion: 26, summary, textChanges: changes.length, reorderedGroups: orders.filter(order => order.before.length > 1).length });
  console.log(JSON.stringify({ summary, textChanges: changes.length, groups: orders.length }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) run();
