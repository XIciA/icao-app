/** Validate/plan an immutable vocabulary release; publication is explicit and hash-bound.
 * Run only from the reviewed mainline release after authorized schema/resource preparation. */
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { canonicalVocabularyJson, validateVocabularyLiveContent, validateVocabularyPolicyTransition } from '@icao/contracts/vocabulary-live';

export function readVocabularyImport(path) {
  const content=validateVocabularyLiveContent(JSON.parse(readFileSync(path,'utf8')));
  const checksum=createHash('sha256').update(canonicalVocabularyJson(content)).digest('hex');
  const audioPaths=[...new Set(content.dataset.books.flatMap(book=>book.words.flatMap(word=>[word.pronunciationText,word.example].map(text=>{
    const normalized=text.replace(/\//g,' or ').replace(/[()（）]/g,' ').replace(/\s+/g,' ').trim();
    return `/pronunciation-assets/${createHash('sha256').update(normalized).digest('hex')}.mp3`;
  }))))];
  return {content,checksum,audioPaths,summary:{version:content.version,checksum,words:content.dataset.books.reduce((n,book)=>n+book.words.length,0),books:Object.fromEntries(content.dataset.books.map(book=>[book.id,book.words.length])),retiredIds:Object.keys(content.policy.retiredIds).length,audioPaths:audioPaths.length}};
}
export async function vocabularyImportPlan(tx,candidate) {
  const [active]=await tx`select version,checksum,payload,active from vocabulary_releases where active=true order by version desc limit 1`;
  if(!active){const [history]=await tx`select version from vocabulary_releases limit 1`;if(history)throw new Error('vocabulary_active_release_missing');}
  if(active){
    const previous=validateVocabularyLiveContent(active.payload);
    if(createHash('sha256').update(canonicalVocabularyJson(previous)).digest('hex')!==active.checksum)throw new Error('vocabulary_existing_checksum_invalid');
    if(active.version===candidate.content.version&&active.checksum===candidate.checksum){/* exact retry */}
    else validateVocabularyPolicyTransition(previous,candidate.content);
  }
  const ready=await tx`select source_path from resource_objects where source_path in ${tx(candidate.audioPaths)} and status='ready' and mime_type='audio/mpeg' and storage_bucket='question-bank-assets' and size_bytes>0`;
  const paths=new Set(ready.map(row=>row.source_path));
  return {...candidate.summary,baseVersion:active?.version??null,alreadyPublished:active?.version===candidate.content.version&&active.checksum===candidate.checksum,missingAudio:candidate.audioPaths.filter(path=>!paths.has(path))};
}
export async function importVocabulary(mode,path,environment=process.env) {
  const candidate=readVocabularyImport(path);
  if(mode==='validate')return candidate.summary;
  if(!environment.DATABASE_URL)throw new Error('missing_DATABASE_URL');
  const db=postgres(environment.DATABASE_URL,{max:2,prepare:false});
  try {
    if(mode==='plan')return await vocabularyImportPlan(db,candidate);
    if(mode!=='publish')throw new Error('invalid_vocabulary_import_mode');
    if(environment.VOCABULARY_PUBLISH_CONFIRM!==candidate.checksum)throw new Error('vocabulary_publish_checksum_confirmation_required');
    if(!environment.VOCABULARY_PUBLISH_REASON?.trim()||environment.VOCABULARY_PUBLISH_REASON.length>1000)throw new Error('vocabulary_publish_reason_required');
    if(environment.NODE_ENV==='production'&&(!environment.API_RELEASE_ID||environment.VOCABULARY_PUBLISH_RELEASE_ID!==environment.API_RELEASE_ID))throw new Error('vocabulary_publish_runtime_release_mismatch');
    return await db.begin(async tx=>{
      await tx`select pg_advisory_xact_lock(1863401)`;
      await tx`select pg_advisory_xact_lock(hashtext('app_content_publish'))`;
      const plan=await vocabularyImportPlan(tx,candidate);
      if(plan.missingAudio.length)throw new Error('vocabulary_audio_incomplete');
      if(plan.alreadyPublished)return plan;
      const expected=plan.baseVersion===null?'empty':String(plan.baseVersion);
      if(environment.VOCABULARY_EXPECTED_BASE!==expected)throw new Error('vocabulary_publish_base_version_changed');
      await tx`update vocabulary_releases set active=false where active=true`;
      await tx`insert into vocabulary_releases(version,checksum,payload,active) values(${candidate.content.version},${candidate.checksum},${tx.json(candidate.content)},true)`;
      await tx`insert into ops_audit_events(request_id,action,target_type,target_id,reason,before_state,after_state,metadata) values(${`vocabulary-import-${randomUUID()}`},'ops.vocabulary.import','vocabulary_release',${String(candidate.content.version)},${environment.VOCABULARY_PUBLISH_REASON},${tx.json({version:plan.baseVersion})},${tx.json(candidate.summary)},${tx.json({releaseId:environment.API_RELEASE_ID??'local-test'})})`;
      return {...plan,published:true};
    });
  }finally{await db.end({timeout:5});}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const mode=process.argv[2]?.replace(/^--/,'')??'validate';
  if(!['validate','plan','publish'].includes(mode))throw new Error('invalid_vocabulary_import_mode');
  const path=resolve(process.env.VOCABULARY_IMPORT_FILE??fileURLToPath(new URL('../../../content/vocabulary/live/release.json',import.meta.url)));
  console.log(JSON.stringify(await importVocabulary(mode,path)));
}
