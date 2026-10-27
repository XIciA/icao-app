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
import { canonicalVocabularyJson, vocabularyLivePayload } from '@icao/contracts/vocabulary-live';
import { createHash } from 'node:crypto';
import { VocabularyLiveService } from '../src/vocabulary/vocabulary-live.service';
import { VocabularyAdminService, vocabularyAudioPaths } from '../src/admin/vocabulary-admin.service';
import { AdminAuditService } from '../src/admin/admin-audit.service';
import { SyncService } from '../src/sync/sync.service';
import type { OpsAuthenticatedRequest } from '../src/admin/admin.types';
import { vocabularyDocumentForPolicy } from '../src/sync/vocabulary-document';
// An isolated local cluster tests the real services, joins, constraints and ledger writes.
// No environment files, existing clusters, customer accounts or network services are used.
const root = mkdtempSync(join(tmpdir(), 'icao-vocabulary-live-test-'));
const data = join(root, 'data');
let started = false;
let testDatabaseUrl: string;
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
  testDatabaseUrl=`postgresql://postgres@127.0.0.1:${port}/postgres`;
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
  expect(published.checksum).toBe(createHash('sha256').update(canonicalVocabularyJson(vocabularyLivePayload(published))).digest('hex'));
  const [activePayload]=await database.select().from(schema.vocabularyReleases).where(eq(schema.vocabularyReleases.active,true));expect(activePayload!.payload).not.toHaveProperty('checksum');
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

it('imports the reviewed immutable baseline idempotently with exact hash, complete media and an audit record',async()=>{
  const {importVocabulary,readVocabularyImport}=await import('../scripts/import-vocabulary-live.mjs');
  await database.delete(schema.vocabularyReleases);
  const path=join(process.cwd(),'../../content/vocabulary/live/release.json'),candidate=readVocabularyImport(path);
  const environment={DATABASE_URL:testDatabaseUrl,NODE_ENV:'test',VOCABULARY_PUBLISH_CONFIRM:candidate.checksum,VOCABULARY_EXPECTED_BASE:'empty',VOCABULARY_PUBLISH_REASON:'isolated vocabulary import test'};
  const plan=await importVocabulary('plan',path,environment);expect(plan.baseVersion).toBeNull();expect(plan.missingAudio).toEqual([]);
  await expect(importVocabulary('publish',path,{...environment,VOCABULARY_PUBLISH_CONFIRM:'incorrect'})).rejects.toThrow('vocabulary_publish_checksum_confirmation_required');
  const firstPath=candidate.audioPaths[0]!;
  await database.update(schema.resourceObjects).set({status:'superseded'}).where(eq(schema.resourceObjects.sourcePath,firstPath));
  await expect(importVocabulary('publish',path,environment)).rejects.toThrow('vocabulary_audio_incomplete');
  await database.update(schema.resourceObjects).set({status:'ready'}).where(eq(schema.resourceObjects.sourcePath,firstPath));
  await expect(importVocabulary('publish',path,{...environment,NODE_ENV:'production',API_RELEASE_ID:'tested-main',VOCABULARY_PUBLISH_RELEASE_ID:'other'})).rejects.toThrow('vocabulary_publish_runtime_release_mismatch');
  const published=await importVocabulary('publish',path,environment);expect(published.published).toBe(true);
  const retried=await importVocabulary('publish',path,environment);expect(retried.alreadyPublished).toBe(true);
  expect(await database.select().from(schema.vocabularyReleases)).toHaveLength(1);
  expect(await database.select().from(schema.opsAuditEvents).where(eq(schema.opsAuditEvents.action,'ops.vocabulary.import'))).toHaveLength(1);
});


it('publishes more than 100 classification-only moves as one atomic version and exposes immutable searchable history',async()=>{
  const db={db:database} as unknown as DatabaseService,live=new VocabularyLiveService(db),audit=new AdminAuditService(db),service=new VocabularyAdminService(db,live,audit);
  const [staff]=await database.insert(schema.opsStaffAccounts).values({email:'level-admin@example.com',role:'admin',passwordHash:'test',totpSecretCiphertext:'test',totpSecretIv:'test',totpSecretTag:'test',totpConfirmedAt:new Date()}).returning();
  const req={id:'levels-test',opsStaff:{id:staff!.id,role:'admin'}} as OpsAuthenticatedRequest;
  const previous=await live.get(),source=previous.dataset.books[1]!.words.slice(0,110);
  const moves=source.map(word=>({id:word.id,bookId:'icao5' as const}));
  const preview=await service.previewLevels(previous.version,moves);expect(preview.changes).toHaveLength(110);
  expect(await database.select().from(schema.vocabularyReleases).where(eq(schema.vocabularyReleases.active,true))).toHaveLength(1);
  const input={baseVersion:previous.version,moves,checksum:preview.checksum,batchId:'34887de0-96bd-4ca5-86ea-89dcc8f78e75',note:'高频词等级复核'};
  const [first,retry]=await Promise.all([service.publishLevels(input,req),service.publishLevels(input,req)]);
  expect(first.publishedVersion).toBe(previous.version+1);expect(retry.publishedVersion).toBe(first.publishedVersion);expect([first.alreadyPublished,retry.alreadyPublished].sort()).toEqual([false,true]);
  const next=await live.get();expect(next.version).toBe(previous.version+1);
  const words=new Map(next.dataset.books.flatMap(book=>book.words.map(word=>[word.id,word] as const)));
  for(const word of source)expect(words.get(word.id)).toEqual({...word,bookId:'icao5',level:3});
  const history=await service.history({word:source[0]!.word,actor:'level-admin',type:'levels'});
  expect(history.items).toHaveLength(1);expect(history.items[0]).toMatchObject({version:next.version,changeCount:110,note:input.note});
  const detail=await service.historyDetail(next.version);expect(detail.changes).toHaveLength(110);expect(detail.levelChanges[0]).toMatchObject({from:'icao4',to:'icao5'});
  expect(await database.select().from(schema.opsAuditEvents).where(eq(schema.opsAuditEvents.action,'ops.vocabulary.levels'))).toHaveLength(1);
  await expect(service.publishLevels({...input,note:'changed payload'},req)).rejects.toThrow('vocabulary_batch_id_reused');
  const policyProgress={schemaVersion:1 as const,words:{[source[0]!.id]:{status:'known' as const,favorite:true,updatedAt:'2026-10-27T00:00:00.000Z'}},updatedAt:'2026-10-27T00:00:00.000Z'};
  expect(vocabularyDocumentForPolicy(policyProgress,next.policy)).toEqual(policyProgress);
});

it('rejects stale, duplicate, missing and no-op level moves and rolls back the version switch when audit fails',async()=>{
  const f=fixture(),previous=await f.live.get(),word=previous.dataset.books[0]!.words[0]!;
  const [actor]=await database.select().from(schema.opsStaffAccounts).limit(1);
  const levelRequest={...request,opsStaff:{id:actor!.id,role:'admin'}} as OpsAuthenticatedRequest;
  const moves=[{id:word.id,bookId:'icao4' as const}];
  await expect(f.service.previewLevels(previous.version-1,moves)).rejects.toThrow('vocabulary_version_changed_reload');
  await expect(f.service.previewLevels(previous.version,[...moves,...moves])).rejects.toThrow('invalid_vocabulary_level_move');
  await expect(f.service.previewLevels(previous.version,[{id:'missing',bookId:'icao4'}])).rejects.toThrow('invalid_vocabulary_level_move');
  await expect(f.service.previewLevels(previous.version,[{id:word.id,bookId:word.bookId}])).rejects.toThrow('vocabulary_no_level_changes');
  const plan=await f.service.previewLevels(previous.version,moves);
  vi.mocked(f.audit.record).mockRejectedValueOnce(new Error('audit unavailable'));
  await expect(f.service.publishLevels({baseVersion:previous.version,moves,checksum:plan.checksum,batchId:'54de0f0a-6c61-48b0-8b66-c4bcf8122836',note:''},levelRequest)).rejects.toThrow('audit unavailable');
  expect((await f.live.get()).version).toBe(previous.version);
  expect(await database.select().from(schema.vocabularyReleases).where(eq(schema.vocabularyReleases.active,true))).toHaveLength(1);
  await expect(f.service.historyDetail(999999)).rejects.toThrow('vocabulary_history_missing');
});
