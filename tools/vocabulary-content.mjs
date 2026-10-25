import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, 'content/vocabulary/dataset.json');
const sourceRoot = resolve(process.env.VOCAB_SOURCE_ROOT ?? '/Users/zhouyide/Desktop/icao项目/feizhuicu/public/data/vocab');
const expected = { preview: 360, icao4: 372, icao5: 106 };

function checksum(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

function compactWord(word, book) {
  return {
    id: word.id,
    bookId: book.id,
    level: book.level,
    word: word.word,
    meaning: word.meaning,
    example: word.example,
    exampleTranslation: word.exampleTranslation,
    source: {
      name: word.source?.name,
      rowIndex: word.source?.rowIndex,
      sourceNo: word.source?.sourceNo,
    },
  };
}

async function extract() {
  const manifest = await readJson(join(sourceRoot, 'manifest.json'));
  const books = [];
  for (const id of Object.keys(expected)) {
    const sourceBook = await readJson(join(sourceRoot, manifest.books[id].path));
    books.push({
      id,
      level: sourceBook.level,
      name: sourceBook.name,
      description: sourceBook.description,
      words: sourceBook.words.map((word) => compactWord(word, sourceBook)),
    });
  }
  const dataset = {
    schemaVersion: 1,
    version: 1,
    source: {
      name: manifest.source.name,
      generatedAt: manifest.source.generatedAt,
      sourceRows: manifest.source.sourceRows,
      validRows: manifest.source.validRows,
      ignoredRows: manifest.source.ignoredRows,
      invalidRows: manifest.source.invalidRows,
    },
    books,
  };
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(dataset, null, 2)}\n`, 'utf8');
  console.log(`vocabulary_extract_ok books=${books.length} words=${books.flatMap((book) => book.words).length} checksum=${checksum(dataset)}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function check() {
  const dataset = await readJson(target);
  assert(dataset.schemaVersion === 1, 'invalid_schema_version');
  assert(dataset.version === 1, 'invalid_dataset_version');
  assert(Array.isArray(dataset.books) && dataset.books.length === 3, 'invalid_book_count');
  const ids = new Set();
  const terms = new Set();
  let total = 0;
  for (const book of dataset.books) {
    assert(expected[book.id] === book.words.length, `invalid_book_count:${book.id}:${book.words.length}`);
    for (const word of book.words) {
      assert(word.bookId === book.id, `invalid_book_id:${word.id}`);
      assert(word.level === book.level, `invalid_level:${word.id}`);
      assert(typeof word.id === 'string' && word.id, 'missing_word_id');
      assert(!ids.has(word.id), `duplicate_word_id:${word.id}`);
      ids.add(word.id);
      const normalizedTerm = word.word.trim().toLocaleLowerCase('en-US');
      assert(normalizedTerm && !terms.has(normalizedTerm), `duplicate_word:${word.word}`);
      terms.add(normalizedTerm);
      for (const field of ['word', 'meaning', 'example', 'exampleTranslation']) {
        assert(typeof word[field] === 'string' && word[field].trim(), `missing_${field}:${word.id}`);
      }
      assert(typeof word.source?.name === 'string' && word.source.name, `missing_source_name:${word.id}`);
      assert(Number.isInteger(word.source?.rowIndex) && word.source.rowIndex > 0, `invalid_source_row:${word.id}`);
      assert(['string', 'number'].includes(typeof word.source?.sourceNo), `invalid_source_no:${word.id}`);
      total += 1;
    }
  }
  assert(total === 838, `invalid_total:${total}`);
  const core = await readJson(join(root, 'content/vocabulary/question-bank-core/book.json'));
  assert(core.id === 'question-bank-core' && core.words.length === 409 && core.assessmentEligible === false, 'invalid_core_book');
  for (const word of core.words) {
    assert(!ids.has(word.id) && word.bookId === core.id, `invalid_core_word:${word.id}`);
    ids.add(word.id);
    for (const key of ['word','meaning','example','exampleTranslation','pronunciationText']) assert(word[key]?.trim(), `invalid_core_${key}:${word.id}`);
    assert(word.frequency?.scope === 'question-bank-audio-text' && Number.isInteger(word.frequency.occurrences) && word.frequency.occurrences >= 0, `invalid_core_frequency:${word.id}`);
  }
  console.log(`vocabulary_check_ok books=${dataset.books.length} words=${total} checksum=${checksum(dataset)}`);
}

const command = process.argv[2] ?? 'check';
if (command === 'extract') await extract();
else if (command === 'check') await check();
else throw new Error(`unknown_command:${command}`);
