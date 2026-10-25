import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileRule, matchOccurrences, normalizeText } from './question-bank-vocabulary.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const directory = resolve(root, 'content/vocabulary/three-books');
const hash = value => createHash('sha256').update(value).digest('hex');
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const normalize = value => value.normalize('NFKC').replace(/[‘’‛ʻʼ]/g, "'").replace(/[‐‑‒–—―−]/g, '-').trim().replace(/\s+/g, ' ').toLowerCase();
const favorite = value => `__word_favorite__:v1:${encodeURIComponent(normalize(value))}`;

function validateText(value, field, id) {
  assert(typeof value === 'string' && value.trim() === value && value, `missing_${field}:${id}`);
  assert(!/[\r\n\t\u200b-\u200f\ufeff]|\\[nr]|<\/?(?:br|p|div)\b| {2}/i.test(value), `invalid_text_structure:${id}:${field}`);
  const stack = [], pairs = {')':'(', '）':'（', ']':'[', '】':'【'};
  for (const char of value) {
    if (Object.values(pairs).includes(char)) stack.push(char);
    if (pairs[char]) assert(stack.pop() === pairs[char], `unbalanced_punctuation:${id}:${field}:${value}`);
  }
  assert(!stack.length, `unbalanced_punctuation:${id}:${field}:${value}`);
}

export async function buildThreeBooks() {
  const source = await json(resolve(directory, 'source.json'));
  const inventory = await json(resolve(directory, 'inventory.json'));
  const ids = new Set(), terms = new Set();
  const originalBytes = await readFile(resolve(root, 'content/vocabulary/dataset.json'));
  assert(hash(originalBytes) === source.baseVocabularyChecksum, 'manual_vocabulary_baseline_changed');
  assert(hash(await readFile(resolve(root, 'content/vocabulary/question-bank-core/source.json'))) === source.coreSourceChecksum, 'core_vocabulary_baseline_changed');
  for (const e of source.entries) {
    assert(!ids.has(e.id) && !terms.has(normalize(e.word)), `duplicate_word:${e.word}`);
    ids.add(e.id); terms.add(normalize(e.word));
    for (const field of ['word','meaning','example','exampleTranslation','pronunciationText']) validateText(e[field], field, e.id);
    assert(/[\u4e00-\u9fff]/.test(e.meaning) && /[\u4e00-\u9fff]/.test(e.exampleTranslation), `translation_missing:${e.word}`);
    assert(!e.word.includes('/') && !/[（(]/.test(e.word), `mixed_headword:${e.word}`);
    assert(source.books.some(b => b.id === e.bookId), `invalid_book:${e.id}`);
  }
  const files = [], docs = [];
  async function read(path) { const bytes = await readFile(resolve(root,path)); files.push({path,checksum:hash(bytes)}); return JSON.parse(bytes); }
  const registry = await read('content/question-banks/registry.json');
  const counts = {};
  for (const bankId of registry.bankIds) {
    const folder = `content/question-banks/banks/${bankId}`;
    const bank = await read(`${folder}/bank.json`); const seen = new Set(); let images = 0;
    for (const cid of bank.categoryIds) {
      const category = await read(`${folder}/categories/${cid}.json`);
      for (const tid of category.topicIds) {
        const topic = await read(`${folder}/topics/${tid}.json`);
        assert(topic.cards.length === topic.declaredCardCount, `topic_count:${tid}`);
        for (const card of topic.cards) {
          assert(!seen.has(card.id), `duplicate_card:${card.id}`); seen.add(card.id);
          if (card.kind === 'image') { images++; continue; }
          const add = (field, text) => { if (text?.trim()) docs.push({bankId,cardId:card.id,field,text:normalizeText(text)}); };
          add('audioText',card.audioText);
          if (bankId !== 'listening') add('referenceText',card.referenceText);
          (card.choices ?? []).forEach((text,i) => add(`choices[${i}]`,text));
        }
      }
    }
    assert(seen.size === bank.declaredCardCount, `bank_count:${bankId}`);
    counts[bankId] = { cards: seen.size, textCards: seen.size-images, imageCards: images };
  }
  assert(JSON.stringify(files) === JSON.stringify(inventory.sourceFiles), 'vocabulary_inventory_stale_rerun_prepare');
  const corpusChecksum = hash(JSON.stringify(files));
  const audits = [];
  const words = source.entries.map((e,index) => {
    const rule = compileRule(e.frequencyRules);
    if (e.frequencyRules.caseSensitive) rule.pattern = new RegExp(rule.pattern.source,'g');
    let occurrences = 0;
    const cards = new Set(), byBank = {}, samples = [];
    for (const doc of docs) {
      const result = matchOccurrences(doc.text,rule,true);
      if (!result.hits.length) continue;
      occurrences += result.hits.length;
      cards.add(`${doc.bankId}:${doc.cardId}`);
      byBank[doc.bankId] = (byBank[doc.bankId] ?? 0)+result.hits.length;
      if (samples.length < 3) samples.push({bankId:doc.bankId,cardId:doc.cardId,field:doc.field,...result.hits[0]});
    }
    audits.push({id:e.id,word:e.word,occurrences,cardCount:cards.size,samples});
    const book = source.books.find(b => b.id === e.bookId);
    const aliases = e.aliases.filter(a => normalize(a) !== normalize(e.word) && !normalize(e.meaning).includes(normalize(a))); 
    const meaning = e.meaning+(aliases.length ? `；相关表达：${aliases.join('、')}` : '');
    return {id:e.id,bookId:book.id,level:book.level,word:e.word,meaning,example:e.example,exampleTranslation:e.exampleTranslation,pronunciationText:e.pronunciationText,
      frequency:{scope:'question-bank-english-content',occurrences,cardCount:cards.size,byBank,corpusVersion:registry.releaseVersion,corpusChecksum},
      source:{name:'三本人工词书与全题库词汇统一整理',rowIndex:index+1,sourceNo:e.id}};
  });
  const books = source.books.map(book => ({...book, words:words.filter(w => w.bookId === book.id)}));
  const dataset = {schemaVersion:1,version:source.version,catalogId:'three-books-v3',source:{name:'人工词书标杆 + 全题库英文内容',generatedAt:'2026-10-26T00:00:00.000Z',sourceRows:inventory.entries.length,validRows:words.length,ignoredRows:0,invalidRows:0},books};
  const wordById = new Map(words.map(w => [w.id,w]));
  const targets = {}, favoriteTargets = {};
  for (const item of source.legacy) {
    const target = item.target ? wordById.get(item.target) : undefined;
    assert(!item.target || target, `missing_migration_target:${item.id}`);
    if (item.id !== target?.id) targets[item.id] = target?.id ?? null;
    const oldKey = favorite(item.word), newKey = target ? favorite(target.word) : null;
    if (oldKey !== newKey) favoriteTargets[oldKey] = newKey;
  }
  // Never delete a canonical favorite that another retained source still uses.
  for (const w of words) delete favoriteTargets[favorite(w.word)];
  const migrationData = `// Generated by tools/three-book-vocabulary.mjs; do not edit.\nexport const vocabularyRetiredIds: Readonly<Record<string, string | null>> = ${JSON.stringify(targets,null,2)};\nexport const vocabularyRetiredFavoriteKeys: Readonly<Record<string, string | null>> = ${JSON.stringify(favoriteTargets,null,2)};\n`;
  return { dataset, migrationData, report:{schemaVersion:1,corpusVersion:registry.releaseVersion,corpusChecksum,counts,documentCount:docs.length,books:Object.fromEntries(books.map(b=>[b.id,b.words.length])),words:words.length,legacyRetained:source.legacy.filter(x=>x.action==='retain').length,legacyMerged:source.legacy.filter(x=>x.action==='merge').length,legacyRemoved:source.legacy.filter(x=>x.action==='remove').length,zeroMatches:audits.filter(x=>x.occurrences===0).map(x=>x.word),entries:audits} };
}

async function main() {
  const command = process.argv[2] ?? 'check'; assert(['build','check'].includes(command),'unknown_command');
  const result = await buildThreeBooks();
  const outputs = [[resolve(directory,'dataset.json'),JSON.stringify(result.dataset,null,2)+'\n'],[resolve(root,'packages/contracts/src/vocabulary-migration-data.ts'),result.migrationData]];
  for (const [path,bytes] of outputs) {
    if (command === 'check') assert(await readFile(path,'utf8') === bytes, `three_book_vocabulary_stale:${path}`);
    else { await writeFile(path+'.tmp',bytes); await rename(path+'.tmp',path); }
  }
  const out = resolve(root,'.generated/vocabulary-three-books'); await mkdir(out,{recursive:true});
  await writeFile(resolve(out,'build-report.json'),JSON.stringify(result.report,null,2)+'\n');
  console.log(JSON.stringify({command,books:result.report.books,words:result.report.words,counts:result.report.counts,legacyRetained:result.report.legacyRetained,legacyMerged:result.report.legacyMerged,legacyRemoved:result.report.legacyRemoved,zeroMatches:result.report.zeroMatches.length}));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
