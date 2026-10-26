import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { applyVocabularyEdits, type VocabularyEdit } from '@icao/contracts/vocabulary-edit';
import { vocabularyTerms, type VocabularyLiveContent } from '@icao/contracts/vocabulary-live';
import type { VocabularyWord } from '@icao/contracts';
import { createHash } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import { questionBankReleases, resourceObjects, vocabularyReleases } from '../database/schema';
import { VocabularyLiveService, VOCABULARY_PUBLICATION_LOCK, vocabularyContentChecksum } from '../vocabulary/vocabulary-live.service';
import { AdminAuditService } from './admin-audit.service';
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
  private async plan(previous: VocabularyLiveContent, edits: VocabularyEdit[], tx: DatabaseService['db']) {
    if (!edits.length || edits.length > 100) throw new BadRequestException('vocabulary_edits_limit');
    let next: VocabularyLiveContent;
    try { next=applyVocabularyEdits(previous,edits); } catch (error) { throw new BadRequestException(error instanceof Error ? error.message : 'invalid_vocabulary_edits'); }
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
      // Preserve the baseline as immutable history before the first admin change.
      await tx.insert(vocabularyReleases).values({version:previous.version,checksum:previous.checksum,payload:{schemaVersion:previous.schemaVersion,catalogId:previous.catalogId,version:previous.version,dataset:previous.dataset,policy:previous.policy},active:false}).onConflictDoNothing();
      await tx.update(vocabularyReleases).set({active:false}).where(eq(vocabularyReleases.active,true));
      await tx.insert(vocabularyReleases).values({version:planned.content.version,checksum:planned.checksum,payload:planned.content,active:true});
      await this.audit.record({requestId:request.id,actorStaffId:request.opsStaff!.id,actorRole:request.opsStaff!.role,action:'ops.vocabulary.publish',targetType:'vocabulary_release',targetId:String(planned.content.version),reason:'后台词库保存发布',beforeState:{version:previous.version,checksum:previous.checksum},afterState:{version:planned.content.version,checksum:planned.checksum},metadata:{edits:edits.map(edit=>({type:edit.type,...('id' in edit?{id:edit.id}:{})}))}},tx);
      return {...planned.content,checksum:planned.checksum};
    });
  }
}
