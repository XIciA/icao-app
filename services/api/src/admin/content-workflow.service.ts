import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import type { ContentDraft, ContentOrderInput } from '@icao/contracts/content-workflow';
import type { EditorialReleaseSnapshot } from '@icao/contracts';
import { isAppContentSnapshot, canonicalAppContentJson } from '@icao/contracts/app-content';
import { DatabaseService } from '../database/database.service';
import { contentWorkOrders, questionBankReleases, appContentReleases, editorialReleases, resourceObjects } from '../database/schema';
import { AdminAuditService } from './admin-audit.service';
import type { OpsAuthenticatedRequest } from './admin.types';
import { bankSchema, cardsOf, parseDraft, validateBank } from './content-workflow-validation';
import { rebaseBank } from './content-workflow-rebase';
type Tx = Parameters<Parameters<DatabaseService['db']['transaction']>[0]>[0];
const checksum = (value: unknown) => createHash('sha256').update(canonicalAppContentJson(value)).digest('hex');

@Injectable()
export class ContentWorkflowService {
  constructor(private readonly database: DatabaseService, private readonly audit: AdminAuditService) {}
  async list() {
    const { id, kind, examDate, center, status, revision, publishedRevision, createdAt, updatedAt } = contentWorkOrders;
    return this.database.db.select({ id, kind, examDate, center, status, revision, publishedRevision, createdAt, updatedAt })
      .from(contentWorkOrders).orderBy(desc(updatedAt)).limit(500);
  }
  async get(id: string) {
    const [row]=await this.database.db.select().from(contentWorkOrders).where(eq(contentWorkOrders.id,id));
    if(!row) throw new NotFoundException('content_order_not_found'); return row;
  }
  async previewResource(id:string,path:string) {
    const order=await this.get(id);const draft=parseDraft(order.draft);
    const sources=await this.sources();
    const changedIds=new Set(draft.banks.flatMap(b=>cardsOf(bankSchema.parse(b.payload)).map(e=>e.card.id)));
    const decisionIds=new Set(draft.decisions.map(d=>d.cardId));
    const cards=sources.banks.flatMap(b=>cardsOf(bankSchema.parse(draft.banks.find(c=>c.bankId===b.bankId)?.payload??b.payload)));
    const referenced=cards.some(e=>(e.card.audio===path||e.card.image===path)&&(changedIds.has(e.card.id)||decisionIds.has(e.card.id)));
    if(!referenced && draft.article?.cover.publicPath!==path) throw new NotFoundException('preview_resource_not_referenced');
    const [resource]=await this.database.db.select().from(resourceObjects).where(and(eq(resourceObjects.sourcePath,path),eq(resourceObjects.status,'ready'))).orderBy(desc(resourceObjects.createdAt)).limit(1);
    if(!resource) throw new NotFoundException('preview_resource_missing');return resource;
  }
  async sources() {
    return { banks:await this.database.db.select().from(questionBankReleases).where(eq(questionBankReleases.active,true)),
      appContent:(await this.database.db.select().from(appContentReleases).where(eq(appContentReleases.active,true)))[0],
      editorial:(await this.database.db.select().from(editorialReleases).where(eq(editorialReleases.active,true)))[0] };
  }
  async create(input: ContentOrderInput, request: OpsAuthenticatedRequest) {
    return this.database.db.transaction(async tx=>{
      // Serialize duplicates so concurrent submissions cannot create two date/center orders.
      await tx.execute(sql`select pg_advisory_xact_lock(1781017)`);
      if(input.kind==='opi') {
        const [existing]=await tx.select().from(contentWorkOrders).where(and(eq(contentWorkOrders.examDate,input.examDate!),eq(contentWorkOrders.center,input.center!),eq(contentWorkOrders.kind,'opi')));
        if(existing) return {order:existing,duplicate:true};
      }
      const [order]=await tx.insert(contentWorkOrders).values(input).returning();
      if(!order) throw new Error('content_order_insert_failed');
      await this.log(tx,request,order.id,'create',order.revision); return {order,duplicate:false};
    });
  }
  async append(id:string, revision:number, text:string, request:OpsAuthenticatedRequest) {
    return this.database.db.transaction(async tx=>{
      const current=await this.lock(tx,id,revision);
      const [next]=await tx.update(contentWorkOrders).set({text:current.text+'\n\n'+text,revision:revision+1,status:'pending',draft:null,updatedAt:new Date()}).where(eq(contentWorkOrders.id,id)).returning();
      if(!next) throw new Error('content_order_update_failed');
      await this.log(tx,request,id,'append',next.revision); return next;
    });
  }
  async stage(id:string,revision:number,value:unknown,request:OpsAuthenticatedRequest) {
    const draft=parseDraft(value);
    return this.database.db.transaction(async tx=>{
      const current=await this.lock(tx,id,revision);
      if(current.status==='published') throw new ConflictException('append_to_create_new_revision');
      if(current.kind==='opi' && (!draft.hotspot || draft.hotspot.date!==current.examDate || draft.hotspot.centers[0]!==current.center)) throw new BadRequestException('hotspot_order_mismatch');
      if(current.kind==='article' && (!draft.article || draft.hotspot || draft.banks.length)) throw new BadRequestException('article_order_mismatch');
      if(current.kind==='questions' && (draft.hotspot || draft.article || !draft.banks.length)) throw new BadRequestException('question_order_mismatch');
      if(current.kind==='opi' && draft.article) throw new BadRequestException('opi_order_mismatch');
      if(draft.article && draft.article.id!==`article-${id}`) throw new BadRequestException('article_identity_mismatch');
      if(draft.hotspot && draft.hotspot.id!==`hotspot-${current.examDate}-${createHash('sha256').update(current.center!).digest('hex').slice(0,12)}`) throw new BadRequestException('hotspot_identity_mismatch');
      // Exclusion is an explicit reviewer action, never silently selected by automation.
      if(draft.decisions.some(d=>d.kind==='excluded')) throw new BadRequestException('exclude_in_review_first');
      await this.validate(tx,draft);
      const [next]=await tx.update(contentWorkOrders).set({draft,status:'ready',revision:revision+1,updatedAt:new Date()}).where(eq(contentWorkOrders.id,id)).returning();
      if(!next) throw new Error('content_order_update_failed');
      await this.log(tx,request,id,'prepare',next.revision); return next;
    });
  }
  async exclude(id:string,revision:number,index:number,request:OpsAuthenticatedRequest) {
    return this.database.db.transaction(async tx=>{
      const current=await this.lock(tx,id,revision);const draft=parseDraft(current.draft);
      if(current.status!=='ready' || draft.decisions[index]?.kind!=='unresolved') throw new BadRequestException('invalid_exclusion');
      draft.decisions[index]={...draft.decisions[index],kind:'excluded'};
      const [next]=await tx.update(contentWorkOrders).set({draft,revision:revision+1,updatedAt:new Date()}).where(eq(contentWorkOrders.id,id)).returning();
      if(!next) throw new Error('content_order_update_failed');
      await this.log(tx,request,id,'exclude',next.revision);return next;
    });
  }
  async publish(id:string,revision:number,request:OpsAuthenticatedRequest) {
    return this.database.db.transaction(async tx=>{
      // All content publications share one transaction lock: no lost concurrent hotspot/article additions.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('app_content_publish'))`);
      const current=await this.lock(tx,id,revision);
      if(current.status==='published' && current.publishedRevision===revision) return current;
      if(current.status!=='ready') throw new ConflictException('content_order_not_ready');
      const draft=parseDraft(current.draft);
      if(draft.decisions.some(d=>d.kind==='unresolved')) throw new BadRequestException('unresolved_questions');
      await this.validate(tx,draft);
      for(const change of draft.banks) {
        const [previous]=await tx.select().from(questionBankReleases).where(and(eq(questionBankReleases.bankId,change.bankId),eq(questionBankReleases.active,true)));
        if(!previous) throw new ConflictException('content_base_missing');
        if(checksum(previous.payload)===checksum(change.payload)) continue;
        const [latest]=await tx.select().from(questionBankReleases).where(eq(questionBankReleases.bankId,change.bankId)).orderBy(desc(questionBankReleases.version)).limit(1);
        await tx.update(questionBankReleases).set({active:false}).where(eq(questionBankReleases.bankId,change.bankId));
        await tx.insert(questionBankReleases).values({bankId:change.bankId,version:(latest?.version??0)+1,checksum:checksum(change.payload),payload:change.payload,active:true});
      }
      if(draft.hotspot) {
        const [previous]=await tx.select().from(appContentReleases).where(eq(appContentReleases.active,true));
        if(!previous || !isAppContentSnapshot(previous.payload)) throw new BadRequestException('app_content_not_available');
        const payload={...previous.payload,version:previous.version+1,publishedAt:new Date().toISOString(),hotspots:{generatedAt:new Date().toISOString(),briefs:[...previous.payload.hotspots.briefs.filter(b=>b.id!==draft.hotspot!.id),draft.hotspot].sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id))}};
        if(!isAppContentSnapshot(payload)) throw new BadRequestException('invalid_hotspot_release');
        await tx.update(appContentReleases).set({active:false}).where(eq(appContentReleases.active,true));
        await tx.insert(appContentReleases).values({version:payload.version,checksum:checksum(payload),payload,active:true});
      }
      if(draft.article) {
        const [previous]=await tx.select().from(editorialReleases).where(eq(editorialReleases.active,true)).orderBy(desc(editorialReleases.version)).limit(1);
        const old=previous?.payload as EditorialReleaseSnapshot|undefined;
        const article={...draft.article,publishedAt:draft.article.publishedAt??new Date().toISOString()};
        const payload:EditorialReleaseSnapshot={schemaVersion:1,version:(previous?.version??0)+1,builtAt:new Date().toISOString(),articles:[article,...(old?.articles??[]).filter(a=>a.id!==article.id)]};
        await tx.update(editorialReleases).set({active:false}).where(eq(editorialReleases.active,true));
        await tx.insert(editorialReleases).values({version:payload.version,checksum:checksum(payload),payload,active:true});
      }
      const [next]=await tx.update(contentWorkOrders).set({status:'published',publishedRevision:revision,updatedAt:new Date()}).where(eq(contentWorkOrders.id,id)).returning();
      if(!next) throw new Error('content_order_update_failed');
      await this.log(tx,request,id,'publish',revision);return next;
    });
  }
  private async validate(tx:Tx,draft:ContentDraft) {
    const available=await tx.select().from(questionBankReleases).where(eq(questionBankReleases.active,true));
    for(const change of draft.banks) {
      const old=available.find(b=>b.bankId===change.bankId);
      if(!old) throw new ConflictException('content_base_changed_reprocess_order');
      if(old.checksum!==change.baseChecksum) {
        const [base]=await tx.select().from(questionBankReleases).where(and(eq(questionBankReleases.bankId,change.bankId),eq(questionBankReleases.checksum,change.baseChecksum))).limit(1);
        if(!base) throw new ConflictException('content_base_changed_reprocess_order');
        change.payload=rebaseBank(base.payload,change.payload,old.payload);
        change.baseChecksum=old.checksum;
      }
      if(change.payload.id!==change.bankId) throw new BadRequestException('bank_id_mismatch');
      validateBank(change.payload,old.payload);
    }
    const opi=draft.banks.find(b=>b.bankId==='opi')?.payload??available.find(b=>b.bankId==='opi')?.payload;
    if(draft.hotspot) {
      const bank=validateBank(opi,opi); const cards=cardsOf(bank);
      const ids=new Set<string>();
      for(const group of draft.hotspot.topics) for(const id of group.cardIds) {
        if(ids.has(id) || !cards.some(e=>e.topic.id===group.topicId && e.card.id===id && !e.card.retired)) throw new BadRequestException('hotspot_reference_invalid');ids.add(id);
      }
      const previousOpi=available.find(b=>b.bankId==='opi')?.payload;
      const previousIds=new Set(previousOpi?cardsOf(bankSchema.parse(previousOpi)).map(e=>e.card.id):[]);
      for(const decision of draft.decisions) {
        if(decision.kind==='new') {
          const entry=cards.find(e=>e.card.id===decision.cardId);
          if(!entry || previousIds.has(entry.card.id) || entry.card.examReported!==true || (entry.card.studyTier??0)!==0 || (entry.topic.studyTier??0)!==0) throw new BadRequestException('new_hotspot_question_scope_invalid');
        }
        if(['original','similar'].includes(decision.kind) && !previousIds.has(decision.cardId??'')) throw new BadRequestException('existing_hotspot_question_missing');
      }
      if([...ids].some(id=>!draft.decisions.some(d=>d.cardId===id&&!['unresolved','excluded'].includes(d.kind))) || !draft.decisions.length || draft.decisions.some(d=>!['unresolved','excluded'].includes(d.kind)&&(!d.cardId||!ids.has(d.cardId)))) throw new BadRequestException('hotspot_decision_invalid');
    }
    const paths=new Set<string>();
    for(const change of draft.banks) for(const {card} of cardsOf(bankSchema.parse(change.payload))) if(!card.retired) {
      if(card.audio) paths.add(card.audio); if(card.image) paths.add(card.image);
    }
    if(draft.article) paths.add(draft.article.cover.publicPath);
    if(paths.size) {
      const resources=await tx.select({path:resourceObjects.sourcePath}).from(resourceObjects).where(and(inArray(resourceObjects.sourcePath,[...paths]),eq(resourceObjects.status,'ready')));
      const ready=new Set(resources.map(r=>r.path));
      if([...paths].some(path=>!ready.has(path))) throw new BadRequestException('content_resource_not_ready');
    }
  }
  private async lock(tx:Tx,id:string,revision:number) {
    const [row]=await tx.select().from(contentWorkOrders).where(eq(contentWorkOrders.id,id)).for('update');
    if(!row) throw new NotFoundException('content_order_not_found');
    if(row.revision!==revision) throw new ConflictException('content_order_changed_reload');return row;
  }
  private log(tx:Tx,request:OpsAuthenticatedRequest,id:string,action:string,revision:number) {
    return this.audit.record({action:`ops.content.${action}`,actorStaffId:request.opsStaff!.id,actorRole:request.opsStaff!.role,reason:'内容工单'+action,requestId:request.id,targetId:id,targetType:'content_order',metadata:{revision}},tx);
  }
}
