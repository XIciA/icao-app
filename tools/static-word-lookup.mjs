import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const questionBankPath = resolve(root, 'src/features/question-bank/data/question-bank.json');
const outputPath = resolve(root, 'content/word-lookup/word-list.json');
const datasetPath = resolve(root, 'content/word-lookup/dataset.json');
const batchesPath = resolve(root, 'content/word-lookup/batches');

const scope = {
  listening: ['audioText', 'choices'],
  sentences900: ['audioText'],
  radiotelephony: ['audioText', 'referenceText'],
  opi: ['audioText', 'referenceText'],
  storytelling: ['audioText'],
};

const englishWord = /^[A-Za-z]+(?:[’'-][A-Za-z]+)*$/;

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function normalizeWord(token) {
  const trimmed = token.replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, '');
  if (!englishWord.test(trimmed)) return undefined;
  return trimmed.toLocaleLowerCase('en-US');
}

function tokens(text) {
  return text.split(/(\s+)/).filter(Boolean).flatMap((token) => {
    if (/^\s+$/u.test(token)) return [];
    const word = normalizeWord(token);
    return word ? [{ source: token, word }] : [];
  });
}

function collectCards(value, cards = []) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectCards(item, cards));
    return cards;
  }
  if (!value || typeof value !== 'object') return cards;
  if (typeof value.audioText === 'string') cards.push(value);
  Object.values(value).forEach((item) => collectCards(item, cards));
  return cards;
}

function addText(entries, summary, rejected, datasetId, cardId, field, text) {
  for (const rawToken of text.split(/(\s+)/).filter(Boolean)) {
    if (/^\s+$/u.test(rawToken)) continue;
    const word = normalizeWord(rawToken);
    if (!word) {
      if (/[A-Za-z]/u.test(rawToken)) rejected.add(rawToken);
      continue;
    }
    const token = { source: rawToken, word };
    const current = entries.get(token.word) ?? {
      word: token.word,
      forms: new Set(),
      occurrences: 0,
      datasets: new Set(),
      fields: new Set(),
    };
    current.forms.add(token.source);
    current.occurrences += 1;
    current.datasets.add(datasetId);
    current.fields.add(field);
    entries.set(token.word, current);
    summary.occurrences += 1;
  }
}

function buildWordList(questionBanks, bytes) {
  const entries = new Map();
  const byDataset = {};
  const rejected = new Set();

  for (const dataset of questionBanks) {
    const fields = scope[dataset.id];
    if (!fields) throw new Error(`unsupported_dataset:${dataset.id}`);
    if (dataset.study?.tools?.dictionary !== true) throw new Error(`dictionary_disabled:${dataset.id}`);

    const summary = { cards: 0, occurrences: 0, uniqueWords: 0 };
    for (const card of collectCards(dataset)) {
      summary.cards += 1;
      for (const field of fields) {
        if (field === 'choices') {
          if (!Array.isArray(card.choices) || card.choices.length !== 4) throw new Error(`invalid_listening_choices:${card.id}`);
          for (const choice of card.choices) {
            if (typeof choice !== 'string') throw new Error(`invalid_listening_choice:${card.id}`);
            addText(entries, summary, rejected, dataset.id, card.id, field, choice);
          }
          continue;
        }
        if (typeof card[field] !== 'string') {
          if (field === 'referenceText') continue;
          throw new Error(`missing_required_text:${dataset.id}:${card.id}:${field}`);
        }
        addText(entries, summary, rejected, dataset.id, card.id, field, card[field]);
      }
    }
    byDataset[dataset.id] = summary;
  }

  const words = [...entries.values()].map((entry) => ({
    word: entry.word,
    forms: [...entry.forms].sort((left, right) => left.localeCompare(right, 'en-US')),
    occurrenceCount: entry.occurrences,
    datasets: [...entry.datasets].sort(),
    fields: [...entry.fields].sort(),
  })).sort((left, right) => left.word.localeCompare(right.word, 'en-US'));

  const lookup = new Set(words.map((entry) => entry.word));
  for (const [datasetId, summary] of Object.entries(byDataset)) {
    summary.uniqueWords = words.filter((entry) => entry.datasets.includes(datasetId)).length;
  }

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: {
      questionBankPath: 'src/features/question-bank/data/question-bank.json',
      questionBankChecksum: sha256(bytes),
      scope,
    },
    summary: {
      wordCount: lookup.size,
      occurrenceCount: words.reduce((total, entry) => total + entry.occurrenceCount, 0),
      byDataset,
      rejectedTokenCount: rejected.size,
    },
    rejectedTokenSamples: [...rejected].sort((left, right) => left.localeCompare(right, 'en-US')).slice(0, 300),
    words,
  };
}

async function readQuestionBanks() {
  const bytes = await readFile(questionBankPath);
  return { bytes, questionBanks: JSON.parse(bytes.toString('utf8')) };
}

async function extract() {
  const { bytes, questionBanks } = await readQuestionBanks();
  const list = buildWordList(questionBanks, bytes);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, stableJson(list));
  console.log(`word_lookup_extract_ok words=${list.summary.wordCount} occurrences=${list.summary.occurrenceCount} rejected=${list.summary.rejectedTokenCount} checksum=${list.source.questionBankChecksum}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function check() {
  const [bytes, saved] = await Promise.all([readQuestionBanks(), readFile(outputPath, 'utf8').then(JSON.parse)]);
  const expected = buildWordList(bytes.questionBanks, bytes.bytes);
  assert(saved.schemaVersion === 1, 'invalid_word_list_schema');
  assert(saved.source?.questionBankChecksum === expected.source.questionBankChecksum, 'word_list_source_changed');
  assert(saved.summary?.wordCount === expected.summary.wordCount, 'word_list_count_changed');
  assert(saved.summary?.occurrenceCount === expected.summary.occurrenceCount, 'word_list_occurrences_changed');
  assert(saved.summary?.rejectedTokenCount === expected.summary.rejectedTokenCount, 'word_list_rejected_changed');
  assert(JSON.stringify(saved.rejectedTokenSamples) === JSON.stringify(expected.rejectedTokenSamples), 'word_list_rejected_samples_changed');
  assert(JSON.stringify(saved.words) === JSON.stringify(expected.words), 'word_list_entries_changed');
  console.log(`word_lookup_check_ok words=${saved.summary.wordCount} occurrences=${saved.summary.occurrenceCount} rejected=${saved.summary.rejectedTokenCount}`);
}

function validateDataset(wordList, dataset, requireComplete) {
  assert(dataset.schemaVersion === 1, 'invalid_word_lookup_dataset_schema');
  assert(dataset.wordListChecksum === sha256(stableJson(wordList.words)), 'word_lookup_dataset_word_list_mismatch');
  assert(Array.isArray(dataset.entries), 'invalid_word_lookup_entries');
  const expected = new Set(wordList.words.map((item) => item.word));
  const received = new Set();
  for (const entry of dataset.entries) {
    assert(typeof entry.word === 'string' && expected.has(entry.word), `invalid_word_lookup_word:${entry.word}`);
    assert(!received.has(entry.word), `duplicate_word_lookup_word:${entry.word}`);
    assert(typeof entry.ipa === 'string' && /^\/.+\/$/u.test(entry.ipa), `invalid_word_lookup_ipa:${entry.word}`);
    assert(typeof entry.aviationMeaning === 'string' && /^[a-z]+\.\s/u.test(entry.aviationMeaning) && /[\u4E00-\u9FFF]/u.test(entry.aviationMeaning), `invalid_word_lookup_aviation:${entry.word}`);
    assert(typeof entry.generalMeaning === 'string' && /^[a-z]+\.\s/u.test(entry.generalMeaning) && /[\u4E00-\u9FFF]/u.test(entry.generalMeaning), `invalid_word_lookup_general:${entry.word}`);
    assert(entry.aviationMeaning.length <= 120, `word_lookup_aviation_too_long:${entry.word}`);
    assert(entry.generalMeaning.length <= 120, `word_lookup_general_too_long:${entry.word}`);
    received.add(entry.word);
  }
  if (requireComplete) assert(received.size === expected.size, `word_lookup_coverage_mismatch:${received.size}:${expected.size}`);
  return { expected: expected.size, received: received.size };
}

async function checkDataset() {
  const [wordList, dataset] = await Promise.all([readFile(outputPath, 'utf8').then(JSON.parse), readFile(datasetPath, 'utf8').then(JSON.parse)]);
  const { received } = validateDataset(wordList, dataset, true);
  console.log(`word_lookup_dataset_check_ok words=${received}`);
}

async function checkPartialDataset() {
  const [wordList, dataset] = await Promise.all([readFile(outputPath, 'utf8').then(JSON.parse), readFile(datasetPath, 'utf8').then(JSON.parse)]);
  const { expected, received } = validateDataset(wordList, dataset, false);
  console.log(`word_lookup_dataset_partial_check_ok words=${received} remaining=${expected - received}`);
}

async function listBatchFiles(directory) {
  let children;
  try {
    children = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return [];
    throw error;
  }
  const nested = await Promise.all(children.map(async (child) => {
    const childPath = resolve(directory, child.name);
    if (child.isDirectory()) return listBatchFiles(childPath);
    return child.isFile() && child.name.endsWith('.json') ? [childPath] : [];
  }));
  return nested.flat().sort((left, right) => left.localeCompare(right, 'en-US'));
}

async function assembleDataset() {
  const [wordList, batchFiles] = await Promise.all([
    readFile(outputPath, 'utf8').then(JSON.parse),
    listBatchFiles(batchesPath),
  ]);
  const batchValues = await Promise.all(batchFiles.map(async (file) => ({
    file,
    value: JSON.parse(await readFile(file, 'utf8')),
  })));
  const entries = [];
  for (const { file, value } of batchValues) {
    assert(value.schemaVersion === 1, `invalid_word_lookup_batch_schema:${file}`);
    assert(Array.isArray(value.entries), `invalid_word_lookup_batch_entries:${file}`);
    entries.push(...value.entries);
  }
  const dataset = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    wordListChecksum: sha256(stableJson(wordList.words)),
    batches: batchValues.map(({ file, value }) => ({
      file: file.slice(root.length + 1),
      entryCount: value.entries.length,
    })),
    entries: entries.sort((left, right) => String(left.word).localeCompare(String(right.word), 'en-US')),
  };
  await writeFile(datasetPath, stableJson(dataset));
  console.log(`word_lookup_dataset_assemble_ok batches=${batchValues.length} words=${dataset.entries.length}`);
}

const command = process.argv[2] ?? 'check';
if (command === 'extract') await extract();
else if (command === 'check') await check();
else if (command === 'check-dataset') await checkDataset();
else if (command === 'check-dataset-partial') await checkPartialDataset();
else if (command === 'assemble-dataset') await assembleDataset();
else throw new Error(`unknown_command:${command}`);
