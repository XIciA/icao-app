import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import { applyVocabularyEdits, type VocabularyEdit } from '@icao/contracts/vocabulary-edit';
import { vocabularyTerms, type VocabularyLiveContent } from '@icao/contracts/vocabulary-live';
import type { VocabularyWord } from '@icao/contracts';
import { createHash } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import { opsAuditEvents, opsStaffAccounts, questionBankReleases, resourceObjects, vocabularyReleases } from '../database/schema';
import { VocabularyLiveService, VOCABULARY_PUBLICATION_LOCK, vocabularyContentChecksum } from '../vocabulary/vocabulary-live.service';
import { AdminAuditService } from './admin-audit.service';
import type { VocabularyHistoryDetail, VocabularyHistoryItem, VocabularyHistoryPage, VocabularyLevelMove, VocabularyLevelPlan, VocabularyLevelPublication } from '@icao/contracts/vocabulary-admin';
import { levelEdits, vocabularyHistoryChanges } from './vocabulary-levels';
import type { OpsAuthenticatedRequest } from './admin.types';

export function pronunciationPath(text: string) {
  const normalized = text.replace(/\//g, ' or ').replace(/[()（）]/g, ' ').replace(/\s+/g, ' ').trim();
  return `/pronunciation-assets/${createHash('sha256').update(normalized).digest('hex')}.mp3`;
}
export const vocabularyAudioPaths = (content: VocabularyLiveContent) => [...new Set(content.dataset.books.flatMap(book => book.words.flatMap(word => [pronunciationPath(word.pronunciationText ?? word.word), pronunciationPath(word.example)])))];

/** Only exact English fields from the published banks count, matching the batch compiler's scope. */
export function liveWordFrequency(word: VocabularyWord, banks: { bankId: string; version: number; checksum: string; payload: unknown }[]) {
  const normalized = (value: string) => value.normalize('NFKC').replace(/[‘’‛ʻʼ]/g, "'").replace(/[‐‑‒–—―−]/g, '-').toLowerCase().replace(/\s+/g, ' ').trim();
  const forms = [...new Set([...vocabularyTerms(word), ...(word.relatedExpressions ?? [])].map(normalized))].sort((a,b)=>b.length-a.length);
  const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(?<![a-z0-9-])(?:${forms.map(form=>escape(form).replace(/ /g,'[ -]+')).join('|')})(?![a-z0-9-])`, 'gu');
  const byBank: Record<string, number> = {}; const cards = new Set<string>(); let occurrences=0;
  for (const bank of banks) {
    const visit = (node: unknown) => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) { node.forEach(visit); return; }
      const row = node as Record<string, unknown>;
      if (typeof row.id === 'string' && row.kind && row.kind !== 'image') {
        const fields = [row.audioText, ...(bank.bankId === 'listening' ? [] : [row.referenceText]), ...(Array.isArray(row.choices) ? row.choices : [])];
        for (const text of fields) if (typeof text === 'string') {
          const hits = [...normalized(text).matchAll(pattern)].length;
          if (hits) { occurrences += hits; cards.add(`${bank.bankId}:${row.id}`); byBank[bank.bankId]=(byBank[bank.bankId]??0)+hits; }
        }
        return;
      }
      Object.values(row).forEach(visit);
    };
    visit(bank.payload);
  }
  return {scope:'question-bank-english-content' as const,occurrences,cardCount:cards.size,byBank,corpusVersion:Math.max(0,...banks.map(bank=>bank.version)),corpusChecksum:createHash('sha256').update(JSON.stringify(banks.map(({bankId,checksum})=>({bankId,checksum})).sort((a,b)=>a.bankId.localeCompare(b.bankId)))).digest('hex')};
}
@Injectable()
export class VocabularyAdminService {
  constructor(private readonly database: DatabaseService, private readonly live: VocabularyLiveService, private readonly audit: AdminAuditService) {}
  async read() { return this.live.get(); }
  private async plan(previous: VocabularyLiveContent, edits: VocabularyEdit[], tx: DatabaseService['db'], limit = 100) {
    if (!edits.length || edits.length > limit) throw new BadRequestException('vocabulary_edits_limit');
    let next: VocabularyLiveContent;
    try {
      const prior=new Map(previous.dataset.books.flatMap(book=>book.words.map(word=>[word.id,word] as const)));
      const corpus=previous.dataset.books[0]!.words[0]!.frequency!;
      const complete=(word:VocabularyWord)=>({...word,frequency:prior.get(word.id)?.frequency??{...corpus,occurrences:0,cardCount:0,byBank:{}}});
      next=applyVocabularyEdits(previous,edits.map(edit=>edit.type==='upsert'?{...edit,word:complete(edit.word)}:edit.type==='split'?{...edit,words:edit.words.map(complete)}:edit));
    } catch (error) { throw new BadRequestException(error instanceof Error ? error.message : 'invalid_vocabulary_edits'); }
    const old = new Map(previous.dataset.books.flatMap(book=>book.words.map(word=>[word.id,word] as const)));
    const changed = next.dataset.books.flatMap(book=>book.words).filter(word=> !old.has(word.id) || old.get(word.id)!.word !== word.word || JSON.stringify(old.get(word.id)!.relatedExpressions) !== JSON.stringify(word.relatedExpressions));
    if (changed.length) {
      const banks=await tx.select().from(questionBankReleases).where(eq(questionBankReleases.active,true));
      if (banks.length !== 5) throw new ConflictException('vocabulary_frequency_corpus_incomplete');
      for (const word of changed) word.frequency=liveWordFrequency(word,banks);
    }
    const paths=vocabularyAudioPaths(next);
    const resources=await tx.select({path:resourceObjects.sourcePath}).from(resourceObjects).where(and(inArray(resourceObjects.sourcePath,paths),eq(resourceObjects.status,'ready'),eq(resourceObjects.mimeType,'audio/mpeg'),eq(resourceObjects.storageBucket,'question-bank-assets')));
    const ready = new Set(resources.map(row=>row.path));
    const missing = paths.filter(path=>!ready.has(path));
    return {content:next,checksum:vocabularyContentChecksum(next),missingAudio:missing};
  }
  async preview(baseVersion:number, edits:VocabularyEdit[]) {
    return this.database.db.transaction(async tx=>{
      await tx.execute(sql`select pg_advisory_xact_lock(${VOCABULARY_PUBLICATION_LOCK})`);
      const previous=await this.live.get(tx);
      if (previous.version!==baseVersion) throw new ConflictException('vocabulary_version_changed_reload');
      return this.plan(previous,edits,tx);
    });
  }
  async publish(baseVersion:number, edits:VocabularyEdit[], expectedChecksum:string, request:OpsAuthenticatedRequest) {
    return this.database.db.transaction(async tx=>{
      await tx.execute(sql`select pg_advisory_xact_lock(${VOCABULARY_PUBLICATION_LOCK})`);
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('app_content_publish'))`);
      const previous=await this.live.get(tx);
      if (previous.version!==baseVersion) throw new ConflictException('vocabulary_version_changed_reload');
      const planned=await this.plan(previous,edits,tx);
      if (planned.checksum!==expectedChecksum) throw new ConflictException('vocabulary_preview_changed');
      if (planned.missingAudio.length) throw new ConflictException('vocabulary_audio_incomplete');
      await this.commitRelease(previous, planned, request, tx, {
        action:'ops.vocabulary.publish', reason:'后台词库保存发布',
        metadata:{edits:edits.map(edit=>({type:edit.type,...('id' in edit?{id:edit.id}:{} )}))},
      });
      return {...planned.content,checksum:planned.checksum};
    });
  }

  private async commitRelease(previous: Awaited<ReturnType<VocabularyLiveService['get']>>, planned: {content:VocabularyLiveContent;checksum:string}, request:OpsAuthenticatedRequest, tx:DatabaseService['db'], audit:{action:string;reason:string;metadata:Record<string,unknown>}) {
    await tx.insert(vocabularyReleases).values({version:previous.version,checksum:previous.checksum,payload:{schemaVersion:previous.schemaVersion,catalogId:previous.catalogId,version:previous.version,dataset:previous.dataset,policy:previous.policy},active:false}).onConflictDoNothing();
    await tx.update(vocabularyReleases).set({active:false}).where(eq(vocabularyReleases.active,true));
    await tx.insert(vocabularyReleases).values({version:planned.content.version,checksum:planned.checksum,payload:planned.content,active:true});
    await this.audit.record({requestId:request.id,actorStaffId:request.opsStaff!.id,actorRole:request.opsStaff!.role,action:audit.action,targetType:'vocabulary_release',targetId:String(planned.content.version),reason:audit.reason,beforeState:{version:previous.version,checksum:previous.checksum},afterState:{version:planned.content.version,checksum:planned.checksum},metadata:audit.metadata},tx);
  }

  private async levelPlan(previous: Awaited<ReturnType<VocabularyLiveService['get']>>, moves:VocabularyLevelMove[], tx:DatabaseService['db']) {
    const edits=levelEdits(previous,moves);
    const planned=await this.plan(previous,edits,tx,5000);
    const changes=vocabularyHistoryChanges(previous,planned.content).filter(change=>change.before&&change.after).map(change=>({id:change.id,word:change.word,from:change.before!.bookId,to:change.after!.bookId}));
    const summary:VocabularyLevelPlan={baseVersion:previous.version,checksum:planned.checksum,changes,counts:previous.dataset.books.map(book=>({id:book.id,name:book.name,before:book.words.length,after:planned.content.dataset.books.find(next=>next.id===book.id)!.words.length})),missingAudio:planned.missingAudio};
    return {planned,summary};
  }

  async previewLevels(baseVersion:number,moves:VocabularyLevelMove[]) {
    return this.database.db.transaction(async tx=>{
      await tx.execute(sql`select pg_advisory_xact_lock(${VOCABULARY_PUBLICATION_LOCK})`);
      const previous=await this.live.get(tx);
      if(previous.version!==baseVersion)throw new ConflictException('vocabulary_version_changed_reload');
      return (await this.levelPlan(previous,moves,tx)).summary;
    });
  }

  async publishLevels(input:{baseVersion:number;moves:VocabularyLevelMove[];checksum:string;batchId:string;note:string},request:OpsAuthenticatedRequest):Promise<VocabularyLevelPublication> {
    const fingerprint=createHash('sha256').update(JSON.stringify({baseVersion:input.baseVersion,moves:[...input.moves].sort((a,b)=>a.id.localeCompare(b.id)),checksum:input.checksum,note:input.note})).digest('hex');
    return this.database.db.transaction(async tx=>{
      await tx.execute(sql`select pg_advisory_xact_lock(${VOCABULARY_PUBLICATION_LOCK})`);
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('app_content_publish'))`);
      const [existing]=await tx.select().from(opsAuditEvents).where(and(eq(opsAuditEvents.action,'ops.vocabulary.levels'),eq(opsAuditEvents.actorStaffId,request.opsStaff!.id),sql`${opsAuditEvents.metadata}->>'batchId' = ${input.batchId}`)).limit(1);
      if(existing){
        if((existing.metadata as Record<string,unknown>).fingerprint!==fingerprint)throw new ConflictException('vocabulary_batch_id_reused');
        return {release:await this.live.get(tx),publishedVersion:Number(existing.targetId),alreadyPublished:true};
      }
      const previous=await this.live.get(tx);
      if(previous.version!==input.baseVersion)throw new ConflictException('vocabulary_version_changed_reload');
      const {planned,summary}=await this.levelPlan(previous,input.moves,tx);
      if(planned.checksum!==input.checksum)throw new ConflictException('vocabulary_preview_changed');
      if(planned.missingAudio.length)throw new ConflictException('vocabulary_audio_incomplete');
      await this.commitRelease(previous,planned,request,tx,{action:'ops.vocabulary.levels',reason:'后台批量调整等级',metadata:{batchId:input.batchId,fingerprint,note:input.note,changes:summary.changes}});
      return {release:{...planned.content,checksum:planned.checksum},publishedVersion:planned.content.version,alreadyPublished:false};
    });
  }

  private async historyItem(row:typeof vocabularyReleases.$inferSelect,previous?:typeof vocabularyReleases.$inferSelect):Promise<VocabularyHistoryDetail> {
    const [event]=await this.database.db.select({event:opsAuditEvents,actor:opsStaffAccounts.email}).from(opsAuditEvents).leftJoin(opsStaffAccounts,eq(opsAuditEvents.actorStaffId,opsStaffAccounts.id)).where(and(eq(opsAuditEvents.targetType,'vocabulary_release'),eq(opsAuditEvents.targetId,String(row.version)),inArray(opsAuditEvents.action,['ops.vocabulary.levels','ops.vocabulary.publish','ops.vocabulary.import']))).orderBy(desc(opsAuditEvents.sequence)).limit(1);
    const changes=vocabularyHistoryChanges(previous?.payload as VocabularyLiveContent|undefined,row.payload as VocabularyLiveContent);
    const metadata=event?.event.metadata as Record<string,unknown>|undefined;
    return {version:row.version,previousVersion:previous?.version??null,createdAt:(event?.event.createdAt??row.createdAt).toISOString(),actor:event?.actor??(event?'系统导入':'未记录'),type:event?.event.action==='ops.vocabulary.levels'?'levels':event?.event.action==='ops.vocabulary.publish'?'edit':event?'import':'baseline',note:typeof metadata?.note==='string'?metadata.note:event?.event.reason??'',changeCount:changes.length,levelChanges:changes.filter(change=>change.before&&change.after&&change.before.bookId!==change.after.bookId).map(change=>({id:change.id,word:change.word,from:change.before!.bookId,to:change.after!.bookId})),changes};
  }

  async history(query:{cursor?:number;word?:string;actor?:string;type?:string;from?:string;to?:string}):Promise<VocabularyHistoryPage> {
    const rows=await this.database.db.select().from(vocabularyReleases).where(query.cursor?lt(vocabularyReleases.version,query.cursor):undefined).orderBy(desc(vocabularyReleases.version)).limit(21);
    const items:VocabularyHistoryItem[]=[];
    for(let i=0;i<Math.min(rows.length,20);i++){
      const detail=await this.historyItem(rows[i]!,rows[i+1]);
      const needle=query.word?.toLowerCase();
      if(needle&&!detail.changes.some(change=>[change.id,change.word,change.before?.word,change.before?.meaning,change.after?.meaning].some(value=>value?.toLowerCase().includes(needle))))continue;
      if(query.actor&&!detail.actor.toLowerCase().includes(query.actor.toLowerCase())||query.type&&query.type!==detail.type||query.from&&detail.createdAt<query.from||query.to&&detail.createdAt>=query.to)continue;
      items.push({version:detail.version,previousVersion:detail.previousVersion,createdAt:detail.createdAt,actor:detail.actor,type:detail.type,note:detail.note,changeCount:detail.changeCount,levelChanges:detail.levelChanges});
    }
    return {items,nextCursor:rows.length>20?rows[19]!.version:null};
  }

  async historyDetail(version:number):Promise<VocabularyHistoryDetail> {
    const rows=await this.database.db.select().from(vocabularyReleases).where(sql`${vocabularyReleases.version} <= ${version}`).orderBy(desc(vocabularyReleases.version)).limit(2);
    if(rows[0]?.version!==version)throw new BadRequestException('vocabulary_history_missing');
    return this.historyItem(rows[0],rows[1]);
  }

}
