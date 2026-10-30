import { describe, expect, it, vi } from 'vitest';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { FeedbackService } from '../src/feedback/feedback.service';
import { AdminDataService } from '../src/admin/admin-data.service';
import { feedbackReplySchema } from '../src/feedback/feedback.schemas';

const id='00000000-0000-4000-8000-000000000001';
const owner='00000000-0000-4000-8000-000000000002';
const ticket={id,userId:owner,ticketNumber:'FB-261019-00000001',category:'other',description:'学习时出现问题',status:'received',createdAt:new Date(),repliesReadAt:null};
const reply={id,text:'已收到，正在处理。',createdAt:new Date()};
function fixture(batches:unknown[][]) {
  const conditions:Array<{sql:string;params:unknown[]}>=[];
  const writes:unknown[]=[];
  type Chain = {from:()=>Chain;innerJoin:()=>Chain;orderBy:()=>Chain;limit:()=>Chain;for:()=>Chain;where:(q:SQL)=>Chain;then:Promise<unknown[]>['then']};
  const db={
    select:vi.fn(()=>{
      const rows=batches.shift()??[];
      const chain:Chain={from:()=>chain,innerJoin:()=>chain,orderBy:()=>chain,limit:()=>chain,for:()=>chain,
        where:(q:SQL)=>{conditions.push(new PgDialect().sqlToQuery(q));return chain;},then:Promise.resolve(rows).then.bind(Promise.resolve(rows))};
      return chain;
    }),
    update:vi.fn(()=>({set:(value:unknown)=>{writes.push(value);return {where:(q:SQL)=>{conditions.push(new PgDialect().sqlToQuery(q));return Promise.resolve();}};}})),
    insert:vi.fn(()=>({values:(value:unknown)=>{writes.push(value);return Promise.resolve();}})),
    transaction:async(fn:(tx:unknown)=>Promise<unknown>)=>fn(db),
  };
  const storage={signedUrl:vi.fn().mockResolvedValue('https://example.test/signed')};
  const audit={record:vi.fn()};
  const user=new FeedbackService({db} as never,storage as never);
  const admin=new AdminDataService({} as never,{db} as never,{} as never,{} as never,audit as never);
  return {user,admin,db,conditions,writes,storage,audit};
}
describe('learner feedback history',()=>{
  it('returns exam metadata verbatim in list and detail, while old and non-exam records omit it',async()=>{
    const exam={...ticket,source:'exam_report',category:'opi',examDate:'2026-10-27',examCenter:'上海'};
    const listed=await fixture([[exam],[],[]]).user.list(owner,undefined,'exam_report');
    expect(listed.items[0]).toMatchObject({examDate:'2026-10-27',examCenter:'上海'});
    const detailed=await fixture([[exam],[],[]]).user.detail(owner,ticket.ticketNumber);
    expect(detailed).toMatchObject({examDate:'2026-10-27',examCenter:'上海'});
    for(const row of [{...exam,source:'profile'},{...ticket,source:'exam_report',examDate:null,examCenter:null}]){
      const result=await fixture([[row],[],[]]).user.detail(owner,ticket.ticketNumber);
      expect(result).not.toHaveProperty('examDate');expect(result).not.toHaveProperty('examCenter');
    }
  });
  it.each([['in_progress','processing'],['cannot_reproduce','resolved']])('exposes historical %s as %s without rewriting records',async(stored,visible)=>{
    const f=fixture([[{...ticket,status:stored}],[],[]]);
    expect((await f.user.list(owner)).items[0]?.status).toBe(visible);
    expect(f.writes).toHaveLength(0);
  });
  it('limits every list and unread query to the authenticated account, and omits private fields',async()=>{
    const f=fixture([[{...ticket,contact:'private',diagnostics:{secret:'internal'}}],[{...reply,ticketId:ticket.id}],[reply]]);
    const result=await f.user.list(owner);
    expect(result.unread).toBe(true);expect(result.items[0]?.replies).toHaveLength(1);
    expect(JSON.stringify(result)).not.toMatch(/private|diagnostics|userId/);
    expect(f.conditions[0]?.params).toContain(owner);expect(f.conditions.at(-1)?.params).toContain(owner);
    expect(f.conditions[0]?.sql).toContain('retention_at');
  });
  it('batches a full page of replies without leaking ticket keys or mixing replies', async () => {
    const page = Array.from({ length: 31 }, (_, i) => ({ ...ticket, id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, ticketNumber: `ticket-${i}` }));
    const replies = page.slice(0, 30).flatMap(row => [0, 1].map(i => ({ ...reply, id: `reply-${row.id}-${i}`, ticketId: row.id })));
    const f = fixture([page, replies, [reply]]);
    const result = await f.user.list(owner);
    expect(f.db.select).toHaveBeenCalledTimes(3);
    expect(result.items).toHaveLength(30);
    expect(result.nextCursor).toBeTruthy();
    expect(f.conditions[1]?.params).toEqual(page.slice(0, 30).map(row => row.id));
    result.items.forEach((item, i) => {
      expect(item.replies.map(row => row.id)).toEqual(replies.slice(i * 2, i * 2 + 2).map(row => row.id));
      expect(item.replies[0]).not.toHaveProperty('ticketId');
    });
  });
  it('skips the batch query for an empty page and still checks unread replies', async () => {
    const f = fixture([[], []]);
    expect(await f.user.list(owner)).toEqual({ items: [], unread: false, nextCursor: null });
    expect(f.db.select).toHaveBeenCalledTimes(2);
  });
  it('denies another account detail before requesting images or replies',async()=>{
    const f=fixture([[]]);
    await expect(f.user.detail(owner,ticket.ticketNumber)).rejects.toThrow('feedback_not_found');
    expect(f.conditions[0]?.params).toContain(owner);expect(f.storage.signedUrl).not.toHaveBeenCalled();
  });
  it('only returns current attachments and the public response fields',async()=>{
    const f=fixture([[ticket],[{id,objectKey:'feedback/test.png'}],[reply]]);
    const result=await f.user.detail(owner,ticket.ticketNumber);
    expect(result.attachments).toEqual([{id,url:'https://example.test/signed'}]);
    expect(f.conditions[1]?.sql).toContain('deleted_at');expect(f.conditions[1]?.sql).toContain('expires_at');
    expect(JSON.stringify(result)).not.toContain('objectKey');
  });
  it('acknowledges only a viewed reply belonging to the owned ticket',async()=>{
    const f=fixture([[ticket],[reply]]);await f.user.markRead(owner,ticket.ticketNumber,id);
    expect(f.conditions[1]?.params).toEqual([ticket.id,id]);
    expect(f.conditions.at(-1)?.params).toEqual([ticket.id,owner]);
    expect(Object.keys(f.writes[0] as object)).toEqual(['repliesReadAt']);
    const rejected=fixture([[ticket],[]]);await expect(rejected.user.markRead(owner,ticket.ticketNumber,id)).rejects.toThrow('feedback_reply_not_found');
    expect(rejected.writes).toHaveLength(0);
  });
  it('rejects malformed cursors without accessing the database',async()=>{
    const f=fixture([]);await expect(f.user.list(owner,'bad')).rejects.toThrow('invalid_feedback_cursor');expect(f.db.select).not.toHaveBeenCalled();
  });
});
describe('public feedback replies',()=>{
  it('writes the processing state supported by the original production constraint',async()=>{
    const f=fixture([[ticket],[]]);vi.spyOn(f.admin,'feedbackDetail').mockResolvedValue({} as never);
    await f.admin.replyToFeedback(ticket.ticketNumber,{clientReplyId:id,status:'processing',text:reply.text},{id,role:'support',email:'support@test',sessionId:id},'req');
    expect(f.writes[1]).toMatchObject({status:'in_progress'});
    expect(f.audit.record).toHaveBeenCalledWith(expect.objectContaining({afterState:{status:'in_progress'}}),expect.anything());
  });
  it('validates bounded public text and supported states',()=>{
    expect(feedbackReplySchema.safeParse({clientReplyId:id,status:'resolved',text:'谢谢反馈'}).success).toBe(true);
    expect(feedbackReplySchema.safeParse({clientReplyId:id,status:'deleted'}).success).toBe(false);
    expect(feedbackReplySchema.safeParse({clientReplyId:id,status:'resolved',text:'x'.repeat(1001)}).success).toBe(false);
    expect(feedbackReplySchema.safeParse({clientReplyId:id,status:'resolved',internalNote:'secret'}).success).toBe(false);
  });
  it('retries a sent reply without adding another reply or regressing status',async()=>{
    const f=fixture([[ticket],[reply]]);
    vi.spyOn(f.admin,'feedbackDetail').mockResolvedValue({} as never);
    await f.admin.replyToFeedback(ticket.ticketNumber,{clientReplyId:id,status:'processing',text:reply.text},{id,role:'support',email:'support@test',sessionId:id},'req');
    expect(f.writes).toHaveLength(0);
  });
  it('atomically stores a public reply, updates status and records the operator audit',async()=>{
    const f=fixture([[ticket],[]]);vi.spyOn(f.admin,'feedbackDetail').mockResolvedValue({} as never);
    await f.admin.replyToFeedback(ticket.ticketNumber,{clientReplyId:id,status:'resolved',text:reply.text},{id,role:'support',email:'support@test',sessionId:id},'req');
    expect(f.writes[0]).toMatchObject({ticketId:id,text:reply.text,clientReplyId:id});
    expect(f.writes[1]).toMatchObject({status:'resolved'});expect(f.audit.record).toHaveBeenCalled();
  });
});
