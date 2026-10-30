import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { AppContentService, appContentChecksum } from '../src/app-content/app-content.service';
import { ContentAccessService } from '../src/content-access/content-access.service';
import { QuestionBankService } from '../src/question-bank/question-bank.service';
import { FeedbackService } from '../src/feedback/feedback.service';
import { EditorialService } from '../src/editorial/editorial.service';
import * as schema from '../src/database/schema';

// Real queries and plans, synthetic accounts/content, disposable loopback cluster only.
const root = mkdtempSync(join(tmpdir(), 'icao-perf-db-'));
const data = join(root, 'data');
let started = false;
let client: ReturnType<typeof postgres>;
let database: ReturnType<typeof drizzle<typeof schema>>;
const queries: string[] = [];
let content: ContentAccessService;
let banks: QuestionBankService;
const dataset = (version: number) => ({ id: 'listening', title: `bank-${version}`, declaredTopicCount: 1, declaredCardCount: 12,
  categories: [{ id: 'category', name: 'test', topics: [{ id: 'topic', name: 'test', declaredCardCount: 12,
    cards: Array.from({ length: 12 }, (_, i) => ({ id: `card-${i}`, studyTier: 1, audio: `/question-bank-assets/${version}/${i}.mp3`, audioText: `text-${version}-${i}` })) }] }] });
const snapshot = {
  ...JSON.parse(readFileSync(join(__dirname, '../../../content/app-content/text.json'), 'utf8')),
  hotspots: JSON.parse(readFileSync(join(__dirname, '../../../content/question-banks/opi-hotspots.json'), 'utf8')),
};
beforeAll(async () => {
  const port = await new Promise<number>((resolve, reject) => {
    const server = createServer(); server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') return reject(new Error('test_port_unavailable'));
      server.close(error => error ? reject(error) : resolve(address.port));
    });
  });
  execFileSync('initdb', ['-D', data, '-A', 'trust', '-U', 'postgres', '--no-locale'], { stdio: 'ignore' });
  execFileSync('pg_ctl', ['-D', data, '-o', `-F -h 127.0.0.1 -k ${root} -p ${port}`, '-w', 'start'], { stdio: 'ignore' }); started = true;
  client = postgres({ host: '127.0.0.1', port, username: 'postgres', database: 'postgres', max: 5, prepare: false, onnotice: () => undefined });
  await client.unsafe(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE ROLE supabase_admin;
    GRANT USAGE, CREATE ON SCHEMA public TO supabase_admin;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid NOT NULL);
    CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text PRIMARY KEY,name text NOT NULL,public boolean NOT NULL,file_size_limit bigint,allowed_mime_types text[]);`);
  for (const file of readdirSync('drizzle').filter(name => /^00\d\d_.*\.sql$/u.test(name)).sort()) {
    await client.unsafe(readFileSync(join('drizzle', file), 'utf8').replaceAll('--> statement-breakpoint', ''));
  }
  database = drizzle(client, { schema, logger: { logQuery: query => { queries.push(query); } } });
  content = new ContentAccessService({} as never, { db: database } as never);
  banks = new QuestionBankService({ db: database } as never, content);
  await database.insert(schema.questionBankReleases).values([1, 2].map(version => ({ bankId: 'listening', version, checksum: String(version).repeat(64), payload: dataset(version), active: version === 1 })));
}, 30000);
afterAll(async () => {
  if (client) await client.end();
  if (started) execFileSync('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop'], { stdio: 'ignore' });
  rmSync(root, { recursive: true, force: true });
});

it('coalesces payload reads, keeps original summary scalars, and rechecks publication/rollback metadata', async () => {
  queries.length = 0;
  const results = await Promise.all(Array.from({ length: 30 }, () => content.getCatalog('listening', undefined, undefined, 'production')));
  expect(results.every(result => result.version === 1)).toBe(true);
  expect(queries.filter(query => query.startsWith('select') && query.includes('"payload"'))).toHaveLength(1);
  queries.length = 0;
  expect(await banks.list()).toEqual([{ bankId: 'listening', version: 1, checksum: '1'.repeat(64), title: 'bank-1', declaredTopicCount: 1, declaredCardCount: 12 }]);
  expect(queries[0]).toContain("->'title'");
  await client`update question_bank_releases set active=false where bank_id='listening'`;
  await client`update question_bank_releases set active=true where bank_id='listening' and version=2`;
  expect((await content.getCatalog('listening', undefined, undefined, 'production')).version).toBe(2);
  const old = await content.getTopic('listening', 'category', 'topic', undefined, undefined, 'production', new Date(), { version: 1, checksum: '1'.repeat(64) });
  expect(old.topic.cards[0]?.audioText).toBe('text-1-0');
  await expect(content.getTopic('listening', 'category', 'topic', undefined, undefined, 'production', new Date(), { version: 1, checksum: '2'.repeat(64) })).rejects.toThrow('content_release_mismatch');
  await client`update question_bank_releases set active=false where bank_id='listening'`;
  await expect(content.getCatalog('listening', undefined, undefined, 'production')).rejects.toThrow('question_bank_not_found');
  await client`update question_bank_releases set active=true where bank_id='listening' and version=1`;
  expect((await content.getCatalog('listening', undefined, undefined, 'production')).version).toBe(1);
});

it('does not cache membership or sandbox authorization and preserves free audio access', async () => {
  const member = '00000000-0000-4000-8000-000000000001';
  await client`insert into accounts(id) values(${member})`;
  // Use a test read override for membership only: production SQL and access policy are unchanged.
  let active = true;
  const internal = content as unknown as { membership: (...args: unknown[]) => Promise<unknown> };
  const original = internal.membership.bind(content);
  internal.membership = async (account, environment) => account === member ? { active, expiresAt: active ? new Date('2099-01-01') : null, segmentId: active ? 'segment' : null, environment } : original(account, environment, new Date());
  try {
    expect((await content.getTopic('listening', 'category', 'topic', member, 'session', 'production')).topic.cards).toHaveLength(12);
    active = false;
    expect((await content.getTopic('listening', 'category', 'topic', member, 'session', 'production')).topic.cards).toHaveLength(10);
    await expect(content.getCatalog('listening', member, 'session', 'sandbox')).rejects.toThrow('content_credentials_unavailable');
    await expect(content.assertResourceAccess(undefined, 'listening', '/question-bank-assets/1/0.mp3', undefined, 'production')).resolves.toBeUndefined();
    await expect(content.assertResourceAccess(undefined, 'listening', '/question-bank-assets/1/11.mp3', undefined, 'production')).rejects.toThrow('membership_required');
  } finally { internal.membership = original; }
});

it('keeps transactional legal content out of the shared cache after rollback', async () => {
  const service = new AppContentService({ db: database } as never);
  await database.insert(schema.appContentReleases).values({ version: snapshot.version, checksum: appContentChecksum(snapshot), payload: snapshot, active: true });
  const committed = await service.get();
  const draft = { ...snapshot, version: snapshot.version + 1 };
  const rollback = new Error('intentional_rollback');
  await expect(database.transaction(async tx => {
    await tx.update(schema.appContentReleases).set({ active: false });
    await tx.insert(schema.appContentReleases).values({ version: draft.version, checksum: appContentChecksum(draft), payload: draft, active: true });
    expect((await service.get(tx)).version).toBe(draft.version);
    expect((await service.get()).version).toBe(committed.version);
    throw rollback;
  })).rejects.toBe(rollback);
  expect(await service.get()).toEqual(committed);
  queries.length = 0;
  for (const format of [undefined, '2', '3']) {
    const first = await service.publicRelease(format);
    expect(await service.publicRelease(format)).toEqual(first);
  }
  expect(queries.every(query => !query.includes('"payload"'))).toBe(true);
});

it('invalidates article releases by version and never exposes editorial private fields', async () => {
  const service = new EditorialService({ db: database } as never);
  for (const version of [1, 2]) {
    await database.insert(schema.editorialReleases).values({ version, checksum: String(version).repeat(64), active: version === 1,
      payload: { schemaVersion: 1, version, articles: [{ id: 'a', slug: 'a', channel: 'resource', title: `article-${version}`, editorial: { secret: true } }] } });
  }
  expect((await service.get('a')).article.title).toBe('article-1');
  expect((await service.get('a')).article).not.toHaveProperty('editorial');
  await client`update editorial_releases set active=false`;
  await client`update editorial_releases set active=true where version=2`;
  expect((await service.list('resource')).items[0]?.title).toBe('article-2');
});

it('uses bounded resource indexes for both current and historical checksum queries', async () => {
  await client.unsafe(`insert into resource_objects(object_key,module,source_path,checksum,size_bytes,mime_type,status,created_at)
    select 'key-'||g,'listening','/audio/'||(g%10000)||'.mp3',md5(g::text),50000,'audio/mpeg',
      case when g>20000 then 'ready' else 'superseded' end, timestamp '2026-01-01' + g * interval '1 second'
    from generate_series(1,30000) g; analyze resource_objects;`);
  const current = await client.unsafe(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT * FROM resource_objects WHERE source_path='/audio/4242.mp3' AND status='ready' ORDER BY created_at DESC LIMIT 1`);
  const historical = await client.unsafe(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT * FROM resource_objects WHERE source_path='/audio/4242.mp3' AND checksum=md5('4242') AND status IN ('ready','superseded') ORDER BY created_at DESC LIMIT 1`);
  expect(JSON.stringify(current)).toContain('resource_objects_ready_path_created');
  expect(JSON.stringify(historical)).toContain('resource_objects_version_path_created');
  const [row] = await client`SELECT object_key FROM resource_objects WHERE source_path='/audio/4242.mp3' AND status='ready' ORDER BY created_at DESC LIMIT 1`;
  expect(row?.object_key).toBe('key-24242');
});

// Opt-in comparison against actual pre-change code, not a rewritten approximation.
// Runs only in the same disposable database above; never reads DATABASE_URL/.env.
it.runIf(process.env.ICAO_BACKEND_BENCHMARK === '1')('reports old/new JSON equivalence and isolated read latency', async () => {
  const baselineRef = '4ee68384621d44b5e0b0f63000a7c79ff94e4387';
  const generated = resolve('.generated/backend-performance-baseline');
  mkdirSync(generated, { recursive: true });
  writeFileSync(join(generated, 'tsconfig.json'), JSON.stringify({ extends: '../../tsconfig.json', include: ['*.ts'] }));
  const modules = ['content-access/content-access.service.ts', 'question-bank/question-bank.service.ts',
    'app-content/app-content.service.ts', 'editorial/editorial.service.ts', 'feedback/feedback.service.ts'];
  const loaded: Record<string, Record<string, unknown>> = {};
  for (const file of modules) {
    const original = execFileSync('git', ['show', `${baselineRef}:services/api/src/${file}`], { encoding: 'utf8' });
    const rewritten = original.replace(/from ['"](\.[^'"]+)['"]/g, (_match, specifier: string) =>
      `from '${resolve('src', dirname(file), specifier).replaceAll('\\', '/')}.ts'`);
    const target = join(generated, file.replaceAll('/', '-'));
    writeFileSync(target, rewritten);
    loaded[file] = await import(target);
  }
  const OldAccess = loaded[modules[0]!]!.ContentAccessService as typeof ContentAccessService;
  const OldBanks = loaded[modules[1]!]!.QuestionBankService as typeof QuestionBankService;
  const OldAppContent = loaded[modules[2]!]!.AppContentService as typeof AppContentService;
  const OldEditorial = loaded[modules[3]!]!.EditorialService as typeof EditorialService;
  const OldFeedback = loaded[modules[4]!]!.FeedbackService as typeof FeedbackService;
  const feedbackOwner = '00000000-0000-4000-8000-000000000001';
  await client.unsafe(`insert into feedback_tickets(ticket_number,user_id,client_submission_id,category,description,source,source_route,app_display_version,platform,retention_at)
    select 'FB-bench-'||g,'${feedbackOwner}',gen_random_uuid(),'other','synthetic','profile','/feedback','1.0.0','ios',now()+interval '1 day' from generate_series(1,30) g;
    insert into feedback_replies(ticket_id,client_reply_id,text) select id,gen_random_uuid(),'synthetic reply' from feedback_tickets where user_id='${feedbackOwner}';`);
  const large = { ...dataset(3), categories: [{ id: 'category', topics: Array.from({ length: 100 }, (_, t) => ({
    id: `topic-${t}`, name: `topic-${t}`, declaredCardCount: 30,
    cards: Array.from({ length: 30 }, (_, c) => ({ id: `card-${t}-${c}`, audioText: 'Synthetic aviation study material. '.repeat(15),
      audio: `/question-bank-assets/${t}/${c}.mp3`, studyTier: 1 })),
  })) }] };
  await client`update question_bank_releases set active=false`;
  await database.insert(schema.questionBankReleases).values({ bankId: 'listening', version: 3, checksum: '3'.repeat(64), payload: large, active: true });
  const db = { db: database };
  const previous = new OldAccess({} as never, db as never);
  const next = new ContentAccessService({} as never, db as never);
  const oldBanks = new OldBanks(db as never, previous);
  const newBanks = new QuestionBankService(db as never, next);
  const oldApp = new OldAppContent(db as never);
  const newApp = new AppContentService(db as never);
  const oldFeedback = new OldFeedback(db as never, {} as never);
  const newFeedback = new FeedbackService(db as never, {} as never);
  const oldEditorial = new OldEditorial(db as never);
  const newEditorial = new EditorialService(db as never);
  const json = (value: unknown) => JSON.parse(JSON.stringify(value));
  const cases = [
    { name: 'feedback_page', old: () => oldFeedback.list(feedbackOwner), next: () => newFeedback.list(feedbackOwner) },
    { name: 'catalog', old: () => previous.getCatalog('listening', undefined, undefined, 'production'), next: () => next.getCatalog('listening', undefined, undefined, 'production') },
    { name: 'topic', old: () => previous.getTopic('listening', 'category', 'topic-0', undefined, undefined, 'production'), next: () => next.getTopic('listening', 'category', 'topic-0', undefined, undefined, 'production') },
    { name: 'bank_summary', old: () => oldBanks.list(), next: () => newBanks.list() },
    { name: 'app_content', old: () => oldApp.get(), next: () => newApp.get() },
    { name: 'article_list', old: () => oldEditorial.list('resource'), next: () => newEditorial.list('resource') },
  ];
  const measurements: Array<Record<string, unknown>> = [];
  for (const scenario of cases) {
    const before = performance.now(); const expected = await scenario.old(); const oldFirstMs = performance.now() - before;
    const after = performance.now(); const actual = await scenario.next(); const newFirstMs = performance.now() - after;
    expect(json(actual)).toEqual(json(expected));
    for (const concurrency of [1, 10, 30, 100]) {
      for (const [implementation, action] of [['old', scenario.old], ['new', scenario.next]] as const) {
        const times: number[] = [];
        queries.length = 0;
        for (let round = 0; round < 3; round++) {
          await Promise.all(Array.from({ length: concurrency }, async () => {
            const start = performance.now(); await action(); times.push(performance.now() - start);
          }));
        }
        times.sort((a, b) => a - b);
        measurements.push({ scenario: scenario.name, implementation, concurrency, samples: times.length,
          p50Ms: times[Math.floor(times.length * 0.5)], p95Ms: times[Math.ceil(times.length * 0.95) - 1],
          queries: queries.length, payloadReads: queries.filter(query => query.startsWith('select') &&  /"payload"(?:,| from)/.test(query)).length,
          firstCallMs: implementation === 'old' ? oldFirstMs : newFirstMs });
      }
    }
  }
  const shippedBanks = JSON.parse(readFileSync(join(__dirname, '../../../src/features/question-bank/data/question-bank.json'), 'utf8')) as Array<ReturnType<typeof dataset>>;
  await client`update question_bank_releases set active=false`;
  for (const bank of shippedBanks) await database.insert(schema.questionBankReleases).values({
    bankId: bank.id, version: 100, checksum: createHash('sha256').update(JSON.stringify(bank)).digest('hex'), payload: bank, active: true,
  });
  const shippedNext = new ContentAccessService({} as never, db as never);
  for (const bank of shippedBanks) {
    expect(json(await shippedNext.getCatalog(bank.id, undefined, undefined, 'production'))).toEqual(json(await previous.getCatalog(bank.id, undefined, undefined, 'production')));
    const category = bank.categories[0]!; const topic = category.topics[0]!;
    expect(json(await shippedNext.getTopic(bank.id, category.id, topic.id, undefined, undefined, 'production')))
      .toEqual(json(await previous.getTopic(bank.id, category.id, topic.id, undefined, undefined, 'production')));
  }
  queries.length = 0;
  await Promise.all(shippedBanks.map(bank => shippedNext.getCatalog(bank.id, undefined, undefined, 'production')));
  const shippedWarmPayloadReads = queries.filter(query => query.startsWith('select') && /"payload"(?:,| from)/.test(query)).length;
  expect(shippedWarmPayloadReads).toBe(0);
  const indexBefore: unknown[] = [];
  const indexAfter: unknown[] = [];
  const sqls = ["SELECT * FROM resource_objects WHERE source_path='/audio/4242.mp3' AND status='ready' ORDER BY created_at DESC LIMIT 1",
    "SELECT * FROM resource_objects WHERE source_path='/audio/4242.mp3' AND checksum=md5('4242') AND status IN ('ready','superseded') ORDER BY created_at DESC LIMIT 1"];
  for (const query of sqls) indexAfter.push(await client.unsafe(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query}`));
  const rollback = new Error('rollback_benchmark_index_drop');
  await client.begin(async tx => {
    await tx`DROP INDEX resource_objects_ready_path_created`; await tx`DROP INDEX resource_objects_version_path_created`;
    for (const query of sqls) indexBefore.push(await tx.unsafe(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query}`));
    throw rollback;
  }).catch(error => { if (error !== rollback) throw error; });
  const report = { baselineRef, datasetBytes: Buffer.byteLength(JSON.stringify(large)), cardCount: 3000,
    note: 'Local synthetic DB, five connections, service-method time excluding HTTP/network/auth, three rounds; not production capacity.', measurements, shippedBanksCompared: shippedBanks.map(bank => bank.id), shippedWarmPayloadReads, indexBefore, indexAfter };
  const output = resolve('.generated/backend-performance-benchmark.json');
  writeFileSync(output, JSON.stringify(report, null, 2));
  console.log('Benchmark evidence:', output);
}, 120000);
