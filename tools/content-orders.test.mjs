import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec=promisify(execFile);
test('historical CLI detects old Ops and requires the exact reviewed revision before publish',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'icao-cli-'));let oldBackend=true,publishes=0;
 const update={baseChecksum:'a'.repeat(64),briefs:[{id:'history',date:'2026-01-14',title:'Old',centers:['A','B'],topics:[]}]};
 let order={id:'server-id',kind:'questions',revision:2,status:'ready',draft:{banks:[],hotspotUpdates:update,decisions:[],notes:''}};
 const server=createServer(async(req,res)=>{
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  const body=chunks.length?JSON.parse(Buffer.concat(chunks)):undefined;
  let data=order;
  if(req.url.endsWith('/prepare')){
   const {hotspotUpdates,...rest}=body.draft;
   data={...order,draft:oldBackend?rest:{...rest,hotspotUpdates:{briefs:hotspotUpdates.briefs,baseChecksum:hotspotUpdates.baseChecksum}}};
  }
  if(req.url.endsWith('/publish'))publishes++;
  res.setHeader('content-type','application/json');res.end(JSON.stringify({data}));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const cli=(...args)=>exec(process.execPath,['tools/content-orders.mjs',...args],{env:{...process.env,ICAO_OPS_URL:`http://127.0.0.1:${server.address().port}`,ICAO_OPS_TOKEN:''}});
 try{
  const file=join(directory,'draft.json');await writeFile(file,JSON.stringify({id:order.id,revision:1,draft:order.draft}));
  await assert.rejects(()=>cli('prepare',file),/historical_hotspots_not_preserved/);
  await assert.rejects(()=>readFile(file+'.prepared.json'),/ENOENT/);
  oldBackend=false;await cli('prepare',file);
  const prepared=JSON.parse(await readFile(file+'.prepared.json','utf8'));assert.deepEqual(prepared.draft.hotspotUpdates,update);
  await assert.rejects(()=>cli('publish',order.id),/historical_publish_requires_reviewed/);
  await cli('publish',order.id,file+'.prepared.json');assert.equal(publishes,1);
  order={...order,revision:3};
  await assert.rejects(()=>cli('publish',order.id,file+'.prepared.json'),/reviewed_order_changed/);assert.equal(publishes,1);
 }finally{await new Promise(resolve=>server.close(resolve));await rm(directory,{recursive:true,force:true});}
});
