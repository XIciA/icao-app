import { BadRequestException, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { and, desc, eq, sql } from 'drizzle-orm';
import { OPS_API_CONFIG, type OpsApiConfig } from '../config';
import { DatabaseService } from '../database/database.service';
import { resourceObjects } from '../database/schema';
import { AdminAuditService } from './admin-audit.service';
import type { OpsAuthenticatedRequest } from './admin.types';
import { pronunciationPath } from './vocabulary-admin.service';

/** Scan complete MPEG Layer III frames, rejecting truncated or disguised files. */
export function mp3Duration(bytes:Buffer) {
  if (bytes.length < 100 || bytes.length > 5_000_000) throw new BadRequestException('invalid_vocabulary_mp3_size');
  let offset=0;
  if (bytes.subarray(0,3).toString()==='ID3') {
    if (bytes.length<10 || [6,7,8,9].some(index=>(bytes[index]!&128)!==0)) throw new BadRequestException('invalid_mp3_id3');
    offset=10+((bytes[6]!<<21)|(bytes[7]!<<14)|(bytes[8]!<<7)|bytes[9]!)+(bytes[5]!&16?10:0);
  }
  let duration=0,frames=0;
  while (offset+4<=bytes.length) {
    if (bytes.length-offset===128 && bytes.subarray(offset,offset+3).toString()==='TAG') {offset+=128;break;}
    const a=bytes[offset]!,b=bytes[offset+1]!,c=bytes[offset+2]!;
    const version=(b>>3)&3,layer=(b>>1)&3,rateIndex=(c>>2)&3,bitrateIndex=(c>>4)&15;
    if (a!==255 || (b&224)!==224 || version===1 || layer!==1 || rateIndex===3 || bitrateIndex===0 || bitrateIndex===15) throw new BadRequestException('invalid_vocabulary_mp3_frames');
    const bitrate=(version===3?[0,32,40,48,56,64,80,96,112,128,160,192,224,256,320]:[0,8,16,24,32,40,48,56,64,80,96,112,128,144,160])[bitrateIndex]!;
    const rate=[44100,48000,32000][rateIndex]!/(version===3?1:version===2?2:4);
    const length=Math.floor((version===3?144:72)*bitrate*1000/rate)+((c>>1)&1);
    if (offset+length>bytes.length || length<24) throw new BadRequestException('truncated_vocabulary_mp3');
    offset+=length; duration+=(version===3?1152:576)/rate*1000; frames++;
  }
  if (offset!==bytes.length || frames<4 || duration<200 || duration>120000) throw new BadRequestException('invalid_vocabulary_mp3_duration');
  return Math.round(duration);
}
@Injectable()
export class VocabularyAudioService {
  constructor(@Inject(OPS_API_CONFIG) private readonly config:OpsApiConfig,private readonly database:DatabaseService,private readonly audit:AdminAuditService) {}
  async resource(text:string) {
    const [row]=await this.database.db.select().from(resourceObjects).where(and(eq(resourceObjects.sourcePath,pronunciationPath(text)),eq(resourceObjects.status,'ready'))).orderBy(desc(resourceObjects.createdAt)).limit(1);
    if (!row) throw new BadRequestException('vocabulary_audio_missing');
    return row;
  }
  async upload(text:string, data:string, request:OpsAuthenticatedRequest) {
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(data)) throw new BadRequestException('invalid_vocabulary_audio_encoding');
    const bytes=Buffer.from(data,'base64');
    if (bytes.toString('base64')!==data) throw new BadRequestException('invalid_vocabulary_audio_encoding');
    const durationMs=mp3Duration(bytes);
    const base=this.config.opsFeedbackStorageUrl,token=this.config.opsVocabularyStorageWriteToken;
    if (!base||!token) throw new ServiceUnavailableException('vocabulary_audio_upload_unconfigured');
    const sourcePath=pronunciationPath(text),checksum=createHash('sha256').update(bytes).digest('hex');
    const objectKey=`vocabulary/${sourcePath.split('/').pop()!.replace('.mp3','')}-${checksum}.mp3`;
    const storage=createClient(base.replace(/\/storage\/v1\/?$/,''),token,{auth:{persistSession:false},global:{fetch:(url,init)=>fetch(url,{...init,signal:AbortSignal.timeout(30000),redirect:'error'})}}).storage.from('question-bank-assets');
    const verify=async()=>{const result=await storage.download(objectKey);if(result.error||!result.data||result.data.size!==bytes.length)return false;return createHash('sha256').update(Buffer.from(await result.data.arrayBuffer())).digest('hex')===checksum;};
    const existing=await storage.download(objectKey);
    if (!existing.error) { if(existing.data.size!==bytes.length||createHash('sha256').update(Buffer.from(await existing.data.arrayBuffer())).digest('hex')!==checksum)throw new ServiceUnavailableException('vocabulary_audio_immutable_conflict'); }
    else {
      if(Number(existing.error.statusCode??existing.error.status)!==404)throw new ServiceUnavailableException('vocabulary_audio_storage_unavailable');
      const result=await storage.upload(objectKey,bytes,{contentType:'audio/mpeg',upsert:false});
      if(result.error&&!await verify())throw new ServiceUnavailableException('vocabulary_audio_upload_failed');
      if(!await verify())throw new ServiceUnavailableException('vocabulary_audio_upload_verification_failed');
    }
    await this.database.db.transaction(async tx=>{
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('app_content_publish'))`);
      await tx.update(resourceObjects).set({status:'superseded'}).where(and(eq(resourceObjects.sourcePath,sourcePath),eq(resourceObjects.status,'ready')));
      await tx.insert(resourceObjects).values({objectKey,module:'vocabulary',sourcePath,checksum,sizeBytes:bytes.length,mimeType:'audio/mpeg',status:'ready'}).onConflictDoUpdate({target:resourceObjects.objectKey,set:{status:'ready'}});
      await this.audit.record({requestId:request.id,actorStaffId:request.opsStaff!.id,actorRole:request.opsStaff!.role,action:'ops.vocabulary.audio',targetType:'resource',targetId:objectKey,reason:'后台词库录音上传',metadata:{text,checksum,sizeBytes:bytes.length,durationMs}},tx);
    });
    return {sourcePath,checksum,sizeBytes:bytes.length,durationMs};
  }
}
