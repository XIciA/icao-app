import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateVocabularyLiveContent, validateVocabularyPolicyTransition, canonicalVocabularyJson, vocabularyFavoriteKey } from '../src/vocabulary-live.ts';
import { migrateVocabularyDocument } from '../src/vocabulary-migration.ts';
import { applyVocabularyEdits } from '../src/vocabulary-edit.ts';

function release(version=4) {
  const books=['preview','icao4','icao5'].map((id,index)=>({id,level:index+1,name:id,description:id,words:[{
    id:`word-${index}`,bookId:id,level:index+1,word:`term${index}`,meaning:'中文释义',example:`This is term${index}.`,exampleTranslation:'这是例句。',pronunciationText:`term${index}`,
    frequency:{scope:'question-bank-english-content',occurrences:0,cardCount:0,byBank:{},corpusVersion:1,corpusChecksum:'a'.repeat(64)},source:{name:'test',rowIndex:index,sourceNo:index},
  }]}));
  return {schemaVersion:1,catalogId:'vocabulary-live-v1',version,dataset:{schemaVersion:1,catalogId:'three-books-v3',version,source:{name:'test',generatedAt:'2026-10-26',sourceRows:3,validRows:3,ignoredRows:0,invalidRows:0},books},policy:{schemaVersion:1,version,retiredIds:{},retiredFavoriteKeys:{},testWords:Object.fromEntries(books.flatMap(book=>book.words.map(word=>[word.id,{word:word.word,meaning:word.meaning}])))} };
}
const progress=(status,favorite=false,date='2026-10-26T00:00:00.000Z')=>({status,favorite,updatedAt:date});

test('installs data and policy only when references, versions and all active texts agree',()=>{
  const value=release();assert.equal(validateVocabularyLiveContent(value),value);
  const bad=structuredClone(value);bad.policy.version=3;assert.throws(()=>validateVocabularyLiveContent(bad));
  bad.policy.version=4;bad.policy.retiredIds['word-0']=null;assert.throws(()=>validateVocabularyLiveContent(bad));
  const cycle=release();cycle.policy.retiredIds={a:'b',b:'a'};assert.throws(()=>validateVocabularyLiveContent(cycle));
  const alias=release();alias.policy.retiredFavoriteKeys={old:'missing'};assert.throws(()=>validateVocabularyLiveContent(alias));
});

test('new server rules merge conservatively and remove split words/favorites without an App-specific table',()=>{
  const value=release(), target='word-0',fav=vocabularyFavoriteKey('term0'),oldFav=vocabularyFavoriteKey('old');
  value.policy.retiredIds={old:target,split:null};value.policy.retiredFavoriteKeys={[oldFav]:target};
  const doc={words:{old:progress('known',true),[target]:progress('new'),split:progress('wrong'),[oldFav]:progress('new',true),independent:progress('vague')},updatedAt:'2026-10-26T00:00:00.000Z'};
  const next=migrateVocabularyDocument(doc,value.policy);
  assert.equal(next.words[target].status,'known');assert.equal(next.words[target].favorite,true);assert.equal(next.words[oldFav],undefined);
  assert.equal(next.words.old,undefined);assert.equal(next.words.split,undefined);assert.deepEqual(next.words.independent,doc.words.independent);
  assert.equal(migrateVocabularyDocument(next,value.policy),next);
  const later={...doc,words:{...doc.words,[target]:progress('vague',false,'2026-10-27T00:00:00.000Z')}};
  assert.equal(migrateVocabularyDocument(later,value.policy).words[target].status,'vague');
});

test('remaps merged test labels and discards a test referencing a removed split source',()=>{
  const value=release();value.policy.retiredIds={old:'word-0',split:null};
  const doc={words:{},updatedAt:'2026-10-26T00:00:00.000Z',lastTest:{total:1,correct:1,answers:[{wordId:'old',word:'old',meaning:'旧义',correct:true}]}};
  const next=migrateVocabularyDocument(doc,value.policy);assert.equal(next.lastTest.answers[0].wordId,'word-0');assert.equal(next.lastTest.answers[0].word,'term0');assert.equal(next.lastTest.correct,1);
  doc.lastTest.answers[0].wordId='split';assert.equal(migrateVocabularyDocument(doc,value.policy).lastTest,undefined);
});

test('publication cannot silently lose tombstones, reuse retired IDs or change their destination',()=>{
  const old=release(),next=release(5);old.policy.retiredIds={retired:'word-0',deleted:null};next.policy.retiredIds={retired:'word-0',deleted:null};
  assert.equal(validateVocabularyPolicyTransition(old,next),next);
  delete next.policy.retiredIds.deleted;assert.throws(()=>validateVocabularyPolicyTransition(old,next));
  next.policy.retiredIds.deleted='word-1';assert.throws(()=>validateVocabularyPolicyTransition(old,next));
});

test('canonical payload hashes are independent of key order',()=>{
  assert.equal(canonicalVocabularyJson({b:1,a:{z:2,x:3}}),canonicalVocabularyJson({a:{x:3,z:2},b:1}));
});

test('publishing a rename, relevel and later merge preserves stable owners and cumulative aliases',()=>{
  const old=release(), word=old.dataset.books[0].words[0];
  old.dataset.books[0].words.push({...word,id:'word-extra',word:'extra',pronunciationText:'extra'});
  old.policy.testWords['word-extra']={word:'extra',meaning:word.meaning};
  const renamed=applyVocabularyEdits(old,[{type:'upsert',word:{...word,word:'new spelling',pronunciationText:'new spelling',bookId:'icao4'}}]);
  assert.equal(renamed.policy.retiredFavoriteKeys[vocabularyFavoriteKey('term0')],word.id);
  assert.equal(renamed.dataset.books[1].words.find(w=>w.id===word.id).level,2);
  const merged=applyVocabularyEdits(renamed,[{type:'merge',sourceIds:[word.id],targetId:'word-1'}]);
  assert.equal(merged.policy.retiredIds[word.id],'word-1');
  assert.equal(merged.policy.retiredFavoriteKeys[vocabularyFavoriteKey('term0')],'word-1');
  assert.equal(merged.policy.retiredFavoriteKeys[vocabularyFavoriteKey('new spelling')],'word-1');
  assert.throws(()=>applyVocabularyEdits(merged,[{type:'upsert',word}]));
});

test('a deleted spelling may be added as a fresh word without resurrecting its old favorite',()=>{
  const old=release(),word=old.dataset.books[0].words[0];
  old.dataset.books[0].words.push({...word,id:'word-extra',word:'extra',pronunciationText:'extra'});
  old.policy.testWords['word-extra']={word:'extra',meaning:word.meaning};
  const deleted=applyVocabularyEdits(old,[{type:'delete',id:word.id}]);
  const restored=applyVocabularyEdits(deleted,[{type:'upsert',word:{...word,id:'fresh-word'}}]);
  assert.equal(restored.policy.retiredIds[word.id],null);
  assert.equal(restored.policy.retiredFavoriteKeys[vocabularyFavoriteKey(word.word)],null);
  const migrated=migrateVocabularyDocument({words:{[word.id]:progress('known',true),[vocabularyFavoriteKey(word.word)]:progress('new',true)},updatedAt:'2026-10-26T00:00:00.000Z'},restored.policy);
  assert.deepEqual(migrated.words,{});
});

test('a publication never hashes or persists the prior transport checksum inside its content',()=>{
  const previous=release(),decorated={...previous,checksum:'f'.repeat(64),cachedAt:'2026-10-27'};
  const next=applyVocabularyEdits(decorated,[{type:'upsert',word:{...previous.dataset.books[0].words[0],meaning:'更新中文'}}]);
  assert.equal(Object.hasOwn(next,'checksum'),false);assert.equal(Object.hasOwn(next,'cachedAt'),false);
});
