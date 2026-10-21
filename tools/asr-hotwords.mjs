import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const assetRoot = join(root, 'docs/resources/ai/assets/tencent-asr');
const command = process.argv[2];
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const cards = [];
for (const bank of (await readdir(join(root, 'content/question-banks/banks'))).sort()) {
  const topics = join(root, 'content/question-banks/banks', bank, 'topics');
  let files;
  try { files = await readdir(topics); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
  for (const file of files.filter((name) => name.endsWith('.json')).sort()) {
    const source = `content/question-banks/banks/${bank}/topics/${file}`;
    for (const card of (await readJson(join(root, source))).cards ?? []) {
      const text = [card.audioText, card.referenceText].filter((value) => typeof value === 'string').join('\n');
      if (text) cards.push({ id: card.id, bank, source, text, audioText: card.audioText });
    }
  }
}
const pattern = (term) => new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, term === term.toUpperCase() ? '' : 'i');

if (command === 'check') {
  const asset = await readJson(join(assetRoot, 'hotwords.json'));
  assert.equal(asset.engine, '16k_en');
  assert.ok(asset.items.length > 0 && asset.items.length <= 1000);
  const seen = new Set();
  for (const item of asset.items) {
    assert.match(item.term, /^[A-Za-z][A-Za-z-]{0,29}$/, `Invalid term: ${item.term}`);
    assert.ok(!seen.has(item.term.toLowerCase()), `Duplicate: ${item.term}`);
    seen.add(item.term.toLowerCase());
    assert.ok(Number.isInteger(item.weight) && item.weight >= 1 && item.weight <= 10);
    assert.ok(item.reason && item.evidenceIds.length && item.examples.length);
    const matches = cards.filter((card) => pattern(item.term).test(card.text));
    assert.equal(item.cardCount, matches.length, `${item.term}: corpus count changed`);
    assert.equal(item.uniqueTextCount, new Set(matches.map((card) => card.text)).size);
    assert.equal(item.sentence900Count, matches.filter((card) => card.bank === 'sentences900').length);
    assert.deepEqual(item.banks, [...new Set(matches.map((card) => card.bank))].sort());
    for (const id of item.evidenceIds) assert.ok(matches.some((card) => card.id === id), `${item.term}: invalid evidence ${id}`);
    for (const example of item.examples) assert.ok(matches.some((card) => card.id === example.id && card.source === example.source && card.text.includes(example.context)), `${item.term}: invalid excerpt`);
  }
  assert.equal(asset.corpus.cards, cards.length);
  for (const [bank, count] of Object.entries(asset.corpus.bankCounts)) assert.equal(count, cards.filter((card) => card.bank === bank).length);
  assert.equal(await readFile(join(assetRoot, 'hotwords.txt'), 'utf8'), asset.items.map((item) => `${item.term}|${item.weight}\n`).join(''));
  const training = await readFile(join(assetRoot, 'aviation-training-900.txt'), 'utf8');
  const sentences = cards.filter((card) => card.bank === 'sentences900').sort((a, b) => a.id.localeCompare(b.id));
  assert.equal(sentences.length, 900);
  assert.deepEqual(training.trimEnd().split('\n').sort(), sentences.map((card) => card.audioText.trim()).sort());
  assert.equal(createHash('sha256').update(training).digest('hex'), '381a278bc654053218f1846aea0fd23d0a31860dc93212c6cf1aab47f12b37ba');
  console.log(`Tencent ASR assets valid: ${asset.items.length} source-backed hotwords, 900 format-normalized training sentences; no network calls.`);
} else if (command === 'candidates') {
  // Inventory only: selection remains a reviewed edit to hotwords.json, never automatic promotion.
  const inventory = new Map();
  for (const card of cards) for (const term of new Set(card.text.match(/\b[A-Z]{2,8}\b/g) ?? [])) {
    const entry = inventory.get(term) ?? { term, cards: 0, sentence900: 0, evidenceIds: [] };
    entry.cards += 1;
    if (card.bank === 'sentences900') entry.sentence900 += 1;
    if (entry.evidenceIds.length < 5) entry.evidenceIds.push(card.id);
    inventory.set(term, entry);
  }
  const output = join(root, '.generated/tencent-asr/hotword-inventory.json');
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify([...inventory.values()].sort((a, b) => b.sentence900 - a.sentence900 || b.cards - a.cards || a.term.localeCompare(b.term)), null, 2) + '\n');
  console.log(`Candidate inventory written to ${output}; reviewed assets unchanged.`);
} else {
  console.error('Usage: node tools/asr-hotwords.mjs check|candidates');
  process.exitCode = 64;
}
