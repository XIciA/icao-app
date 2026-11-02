import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const {studyScopeCardIds,freeQuestionBankCardIds}=require('../packages/contracts/dist/index.js');
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url)));
const proof=read('content/question-banks/opi-directory-20261102.json');
const before=JSON.parse(execFileSync('git',['show',`${proof.baseCommit}:src/features/question-bank/data/question-bank.json`],{maxBuffer:40e6}));
const after=read('src/features/question-bank/data/question-bank.json');
const generatedMoves = read('src/features/question-bank/data/directory-relocations.json').flatMap(([bankId,fromCategoryId,fromTopicId,toCategoryId,toTopicId,ids]) => ids.map(cardId => ({bankId,fromCategoryId,fromTopicId,toCategoryId,toTopicId,cardId})));
const canonical = rows => rows.map(row => JSON.stringify(Object.fromEntries(Object.entries(row).sort()))).sort();
assert.deepEqual(canonical(generatedMoves),canonical(proof.moves),'storage_identity_manifest_drift');
const old=before.find(b=>b.id==='opi'),now=after.find(b=>b.id==='opi');
assert.deepEqual([...freeQuestionBankCardIds(now)].sort(),[...freeQuestionBankCardIds(old)].sort(),'free_access_changed');
const cards=b=>b.categories.flatMap(c=>c.topics.flatMap(t=>t.cards));
const a=new Map(cards(old).map(c=>[c.id,c])),b=new Map(cards(now).map(c=>[c.id,c]));
assert.equal(b.size,2365);assert.deepEqual([...b.keys()].sort(),[...a.keys()].sort());
for(const [id,card] of b)assert.deepEqual(card,a.get(id),`card_changed:${id}`);
assert.deepEqual(now.categories.find(c=>c.id==='opi-category-08'),old.categories.find(c=>c.id==='opi-category-08'));
for(const scope of ['all','selected','crash']){
 const ids=b=>b.categories.flatMap(c=>c.topics.flatMap(t=>studyScopeCardIds('opi',t)[scope])).sort();
 assert.deepEqual(ids(now),ids(old),`scope_changed:${scope}`);console.log(scope,ids(now).length);
}
for(const bank of after.filter(b=>b.id!=='opi'))assert.deepEqual(bank,before.find(b=>b.id===bank.id));
const loc=new Map(now.categories.flatMap(c=>c.topics.flatMap(t=>t.cards.map(card=>[card.id,{categoryId:c.id,topicId:t.id}]))));
for(const m of proof.moves)assert.deepEqual(loc.get(m.cardId),{categoryId:m.toCategoryId,topicId:m.toTopicId});
for(const c of now.categories.filter(c=>c.id!=='opi-category-08')){
 assert.equal(new Set(c.topics.map(t=>t.name)).size,c.topics.length);
 for(const t of c.topics){assert(t.cards.length);assert(!/[：:]/.test(t.name));assert(!t.name.includes('补充话题'));}
}
console.log(`opi_directory_verified cards=${b.size} topics=${now.declaredTopicCount} moves=${proof.moves.length}`);
