import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateVocabularyLiveContent,vocabularyTerms} from '../packages/contracts/src/vocabulary-live.ts';
import {migrateVocabularyDocument} from '../packages/contracts/src/vocabulary-migration.ts';
import {compileRule,matchOccurrences} from './question-bank-vocabulary.mjs';
const json=path=>JSON.parse(readFileSync(new URL('../'+path,import.meta.url),'utf8'));
const release=json('content/vocabulary/live/release.json'),source=json('content/vocabulary/live/source.json');
const words=release.dataset.books.flatMap(book=>book.words),find=term=>words.find(word=>vocabularyTerms(word).some(value=>value.toLowerCase()===term.toLowerCase()));

test('all reviewed live cards have complete bilingual content, valid frequency and a matching example',()=>{
 assert.equal(validateVocabularyLiveContent(release),release);
 assert.equal(words.length,source.entries.length);
 for(const row of source.entries){
  assert.ok(matchOccurrences(row.example,compileRule(row.frequencyRules)).hits.length,`example does not illustrate ${row.word}`);
  assert.match(row.meaning,/[\u4e00-\u9fff]/u);assert.match(row.exampleTranslation,/[\u4e00-\u9fff]/u);
  assert.doesNotMatch(row.meaning,/^[；;，,]|^短语\s|英文全称|相关表达/u);
 }
});

test('dictated splits retain useful standalone words instead of redundant combinations',()=>{
 for(const term of ['a badly sick passenger','adverse weather','aircraft proximity','moderate turbulence','minor bruise','port engine','starboard engine','AC generator','fog is coming down','fog is clearing up'])assert.equal(find(term),undefined,term);
 for(const term of ['aircraft','passenger','sick','proximity','minor','bruise','moderate','turbulence','port','starboard','engine','in progress','clear up','come down'])assert.ok(find(term),term);
 assert.equal(find('aircraft').bookId,'preview');
 assert.equal(find('radar'),undefined);assert.ok(find('radar vector'));
 assert.equal(find('cockpit').word,"cockpit / pilot's cabin");
});

test('abbreviations, synonyms and related forms use the approved presentation',()=>{
 for(const term of ['ATC','CAT','MSA']){const word=find(term);assert.equal(word.word,term);assert.match(word.meaning,new RegExp(`（[^）]+，${term}）`));}
 assert.equal(find('minimum safe altitude'),undefined);assert.ok(find('MSA').meaning.includes('最低安全高度'));
 assert.equal(find('line up and wait').word,'line up and wait');
 const bus=find('airport shuttle bus');assert.equal(bus.word,'airport shuttle bus / airport passenger bus / ferry bus');assert.equal(bus.meaning,'机场摆渡车');
 assert.ok(find('radar vector').relatedExpressions.includes('vectoring'));
 assert.doesNotMatch(find('abeam').meaning,/^；/u);
});

test('explicit same-level families and their logical peers remain consistent',()=>{
 for(const group of [['VOR','NDB','DME','ILS'],['V1','V2','VR','VREF','VAPP'],['inbound','outbound'],['CVR','FDR'],['port','starboard'],['updraft','downdraft'],['extend','retract'],['extension','retraction']]){
  const levels=new Set(group.map(term=>{assert.ok(find(term),term);return find(term).bookId}));assert.equal(levels.size,1,group.join('/'));
 }
});

test('every retired catalog record and favorite migrates without orphan IDs, preserving surviving learning',()=>{
 const old=json('content/vocabulary/three-books/dataset.json').books.flatMap(book=>book.words),ids=new Set(words.map(word=>word.id));
 const doc={words:Object.fromEntries(old.map(word=>[word.id,{status:'known',favorite:true,updatedAt:'2026-10-26T00:00:00.000Z'}])),updatedAt:'2026-10-26T00:00:00.000Z'};
 const next=migrateVocabularyDocument(doc,release.policy);
 assert.ok(Object.keys(next.words).every(id=>ids.has(id)));
 for(const word of old.filter(word=>ids.has(word.id))){assert.equal(next.words[word.id].status,'known');assert.equal(next.words[word.id].favorite,true);}
 assert.equal(migrateVocabularyDocument(next,release.policy),next);
});
