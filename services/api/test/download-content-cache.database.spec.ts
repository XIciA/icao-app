import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { normalizeVocabularyPronunciation, vocabularyLivePayload } from '@icao/contracts/vocabulary-live';
import type { OfflineDownloadScope } from '@icao/contracts';
import { ContentAccessService } from '../src/content-access/content-access.service';
import { QuestionBankService } from '../src/question-bank/question-bank.service';
import { VocabularyLiveService, vocabularyContentChecksum } from '../src/vocabulary/vocabulary-live.service';
import * as schema from '../src/database/schema';

const root = mkdtempSync(join(tmpdir(), 'icao-download-cache-'));
const data = join(root, 'data');
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const json = (value: unknown) => JSON.parse(JSON.stringify(value));
const shipped = JSON.parse(readFileSync(resolve('../../src/features/question-bank/data/question-bank.json'), 'utf8')) as Array<{
  id: string; categories: { id: string; name: string; topics: { id: string; cards: { id: string; audio?: string; image?: string }[] }[] }[];
}>;
let started = false;
let client: ReturnType<typeof postgres>;
let db: ReturnType<typeof drizzle<typeof schema>>;
let current: ContentAccessService;
let previous: ContentAccessService;
let summaries: QuestionBankService;
let oldSummaries: QuestionBankService;
let vocabulary: VocabularyLiveService;
let oldVocabulary: VocabularyLiveService;
const queries: string[] = [];

beforeAll(async () => {
  const port = await new Promise<number>((resolve, reject) => {
    const server = createServer(); server.once('error', reject); server.listen(0, '127.0.0.1', () => {
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
  db = drizzle(client, { schema, logger: { logQuery: query => { queries.push(query); } } });
  const database = { db } as never;
  current = new ContentAccessService({} as never, database);
  summaries = new QuestionBankService(database, current);
  vocabulary = new VocabularyLiveService(database);
  // Compare the latest stable implementation, including its publication-time semantics.
  const generated = resolve('.generated/download-cache-baseline'); mkdirSync(generated, { recursive: true });
  writeFileSync(join(generated, 'tsconfig.json'), JSON.stringify({ extends: '../../tsconfig.json', include: ['*.ts'] }));
  const load = async (file: string) => {
    const source = execFileSync('git', ['show', `ec6781fc92061424942f6fb82d9226f176f9686a:services/api/src/${file}`], { encoding: 'utf8' });
    const rewritten = source.replace(/from ['"](\.[^'"]+)['"]/g, (_match, specifier: string) => `from '${resolve('src', dirname(file), specifier)}.ts'`);
    const target = join(generated, file.replaceAll('/', '-')); writeFileSync(target, rewritten);
    return import(target);
  };
  const OldContent = (await load('content-access/content-access.service.ts')).ContentAccessService as typeof ContentAccessService;
  const OldSummary = (await load('question-bank/question-bank.service.ts')).QuestionBankService as typeof QuestionBankService;
  const OldVocabulary = (await load('vocabulary/vocabulary-live.service.ts')).VocabularyLiveService as typeof VocabularyLiveService;
  previous = new OldContent({} as never, database); oldSummaries = new OldSummary(database, previous); oldVocabulary = new OldVocabulary(database);
  const resources: typeof schema.resourceObjects.$inferInsert[] = [];
  for (const bank of shipped) {
    await db.insert(schema.questionBankReleases).values({ bankId: bank.id, version: 100, checksum: hash(JSON.stringify(bank)), payload: bank, active: true, createdAt: new Date('2026-10-01') });
    const paths = [...new Set(bank.categories.flatMap(category => category.topics.flatMap(topic => topic.cards.flatMap(card => [card.audio, card.image].filter((path): path is string => Boolean(path))))))];
    resources.push(...paths.map(sourcePath => ({ objectKey: `${bank.id}/${hash(sourcePath)}`, module: bank.id, sourcePath, checksum: hash(sourcePath), sizeBytes: 123, mimeType: 'audio/mpeg', createdAt: new Date('2026-10-02') })));
  }
  const words = vocabulary.baseline();
  await db.insert(schema.vocabularyReleases).values({ version: words.version, checksum: words.checksum, payload: vocabularyLivePayload(words), active: true, createdAt: new Date('2026-10-01') });
  const pronunciations = [...new Set(words.dataset.books.flatMap(book => book.words.flatMap(word => [word.pronunciationText || word.word, word.example].filter(Boolean).map(normalizeVocabularyPronunciation))))];
  resources.push(...pronunciations.map(text => ({ objectKey: `vocab/${hash(text)}`, module: 'vocabulary', sourcePath: `/pronunciation-assets/${hash(text)}.mp3`, checksum: hash(text), sizeBytes: 100, mimeType: 'audio/mpeg', createdAt: new Date('2026-10-02') })));
  for (let offset = 0; offset < resources.length; offset += 500) await db.insert(schema.resourceObjects).values(resources.slice(offset, offset + 500));
}, 60000);

afterAll(async () => {
  if (client) await client.end();
  if (started) execFileSync('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop'], { stdio: 'ignore' });
  rmSync(root, { recursive: true, force: true });
});

it('keeps all ten shipped bank scope manifests and three vocabulary manifests equal to latest stable code', async () => {
  expect(json(await summaries.list())).toEqual(json(await oldSummaries.list()));
  for (const bank of shipped) {
    const scopes: OfflineDownloadScope[] = bank.id === 'sentences900' ? ['icao4', 'icao5'] : ['selected', 'all'];
    for (const scope of scopes) {
      const expected = await previous.offlineManifest(bank.id, scope, undefined, undefined, 'production');
      expect(json(await current.offlineManifest(bank.id, scope, undefined, undefined, 'production'))).toEqual(json(expected));
      expect(json(await current.offlineManifest(bank.id, scope, undefined, undefined, 'production'))).toEqual(json(expected));
    }
  }
  for (const book of ['preview', 'icao4', 'icao5']) {
    const expected = await oldVocabulary.offlineManifest(book);
    expect(json(await vocabulary.offlineManifest(book))).toEqual(json(expected));
    expect(json(await vocabulary.offlineManifest(book))).toEqual(json(expected));
  }
  queries.length = 0;
  await summaries.list();
  expect(queries.some(query => /select "payload" from/.test(query))).toBe(false);
}, 60000);

it('updates same-path resource checksum, bytes and publication time without changing the immutable question release', async () => {
  const bank = shipped.find(bank => bank.id === 'sentences900')!;
  const before = await current.offlineManifest(bank.id, 'icao5', undefined, undefined, 'production');
  const path = before.resources[0]!.publicPath;
  await client`update resource_objects set status='superseded' where module=${bank.id} and source_path=${path}`;
  await db.insert(schema.resourceObjects).values({ objectKey: 'replacement', module: bank.id, sourcePath: path, checksum: 'f'.repeat(64), sizeBytes: 999, mimeType: 'audio/mpeg', createdAt: new Date('2026-10-03') });
  const next = await current.offlineManifest(bank.id, 'icao5', undefined, undefined, 'production');
  expect(next.version).toBe(before.version); expect(next.checksum).toBe(before.checksum);
  expect(next.fingerprint).not.toBe(before.fingerprint); expect(next.publishedAt).toBe('2026-10-03T00:00:00.000Z');
  expect(next.resources.find(resource => resource.publicPath === path)?.sizeBytes).toBe(999);
  expect(json(next)).toEqual(json(await previous.offlineManifest(bank.id, 'icao5', undefined, undefined, 'production')));
  expect(json(await summaries.list())).toEqual(json(await oldSummaries.list()));
  await client`update resource_objects set status='superseded' where object_key='replacement'`;
  await expect(current.offlineManifest(bank.id, 'icao5', undefined, undefined, 'production')).rejects.toThrow('download_resource_unavailable');
  await client`update resource_objects set status='ready' where object_key='replacement'`;
  await expect(current.offlineManifest(bank.id, 'icao5', undefined, undefined, 'sandbox')).rejects.toThrow();
});

it('rechecks word release changes, rollback and live resource replacements independently', async () => {
  const before = await vocabulary.offlineManifest('preview');
  const release = structuredClone(vocabularyLivePayload(vocabulary.baseline()));
  release.version += 1; release.dataset.version = release.version; release.policy.version = release.version;
  const word = release.dataset.books.find(book => book.id === 'preview')!.words[0]!;
  word.meaning += '（修订）'; release.policy.testWords[word.id]!.meaning = word.meaning;
  await client`update vocabulary_releases set active=false`;
  await db.insert(schema.vocabularyReleases).values({ version: release.version, checksum: vocabularyContentChecksum(release), payload: release, active: true, createdAt: new Date('2026-10-04') });
  const changed = await vocabulary.offlineManifest('preview');
  expect(changed.vocabulary?.wordChecksums[word.id]).not.toBe(before.vocabulary?.wordChecksums[word.id]);
  expect(json(changed)).toEqual(json(await oldVocabulary.offlineManifest('preview')));
  await client`update vocabulary_releases set active=false`;
  await client`update vocabulary_releases set active=true where version=${before.version}`;
  expect(json(await vocabulary.offlineManifest('preview'))).toEqual(json(before));
  const path = before.resources[0]!.publicPath;
  await client`update resource_objects set checksum=${'e'.repeat(64)}, size_bytes=200, created_at='2026-10-05T00:00:00Z' where source_path=${path}`;
  const replaced = await vocabulary.offlineManifest('preview');
  expect(replaced.fingerprint).not.toBe(before.fingerprint);
  expect(replaced.publishedAt).toBe('2026-10-05T00:00:00.000Z');
  expect(json(replaced)).toEqual(json(await oldVocabulary.offlineManifest('preview')));
});
