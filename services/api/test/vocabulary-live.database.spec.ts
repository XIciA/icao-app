import { execFileSync } from 'node:child_process';
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
import { VocabularyLiveService } from '../src/vocabulary/vocabulary-live.service';
import { VocabularyAdminService, vocabularyAudioPaths } from '../src/admin/vocabulary-admin.service';
import type { AdminAuditService } from '../src/admin/admin-audit.service';
import { SyncService } from '../src/sync/sync.service';
import type { OpsAuthenticatedRequest } from '../src/admin/admin.types';
import { vocabularyDocumentForPolicy } from '../src/sync/vocabulary-document';
// An isolated local cluster tests the real services, joins, constraints and ledger writes.
// No environment files, existing clusters, customer accounts or network services are used.
const root = mkdtempSync(join(tmpdir(), 'icao-vocabulary-live-test-'));
const data = join(root, 'data');
let started = false;
let client: ReturnType<typeof postgres>;
let database: ReturnType<typeof drizzle<typeof schema>>;
beforeAll(async () => {
  const port = await new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') return reject(new Error('test_port_unavailable'));
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
  execFileSync('initdb', ['-D', data, '-A', 'trust', '-U', 'postgres', '--no-locale'], { stdio: 'ignore' });
  execFileSync('pg_ctl', ['-D', data, '-o', `-F -h 127.0.0.1 -k ${root} -p ${port}`, '-w', 'start'], { stdio: 'ignore' });
  started = true;
  client = postgres({ host: '127.0.0.1', port, username: 'postgres', database: 'postgres', max: 3, onnotice: () => undefined });
  await client.unsafe(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE ROLE supabase_admin;
    GRANT USAGE, CREATE ON SCHEMA public TO supabase_admin;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid NOT NULL);
    CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text PRIMARY KEY,name text NOT NULL,
      public boolean NOT NULL,file_size_limit bigint,allowed_mime_types text[]);
  `);
  const directory = join(process.cwd(), 'drizzle');
  for (const file of readdirSync(directory).filter((name) => /^00\d\d_.*\.sql$/u.test(name)).sort()) {
    await client.unsafe(readFileSync(join(directory, file), 'utf8').replaceAll('--> statement-breakpoint', ''));
  }
  database = drizzle(client, { schema });
}, 30_000);

afterAll(async () => {
  if (client) await client.end();
  if (started) execFileSync('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop'], { stdio: 'ignore' });
  rmSync(root, { recursive: true, force: true });
});

const request={id:'test-vocabulary-request',opsStaff:{role:'admin'}} as OpsAuthenticatedRequest;
function fixture(){const db={db:database} as unknown as DatabaseService;const live=new VocabularyLiveService(db);const audit={record:vi.fn(async()=>undefined)} as unknown as AdminAuditService;return {db,live,audit,service:new VocabularyAdminService(db,live,audit)};}
it('publishes atomically with version fencing, immutable history and audio readiness',async()=>{
  const f=fixture(),baseline=f.live.baseline();
  const first=baseline.dataset.books[0]!.words[0]!;
  const edits=[{type:'upsert' as const,word:{...first,bookId:'icao5' as const,level:3 as const,meaning:'后台修改释义'}}];
  const missing=await f.service.preview(baseline.version,edits);
  expect(missing.missingAudio.length).toBeGreaterThan(0);
  await expect(f.service.publish(baseline.version,edits,missing.checksum,request)).rejects.toThrow('vocabulary_audio_incomplete');
  expect(await database.select().from(schema.vocabularyReleases)).toHaveLength(0);
  const paths=vocabularyAudioPaths(missing.content);
  for(let i=0;i<paths.length;i+=200)await database.insert(schema.resourceObjects).values(paths.slice(i,i+200).map(path=>({objectKey:path.slice(1),module:'vocabulary',sourcePath:path,checksum:'a'.repeat(64),sizeBytes:1200,mimeType:'audio/mpeg'})));
  const planned=await f.service.preview(baseline.version,edits);expect(planned.missingAudio).toEqual([]);
  const published=await f.service.publish(baseline.version,edits,planned.checksum,request);
  expect(published.version).toBe(5);expect(published.dataset.books[2]!.words.find(word=>word.id===first.id)?.frequency).toEqual(first.frequency);
  expect((await f.live.get()).checksum).toBe(published.checksum);
  expect(await database.select().from(schema.vocabularyReleases)).toHaveLength(2);
  expect(f.audit.record).toHaveBeenCalledOnce();
  await expect(f.service.publish(baseline.version,edits,planned.checksum,request)).rejects.toThrow('vocabulary_version_changed_reload');
  expect(await database.select().from(schema.vocabularyReleases).where(eq(schema.vocabularyReleases.active,true))).toHaveLength(1);
});
it('retired words cannot be resurrected by stale devices and pull sanitizes old payloads',async()=>{
  const f=fixture(),previous=await f.live.get(),word=previous.dataset.books[0]!.words[0]!;
  const edits=[{type:'delete' as const,id:word.id}];const planned=await f.service.preview(previous.version,edits);
  const published=await f.service.publish(previous.version,edits,planned.checksum,request);
  const progress={status:'known',favorite:true,updatedAt:'2026-10-27T00:00:00.000Z'};
  expect(vocabularyDocumentForPolicy({schemaVersion:1,words:{[word.id]:progress},updatedAt:progress.updatedAt},published.policy).words).toEqual({});
  const [account]=await database.insert(schema.accounts).values({}).returning();
  const sync=new SyncService(f.db,f.live);
  await sync.push(account!.id,{mutations:[{mutationId:'stale-vocabulary-device',kind:'document',payload:{documentKey:'vocabulary',document:{schemaVersion:1,words:{[word.id]:progress},updatedAt:progress.updatedAt},version:1,updatedAt:progress.updatedAt}}]});
  const [stored]=await database.select().from(schema.userDocuments).where(eq(schema.userDocuments.userId,account!.id));
  expect(stored?.payload).toMatchObject({words:{}});
  const pulled=await sync.pull(account!.id,'0');expect(JSON.stringify(pulled)).not.toContain(word.id);
});
it('adds a complete new card from the backend and derives frequency from all five published banks',async()=>{
  const f=fixture(),previous=await f.live.get(),original=previous.dataset.books[0]!.words[0]!;
  for(const bankId of ['listening','sentences900','radiotelephony','storytelling','opi'])await database.insert(schema.questionBankReleases).values({bankId,version:27,checksum:bankId.padEnd(64,'a'),active:true,payload:{cards:[{id:bankId,kind:'text',audioText:'Testvocabulary is a test fixture.',referenceText:bankId==='listening'?'Testvocabulary is a duplicate listening reference.':''}]}});
  const word={...original,id:'admin-new-fixture',word:'testvocabulary',meaning:'测试词条',pronunciationText:'testvocabulary',example:'Testvocabulary is a test fixture.',exampleTranslation:'这是一个测试词条例句。',relatedExpressions:[],frequency:undefined};
  const edits=[{type:'upsert' as const,word}];const plan=await f.service.preview(previous.version,edits);
  const newWord=plan.content.dataset.books[0]!.words.find(item=>item.id===word.id)!;
  expect(newWord.frequency?.occurrences).toBe(5);expect(newWord.frequency?.cardCount).toBe(5);expect(plan.missingAudio).toHaveLength(2);
  for(const path of plan.missingAudio)await database.insert(schema.resourceObjects).values({objectKey:path.slice(1),module:'vocabulary',sourcePath:path,checksum:'b'.repeat(64),sizeBytes:1200,mimeType:'audio/mpeg'});
  const ready=await f.service.preview(previous.version,edits);expect(ready.missingAudio).toEqual([]);
  const published=await f.service.publish(previous.version,edits,ready.checksum,request);expect(published.policy.testWords[word.id]?.meaning).toBe('测试词条');
});
it('a history with no active row fails closed instead of reverting to the bundled content',async()=>{
  const f=fixture();await database.update(schema.vocabularyReleases).set({active:false});
  await expect(f.live.get()).rejects.toThrow('vocabulary_live_active_release_missing');
});
