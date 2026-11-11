import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const json = value => JSON.stringify(value, null, 2) + '\n';
const entry = word => ({ word, ipa: '/tɛst/', aviationMeaning: 'n. 航空测试', generalMeaning: 'n. 测试' });
async function fixture(run) {
 const root = await mkdtemp(join(tmpdir(), 'icao-lookup-'));
 try {
  for (const dir of ['tools','packages/contracts/src','content/word-lookup/batches','src/features/question-bank/static-word-lookup/data']) await mkdir(join(root,dir),{recursive:true});
  await copyFile(new URL('./static-word-lookup.mjs',import.meta.url),join(root,'tools/static-word-lookup.mjs'));
  await copyFile(new URL('../packages/contracts/src/word-lookup.ts',import.meta.url),join(root,'packages/contracts/src/word-lookup.ts'));
  const words=[{word:'descent'}];
  const batch={schemaVersion:1,supplementalCoverage:{bankId:'opi',sourceChecksum:'a'.repeat(64),cardIds:['new-question']},entries:[entry('hudson')]};
  const dataset={schemaVersion:1,wordListChecksum:createHash('sha256').update(json(words)).digest('hex'),entries:[entry('descent'),entry('hudson')]};
  const check=async()=>{
   await writeFile(join(root,'content/word-lookup/word-list.json'),json({words}));
   await writeFile(join(root,'content/word-lookup/batches/supplement.json'),json(batch));
   for(const p of ['content/word-lookup/dataset.json','src/features/question-bank/static-word-lookup/data/dataset.json'])await writeFile(join(root,p),json(dataset));
   return spawnSync(process.execPath,[join(root,'tools/static-word-lookup.mjs'),'check-dataset'],{encoding:'utf8'});
  };
  await run({batch,dataset,check});
 } finally {await rm(root,{recursive:true,force:true});}
}
test('authored live additions preserve full bundled coverage',()=>fixture(async({check})=>assert.equal((await check()).status,0)));
test('unregistered words cannot enter the dictionary',()=>fixture(async({dataset,check})=>{dataset.entries.push(entry('unregistered'));assert.match((await check()).stderr,/invalid_word_lookup_word:unregistered/);}));
test('missing provenance is rejected',()=>fixture(async({batch,check})=>{batch.supplementalCoverage.cardIds=[];assert.match((await check()).stderr,/invalid_supplemental_provenance/);}));
test('live definitions must match their authored batch',()=>fixture(async({dataset,check})=>{dataset.entries[1].generalMeaning='n. 被替换';assert.match((await check()).stderr,/supplemental_definition_mismatch/);}));
test('adding live words never masks a missing bundled definition',()=>fixture(async({dataset,check})=>{dataset.entries.shift();assert.match((await check()).stderr,/word_lookup_coverage_missing:descent/);}));
test('every registered live word must also be delivered',()=>fixture(async({dataset,check})=>{dataset.entries.pop();assert.match((await check()).stderr,/word_lookup_coverage_missing:hudson/);}));
