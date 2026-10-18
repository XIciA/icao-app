/** Offline validation only; uses the same guards as the authenticated work-order service. */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { canonicalAppContentJson, isAppContentSnapshot } from '@icao/contracts/app-content';
import { parseDraft, validateBank, cardsOf } from '../src/admin/content-workflow-validation.ts';
import { replaceHistoricalHotspots, validateHotspotReferences, validateExclusions } from '../src/admin/content-workflow-history.ts';
const [sourceFile,draftFile,manifestFile,resourceRoot]=process.argv.slice(2);
if(!resourceRoot)throw new Error('usage: tsx scripts/validate-history-candidate.mjs SOURCES DRAFT MANIFEST RESOURCE_ROOT');
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const hash=v=>createHash('sha256').update(canonicalAppContentJson(v)).digest('hex');
const sources=read(sourceFile),draft=parseDraft(read(draftFile).draft);
if(!draft.hotspotUpdates||!isAppContentSnapshot(sources.appContent?.payload))throw new Error('historical_candidate_required');
for(const change of draft.banks){
 const previous=sources.banks.find(b=>b.bankId===change.bankId);
 if(!previous||previous.checksum!==change.baseChecksum||hash(previous.payload)!==previous.checksum)throw new Error('candidate_source_changed');
 validateBank(change.payload,previous.payload);
}
validateExclusions(draft,sources.banks);
const opi=draft.banks.find(b=>b.bankId==='opi')?.payload??sources.banks.find(b=>b.bankId==='opi')?.payload;
const briefs=replaceHistoricalHotspots(sources.appContent.payload,draft.hotspotUpdates);
validateHotspotReferences(briefs,validateBank(opi,opi));
const selected=new Set(draft.hotspotUpdates.briefs.flatMap(b=>b.topics.flatMap(t=>t.cardIds)));
if(draft.decisions.some(d=>d.kind==='unresolved')||[...selected].some(id=>!draft.decisions.some(d=>d.cardId===id&&!['excluded','unresolved'].includes(d.kind))))throw new Error('candidate_decisions_incomplete');
const manifest=read(manifestFile),audio=[];
for(const file of manifest.files){
 const p=resolve(resourceRoot,file.sourceRelativePath);if(!p.startsWith(resolve(resourceRoot)+sep))throw new Error('unsafe_resource_path');
 const bytes=readFileSync(p);
 if(bytes.length!==file.sizeBytes||createHash('sha256').update(bytes).digest('hex')!==file.checksum)throw new Error('candidate_resource_integrity_failed');
 const card=cardsOf(validateBank(opi,opi)).find(e=>e.card.audio===file.publicPath)?.card;
 if(!card)throw new Error('unreferenced_candidate_audio');
 execFileSync('ffmpeg',['-v','error','-nostdin','-i',p,'-f','null','-'],{stdio:'pipe'});
 const duration=Number(execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','csv=p=0',p],{encoding:'utf8'}));
 if(Math.abs(duration-file.durationSeconds)>.05||duration<.15||duration>900)throw new Error('candidate_audio_duration_invalid');
 audio.push({cardId:card.id,audioText:card.audioText,duration,checksum:file.checksum,decoded:true,listeningVerified:false});
}
console.log(JSON.stringify({status:'offline_checks_passed',productionPublished:false,hotspots:briefs.length,references:briefs.reduce((n,b)=>n+b.topics.reduce((m,t)=>m+t.cardIds.length,0),0),uniqueCards:selected.size,excluded: draft.decisions.filter(d=>d.kind==='excluded').length,audio,remaining:['新音频逐条试听','资源上传并核对线上字节','正式工单审核及发布','实际学习入口验证','成功项归档']},null,2));
