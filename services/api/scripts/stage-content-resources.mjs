/** Upload immutable files and register them for work-order preview/publication.
 * No question releases or learning tables are changed by this command. */
import { readFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';
import { ensureNativeContentResource } from './native-content-resources.mjs';
import { contentChecksum } from './native-content-release.mjs';

for (const key of ['RESOURCE_MANIFEST','RESOURCE_ROOT']) if (!process.env[key]) throw new Error(`missing_${key}`);
const root=resolve(process.env.RESOURCE_ROOT);
const manifest=JSON.parse(readFileSync(resolve(process.env.RESOURCE_MANIFEST),'utf8'));
if(manifest.schemaVersion!==1||!Array.isArray(manifest.files))throw new Error('invalid_resource_manifest');
const seen=new Set();
for(const file of manifest.files){
 if(!/^[a-f0-9]{64}$/.test(file.checksum)||!['audio/mpeg','image/jpeg','image/png'].includes(file.mimeType)||!['opi','listening','sentences900','radiotelephony','storytelling','vocabulary','editorial'].includes(file.bankId)||!Number.isSafeInteger(file.sizeBytes)||file.sizeBytes<1||file.sizeBytes>52428800||file.status!=='ready')throw new Error('invalid_resource');
 if(!/^\/(question-bank-assets|pronunciation-assets|editorial-assets)\//.test(file.publicPath)||/[?#\\]/.test(file.publicPath)||file.publicPath.split('/').some(part=>part==='..'||part==='.')||seen.has(file.publicPath))throw new Error('invalid_resource_path');
 seen.add(file.publicPath);
 const local=resolve(root,file.sourceRelativePath??file.objectKey);
 if(!local.startsWith(root+sep)||!file.objectKey||/[?#\\]/.test(file.objectKey)||file.objectKey.split('/').some(part=>!part||part==='..'||part==='.'))throw new Error('invalid_resource_key');
 const bytes=readFileSync(local);
 if(bytes.length!==file.sizeBytes||contentChecksum(bytes)!==file.checksum)throw new Error('source_resource_checksum_mismatch');
}
if(process.argv.includes('--validate'))console.log(`resource_stage_valid files=${manifest.files.length}`);
else{
 for(const key of ['DATABASE_URL','SUPABASE_URL','SUPABASE_SECRET_KEY'])if(!process.env[key])throw new Error(`missing_${key}`);
 const db=postgres(process.env.DATABASE_URL,{max:2,prepare:false});
 const storage=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false},global:{fetch:(url,init)=>fetch(url,{...init,signal:AbortSignal.timeout(60000)})}}).storage.from('question-bank-assets');
 try{
  let count=0;
  for(const file of manifest.files){
   const [existing]=await db`select checksum,size_bytes,source_path from resource_objects where object_key=${file.objectKey}`;
   if(existing&&(existing.checksum!==file.checksum||Number(existing.size_bytes)!==file.sizeBytes||existing.source_path!==file.publicPath))throw new Error('resource_object_immutable');
   if(!existing||process.argv.includes('--verify-existing'))await ensureNativeContentResource(storage,file,readFileSync(resolve(root,file.sourceRelativePath??file.objectKey)));
   await db.begin(async tx=>{
    await tx`select pg_advisory_xact_lock(hashtext('app_content_publish'))`;
    await tx`update resource_objects set status='superseded' where source_path=${file.publicPath} and object_key<>${file.objectKey} and status='ready'`;
    await tx`insert into resource_objects(object_key,module,storage_bucket,source_path,checksum,size_bytes,mime_type,status) values(${file.objectKey},${file.bankId},'question-bank-assets',${file.publicPath},${file.checksum},${file.sizeBytes},${file.mimeType},'ready') on conflict(object_key) do nothing`;
   });
   if(++count%100===0)console.log(`resource_stage_progress ${count}/${manifest.files.length}`);
  }
  console.log(`resource_stage_complete files=${manifest.files.length}`);
 }finally{await db.end({timeout:5});}
}
