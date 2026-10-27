import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import type { DatabaseService } from '../src/database/database.service';
import * as schema from '../src/database/schema';
import { FeedbackService } from '../src/feedback/feedback.service';
import { feedbackSubmissionSchema } from '../src/feedback/feedback.schemas';
import { AdminDataService } from '../src/admin/admin-data.service';

// Isolated PostgreSQL only: migration compatibility plus the real submit/read paths.
const root=mkdtempSync(join(tmpdir(),'icao-feedback-exam-test-'));
const data=join(root,'data');
let started=false;
let client:ReturnType<typeof postgres>;
let database:ReturnType<typeof drizzle<typeof schema>>;
let accountId:string;
let oldRecord:unknown;
let oldAccess:unknown;
const accessSql="SELECT relrowsecurity, has_table_privilege('anon','feedback_tickets','SELECT') AS anon_read, has_table_privilege('authenticated','feedback_tickets','INSERT') AS authenticated_write, has_table_privilege('service_role','feedback_tickets','SELECT') AS service_read FROM pg_class WHERE oid='feedback_tickets'::regclass";
beforeAll(async()=>{
  const port=await new Promise<number>((resolve,reject)=>{
    const server=createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{
      const address=server.address();if(!address||typeof address==='string')return reject(new Error('test_port_unavailable'));
      server.close(error=>error?reject(error):resolve(address.port));
    });
  });
  execFileSync('initdb',['-D',data,'-A','trust','-U','postgres','--no-locale'],{stdio:'ignore'});
  execFileSync('pg_ctl',['-D',data,'-o',`-F -h 127.0.0.1 -k ${root} -p ${port}`,'-w','start'],{stdio:'ignore'});started=true;
  client=postgres({host:'127.0.0.1',port,username:'postgres',database:'postgres',max:1,onnotice:()=>undefined});
  await client.unsafe(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE ROLE supabase_admin;
    GRANT USAGE, CREATE ON SCHEMA public TO supabase_admin;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES TO anon,authenticated,service_role;
    ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES TO anon,authenticated,service_role;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid NOT NULL);
    CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text PRIMARY KEY,name text NOT NULL,public boolean NOT NULL,file_size_limit bigint,allowed_mime_types text[]);`);
  const directory=join(process.cwd(),'drizzle');
  for(const file of readdirSync(directory).filter(name=>/^00\d\d_.*\.sql$/u.test(name)&&name<'0058').sort())await client.unsafe(readFileSync(join(directory,file),'utf8').replaceAll('--> statement-breakpoint',''));
  const [account]=await client<{id:string}[]>`INSERT INTO accounts DEFAULT VALUES RETURNING id`;
  accountId=account!.id;
  await client`INSERT INTO feedback_tickets(ticket_number,user_id,client_submission_id,category,description,source,source_route,app_display_version,platform,retention_at) VALUES('FB-legacy',${accountId},${randomUUID()},'opi','旧考情反馈','exam_report','/info/feedback','1.3.16','ios',now()+interval '365 days')`;
  oldRecord=(await client`SELECT to_jsonb(t) AS value FROM feedback_tickets t WHERE ticket_number='FB-legacy'`)[0]!.value;
  oldAccess=await client.unsafe(accessSql);
  await client.unsafe(readFileSync(join(directory,'0058_feedback_exam_details.sql'),'utf8').replaceAll('--> statement-breakpoint',''));
  database=drizzle(client,{schema});
},30_000);
afterAll(async()=>{if(client)await client.end();if(started)execFileSync('pg_ctl',['-D',data,'-m','immediate','-w','stop'],{stdio:'ignore'});rmSync(root,{recursive:true,force:true});});

it('adds nullable fields without changing legacy content, retention, RLS or grants',async()=>{
  const [row]=await client`SELECT to_jsonb(t)-'exam_date'-'exam_center' AS value,exam_date,exam_center FROM feedback_tickets t WHERE ticket_number='FB-legacy'`;
  expect(row!.value).toEqual(oldRecord);expect(row!.exam_date).toBeNull();expect(row!.exam_center).toBeNull();
  expect(await client.unsafe(accessSql)).toEqual(oldAccess);
  expect(oldAccess).toMatchObject([{relrowsecurity:true,anon_read:false,authenticated_write:false,service_read:true}]);
});

it('round-trips exam details through real submission, idempotent retry, learner history and Ops in different time zones',async()=>{
  const db={db:database} as unknown as DatabaseService;
  const user=new FeedbackService(db,{upload:vi.fn(async()=>[])} as never);
  const admin=new AdminDataService({} as never,db,{} as never,{} as never,{record:vi.fn()} as never);
  const payload=feedbackSubmissionSchema.parse({clientSubmissionId:randomUUID(),category:'opi',description:'本次考试完整反馈',source:'exam_report',sourceRoute:'/info/feedback',appDisplayVersion:'1.3.16',platform:'ios',examDate:'2024-02-29',examCenter:'  上海  '});
  await client.unsafe("SET TIME ZONE 'Pacific/Honolulu'");
  const submitted=await user.submit(accountId,payload,[]);
  expect(await user.submit(accountId,payload,[])).toEqual(submitted);
  expect(await database.select().from(schema.feedbackTickets).where(eq(schema.feedbackTickets.clientSubmissionId,payload.clientSubmissionId))).toHaveLength(1);
  for(const timezone of ['Pacific/Honolulu','Asia/Shanghai']){
    await client.unsafe(`SET TIME ZONE '${timezone}'`);
    expect(await user.detail(accountId,submitted.ticketNumber)).toMatchObject({examDate:'2024-02-29',examCenter:'上海'});
    expect((await user.list(accountId,undefined,'exam_report')).items.find(item=>item.ticketNumber===submitted.ticketNumber)).toMatchObject({examDate:'2024-02-29',examCenter:'上海'});
    const staff={id:accountId,role:'admin' as const,email:'test@example.test',sessionId:randomUUID()};
    expect(await admin.feedbackDetail(submitted.ticketNumber,staff,'request')).toMatchObject({examDate:'2024-02-29',examCenter:'上海'});
    expect((await admin.feedbackQueue('查看考试反馈',staff,'request',undefined,30,undefined,'exam_report')).items.find(item=>item.ticketNumber===submitted.ticketNumber)).toMatchObject({examDate:'2024-02-29',examCenter:'上海'});
  }
  const legacy=await user.detail(accountId,'FB-legacy');expect(legacy).not.toHaveProperty('examDate');expect(legacy).not.toHaveProperty('examCenter');
});
