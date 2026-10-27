// Offline planner only. Publication stays with the existing content-order workflow.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export function prepareDisplayTitleDelta(sources, topicChanges, cardChanges) {
  if (!Array.isArray(sources.banks)) throw new Error('expected_content_order_sources');
  const topics = new Map(), cards = new Map(), copies = new Map();
  const report = { changed: [], alreadyApplied: [], conflicts: [], baselines: [] };
  for (const bank of sources.banks) {
    if (!bank.bankId || bank.payload?.id !== bank.bankId || !/^[a-f0-9]{64}$/.test(bank.checksum) || copies.has(bank.bankId)) throw new Error('invalid_bank_baseline');
    const payload = structuredClone(bank.payload); copies.set(bank.bankId, payload);
    report.baselines.push({ bankId: bank.bankId, version: bank.version, checksum: bank.checksum });
    for (const category of payload.categories) for (const topic of category.topics) {
      if (topics.has(topic.id)) throw new Error('duplicate_topic_identity');
      topics.set(topic.id, { bankId: bank.bankId, object: topic });
      for (const card of topic.cards) {
        if (cards.has(card.id)) throw new Error('duplicate_card_identity');
        cards.set(card.id, { bankId: bank.bankId, object: card });
      }
    }
  }
  function apply(index, id, field, before, after) {
    const target = index.get(id);
    if (typeof before !== 'string' || typeof after !== 'string' || !after.trim()) throw new Error('invalid_approved_title_change');
    const item = { id, field, before, after, ...(target ? { bankId: target.bankId } : {}) };
    if (!target) { report.conflicts.push({ ...item, reason: 'missing_identity' }); return; }
    const current = target.object[field];
    if (current === after) { report.alreadyApplied.push(item); return; }
    if (current !== before) { report.conflicts.push({ ...item, current, reason: 'live_field_changed' }); return; }
    target.object[field] = after; report.changed.push(item);
  }
  for (const change of topicChanges) apply(topics, change.id, 'name', change.before, change.after);
  for (const [key, change] of Object.entries(cardChanges)) {
    const split = key.lastIndexOf('#'), id = key.slice(0, split), field = key.slice(split + 1);
    if (split < 1 || !['taskTitle', 'imageAlt'].includes(field)) throw new Error('unapproved_display_field');
    apply(cards, id, field, change.before, change.after);
  }
  // Undo exactly the approved changes and demand deep equality to the full live input.
  // This protects unknown/new fields, IDs/order, audio, text, scope and later additions.
  const restored = new Map([...copies].map(([id, payload]) => [id, structuredClone(payload)]));
  for (const change of report.changed) {
    const bank = restored.get(change.bankId);
    for (const category of bank.categories) for (const topic of category.topics) {
      if (change.field === 'name' && topic.id === change.id) topic.name = change.before;
      else for (const card of topic.cards) if (card.id === change.id) card[change.field] = change.before;
    }
  }
  for (const bank of sources.banks) if (!isDeepStrictEqual(bank.payload, restored.get(bank.bankId))) throw new Error('non_display_field_changed');
  const changedBanks = new Set(report.changed.map(change => change.bankId));
  const draft = report.conflicts.length ? null : {
    banks: sources.banks.filter(bank => changedBanks.has(bank.bankId)).map(bank => ({ bankId: bank.bankId, baseChecksum: bank.checksum, payload: copies.get(bank.bankId) })),
    decisions: [], notes: 'PR277 approved display-only delta against current live sources; preserve question/audio/learning identities and all later operational content.',
  };
  return { report, draft };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [sourceFile, outputPrefix, orderFile] = process.argv.slice(2);
  if (!sourceFile || !outputPrefix) throw new Error('usage: node tools/prepare-display-title-delta.mjs <live-sources.json> <output-prefix> [order.json]');
  if (existsSync(outputPrefix + '.draft.json') || existsSync(outputPrefix + '.report.json')) throw new Error('output_prefix_exists_choose_a_fresh_prefix');
  const read = file => JSON.parse(readFileSync(file, 'utf8'));
  const changesRoot = resolve(root, 'docs/workstreams/next-round-2026-10');
  const result = prepareDisplayTitleDelta(read(sourceFile), read(resolve(changesRoot, 'topic-name-changes.json')), read(resolve(changesRoot, 'display-field-changes.json')));
  writeFileSync(outputPrefix + '.report.json', JSON.stringify(result.report, null, 2) + '\n');
  if (result.report.conflicts.length) { console.error(`display_delta_conflicts=${result.report.conflicts.length}; candidate_not_written`); process.exitCode = 1; }
  else if (!result.draft.banks.length) console.log('display_delta_already_applied; no_publication_needed');
  else {
    let output = { draft: result.draft };
    if (orderFile) {
      const input = read(orderFile), order = input.order ?? input;
      if (order.kind !== 'questions' || !order.id || !Number.isInteger(order.revision) || order.status === 'published') throw new Error('invalid_question_order_binding');
      output = { id: order.id, revision: order.revision, ...output };
    }
    writeFileSync(outputPrefix + '.draft.json', JSON.stringify(output, null, 2) + '\n');
    console.log(`display_delta_prepared banks=${result.draft.banks.length} fields=${result.report.changed.length} already=${result.report.alreadyApplied.length}`);
  }
}
