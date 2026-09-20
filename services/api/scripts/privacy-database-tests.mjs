import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { after, before } from 'node:test';
import { and, eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as databaseSchema from '../src/database/schema.ts';
import { SyncService } from '../src/sync/sync.service.ts';
import { resetLearningHistoryForContent } from './native-content-history-reset.mjs';
import { planNativeContentPublication } from './native-content-release.mjs';

const migrationsDirectory = fileURLToPath(new URL('../drizzle', import.meta.url));
const clusterRoot = mkdtempSync(join(tmpdir(), 'icao-privacy-postgres-'));
const dataDirectory = join(clusterRoot, 'data');
const socketDirectory = join(clusterRoot, 'socket');
let port;
let databaseClient;
let database;
let sync;

function requireBinary(name) {
  const result = spawnSync('sh', ['-c', `command -v ${name}`], { encoding: 'utf8' });
  assert.equal(result.status, 0, `missing_required_postgres_binary:${name}`);
  return result.stdout.trim();
}

function availablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      assert.ok(address && typeof address === 'object');
      server.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });
}

function psql(input) {
  return spawnSync(requireBinary('psql'), [
    '-X', '-q', '-v', 'ON_ERROR_STOP=1',
    '-h', socketDirectory,
    '-p', String(port),
    '-U', 'postgres',
    '-d', 'postgres',
  ], {
    input,
    encoding: 'utf8',
    env: { ...process.env, LC_ALL: 'C' },
  });
}

function queryScalar(statement) {
  return execFileSync(requireBinary('psql'), [
    '-X', '-qAt',
    '-h', socketDirectory,
    '-p', String(port),
    '-U', 'postgres',
    '-d', 'postgres',
    '-c', statement,
  ], { encoding: 'utf8' }).trim();
}

function serviceInstance() {
  return new SyncService({ db: database });
}

async function createAccount(id) {
  await database.insert(databaseSchema.accounts).values({ id });
}

function aiMutation(mutationId, recordId, secret, version = 1, aiResultGeneration = 0) {
  const timestamp = `2026-08-25T00:00:${String(version).padStart(2, '0')}.000Z`;
  return {
    mutationId,
    kind: 'learning_record',
    payload: {
      recordId,
      record: {
        id: recordId,
        recordType: 'ai_result',
        answer: secret,
        aiResult: { transcript: secret, review: secret },
        createdAt: timestamp,
      },
      aiResultGeneration,
      occurredAt: timestamp,
      updatedAt: timestamp,
      version,
    },
  };
}

function cardMutation(mutationId, cardId, version = 1) {
  const timestamp = `2026-08-25T00:01:${String(version).padStart(2, '0')}.000Z`;
  return {
    mutationId,
    kind: 'card_state',
    payload: {
      bankId: 'opi',
      topicId: 'topic-1',
      cardId,
      state: {
        visited: true,
        completed: true,
        note: `note-${cardId}`,
        updatedAt: timestamp,
      },
      updatedAt: timestamp,
      version,
    },
  };
}

async function push(accountId, mutations, generations = {}) {
  return sync.push(accountId, {
    ownerUserId: accountId,
    cursor: 0,
    dataGeneration: generations.dataGeneration ?? 0,
    aiResultGeneration: generations.aiResultGeneration ?? 0,
    mutations,
  });
}

async function accountGenerations(accountId) {
  const [row] = await database.select({
    aiResultGeneration: databaseSchema.accounts.aiResultGeneration,
    dataGeneration: databaseSchema.accounts.learningDataGeneration,
  }).from(databaseSchema.accounts).where(eq(databaseSchema.accounts.id, accountId)).limit(1);
  return row;
}

async function activeRecordCount(accountId, recordId) {
  const [row] = await database.select({ count: sql`count(*)::int` })
    .from(databaseSchema.learningRecords)
    .where(and(
      eq(databaseSchema.learningRecords.userId, accountId),
      eq(databaseSchema.learningRecords.clientRecordId, recordId),
      sql`coalesce(${databaseSchema.learningRecords.payload}->>'deleted', 'false') <> 'true'`,
    ));
  return row.count;
}

before(async () => {
  port = await availablePort();
  mkdirSync(socketDirectory);
  execFileSync(requireBinary('initdb'), [
    '-D', dataDirectory, '-A', 'trust', '-U', 'postgres', '--no-locale',
  ], { stdio: 'ignore' });
  execFileSync(requireBinary('pg_ctl'), [
    '-D', dataDirectory,
    '-o', `-F -k ${socketDirectory} -p ${port}`,
    '-w', 'start',
  ], { stdio: 'ignore' });
  const bootstrap = psql(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY);
    CREATE TABLE auth.sessions (id uuid PRIMARY KEY, user_id uuid NOT NULL);
    CREATE SCHEMA storage;
    CREATE TABLE storage.buckets (
      id text PRIMARY KEY,
      name text NOT NULL,
      public boolean NOT NULL,
      file_size_limit bigint,
      allowed_mime_types text[]
    );
  `);
  assert.equal(bootstrap.status, 0, bootstrap.stderr);
  assert.ok(existsSync(migrationsDirectory));
  const migrationFiles = readdirSync(migrationsDirectory)
    .filter((name) => name.endsWith('.sql'))
    .sort();
  for (const name of migrationFiles) {
    const migration = psql(
      readFileSync(join(migrationsDirectory, name), 'utf8')
        .replaceAll('--> statement-breakpoint', ''),
    );
    assert.equal(migration.status, 0, `${name}:${migration.stderr}`);
  }
  databaseClient = postgres({
    database: 'postgres',
    host: socketDirectory,
    max: 8,
    port,
    username: 'postgres',
  });
  database = drizzle(databaseClient, { schema: databaseSchema });
  sync = serviceInstance();
});

after(async () => {
  await databaseClient?.end({ timeout: 5 });
  spawnSync(requireBinary('pg_ctl'), [
    '-D', dataDirectory, '-m', 'fast', '-w', 'stop',
  ], { stdio: 'ignore' });
  rmSync(clusterRoot, { recursive: true, force: true });
});

test('single-result tombstones scrub history and make old mutation replays authoritative deletes', async () => {
  const accountId = '61000000-0000-4000-8000-000000000001';
  const recordId = 'ai-record-one';
  const secret = 'deleted-ai-secret-one';
  const original = aiMutation('mutation-ai-one', recordId, secret);
  await createAccount(accountId);

  assert.equal((await push(accountId, [original])).results[0].status, 'accepted');
  assert.deepEqual(await sync.deleteAiResult(accountId, recordId), {
    aiResultGeneration: 0,
    dataGeneration: 0,
    deletedCount: 1,
  });

  const replay = await push(accountId, [original]);
  assert.equal(replay.results[0].status, 'duplicate');
  assert.equal(replay.results[0].authoritative.deleted, true);
  assert.equal(replay.results[0].authoritative.record, undefined);
  const newerReplay = await push(accountId, [aiMutation('mutation-ai-one-newer', recordId, `${secret}-newer`, 2)]);
  assert.equal(newerReplay.results[0].status, 'conflict');
  assert.equal(newerReplay.results[0].authoritative.deleted, true);

  const pulled = await sync.pull(accountId, '0', accountId);
  assert.equal(pulled.changes.length, 1);
  assert.equal(pulled.changes[0].payload.deleted, true);
  assert.equal(JSON.stringify(pulled).includes(secret), false);
  assert.equal(queryScalar(`
    SELECT count(*) FROM (
      SELECT payload::text AS value FROM learning_records WHERE user_id = '${accountId}'
      UNION ALL SELECT payload::text FROM sync_changes WHERE user_id = '${accountId}'
      UNION ALL SELECT result::text FROM sync_mutations WHERE user_id = '${accountId}'
    ) history WHERE value LIKE '%${secret}%'
  `), '0');
});

test('bulk generations reject stale devices while another account remains isolated', async () => {
  const accountA = '62000000-0000-4000-8000-000000000001';
  const accountB = '62000000-0000-4000-8000-000000000002';
  await createAccount(accountA);
  await createAccount(accountB);
  await push(accountA, [aiMutation('mutation-a', 'shared-record', 'account-a-secret')]);
  await push(accountB, [aiMutation('mutation-b', 'shared-record', 'account-b-secret')]);

  const deleted = await sync.deleteAllAiResults(accountA, {
    confirmation: '删除全部AI结果',
    idempotencyKey: '62000000-0000-4000-8000-000000000011',
  });
  assert.deepEqual(deleted, { aiResultGeneration: 1, dataGeneration: 0, deletedCount: 1 });
  assert.equal(await activeRecordCount(accountA, 'shared-record'), 0);
  assert.equal(await activeRecordCount(accountB, 'shared-record'), 1);

  const staleAi = await push(accountA, [aiMutation('mutation-a-stale', 'stale-ai', 'must-not-return')]);
  assert.equal(staleAi.resetAiResults, true);
  assert.equal(staleAi.results[0].status, 'discarded');
  assert.equal(await activeRecordCount(accountA, 'stale-ai'), 0);
  assert.equal((await push(accountB, [aiMutation('mutation-b-current', 'current-ai', 'account-b-current')])).results[0].status, 'accepted');

  await push(accountA, [cardMutation('card-before-clear', 'card-before')], { aiResultGeneration: 1 });
  const cleared = await sync.clearLearningData(accountA, {
    confirmation: '清除学习数据',
    idempotencyKey: '62000000-0000-4000-8000-000000000012',
  });
  assert.equal(cleared.dataGeneration, 1);
  assert.equal(cleared.aiResultGeneration, 2);
  const staleLearning = await push(accountA, [cardMutation('card-stale', 'card-stale')]);
  assert.equal(staleLearning.resetLearningData, true);
  assert.equal(staleLearning.results[0].status, 'discarded');
  assert.equal(queryScalar(`SELECT count(*) FROM user_card_states WHERE user_id = '${accountA}'`), '0');
  assert.equal(await activeRecordCount(accountB, 'current-ai'), 1);
  const sameKeyOtherAccount = await sync.deleteAllAiResults(accountB, {
    confirmation: '删除全部AI结果',
    idempotencyKey: '62000000-0000-4000-8000-000000000011',
  });
  assert.equal(sameKeyOtherAccount.aiResultGeneration, 1);
  assert.equal(sameKeyOtherAccount.deletedCount, 2);
});

test('concurrent push and bulk delete serialize without retaining or resurrecting AI text', async () => {
  const accountId = '63000000-0000-4000-8000-000000000001';
  const secret = 'concurrent-ai-secret';
  await createAccount(accountId);
  const [pushResult, deleteResult] = await Promise.all([
    push(accountId, [aiMutation('mutation-race', 'race-record', secret)]),
    sync.deleteAllAiResults(accountId, {
      confirmation: '删除全部AI结果',
      idempotencyKey: '63000000-0000-4000-8000-000000000011',
    }),
  ]);

  assert.ok(['accepted', 'discarded'].includes(pushResult.results[0].status));
  assert.equal(deleteResult.aiResultGeneration, 1);
  assert.deepEqual(await accountGenerations(accountId), { aiResultGeneration: 1, dataGeneration: 0 });
  assert.equal(await activeRecordCount(accountId, 'race-record'), 0);
  assert.equal(queryScalar(`
    SELECT count(*) FROM (
      SELECT payload::text AS value FROM learning_records WHERE user_id = '${accountId}'
      UNION ALL SELECT payload::text FROM sync_changes WHERE user_id = '${accountId}'
      UNION ALL SELECT result::text FROM sync_mutations WHERE user_id = '${accountId}'
    ) history WHERE value LIKE '%${secret}%'
  `), '0');
});

test('delete-all idempotency survives concurrency, response loss and service restart', async () => {
  const accountId = '64000000-0000-4000-8000-000000000001';
  const request = {
    confirmation: '删除全部AI结果',
    idempotencyKey: '64000000-0000-4000-8000-000000000011',
  };
  await createAccount(accountId);
  await push(accountId, [aiMutation('mutation-idempotent-old', 'old-ai', 'old-ai-secret')]);

  const [first, concurrentRetry] = await Promise.all([
    sync.deleteAllAiResults(accountId, request),
    sync.deleteAllAiResults(accountId, request),
  ]);
  assert.deepEqual(concurrentRetry, first);
  assert.deepEqual(first, { aiResultGeneration: 1, dataGeneration: 0, deletedCount: 1 });
  assert.equal(queryScalar(`SELECT count(*) FROM privacy_action_receipts WHERE account_id = '${accountId}'`), '1');

  await push(accountId, [aiMutation('mutation-idempotent-new', 'new-ai', 'new-ai-secret', 1, 1)], {
    aiResultGeneration: 1,
  });
  const restarted = serviceInstance();
  assert.deepEqual(await restarted.deleteAllAiResults(accountId, request), first);
  assert.deepEqual(await accountGenerations(accountId), { aiResultGeneration: 1, dataGeneration: 0 });
  assert.equal(await activeRecordCount(accountId, 'new-ai'), 1);

  await assert.rejects(
    restarted.deleteAllAiResults(accountId, {
      confirmation: '清除学习数据',
      idempotencyKey: request.idempotencyKey,
    }),
    (error) => error?.message === 'privacy_idempotency_conflict',
  );
  assert.equal(await activeRecordCount(accountId, 'new-ai'), 1);
});

test('clear-learning idempotency returns the first result without deleting later learning', async () => {
  const accountId = '65000000-0000-4000-8000-000000000001';
  const request = {
    confirmation: '清除学习数据',
    idempotencyKey: '65000000-0000-4000-8000-000000000011',
  };
  await createAccount(accountId);
  await push(accountId, [cardMutation('clear-card-old', 'old-card')]);

  const [first, concurrentRetry] = await Promise.all([
    sync.clearLearningData(accountId, request),
    sync.clearLearningData(accountId, request),
  ]);
  assert.deepEqual(concurrentRetry, first);
  assert.deepEqual(first, { aiResultGeneration: 1, dataGeneration: 1, deletedCount: 1 });

  await push(accountId, [cardMutation('clear-card-new', 'new-card')], {
    aiResultGeneration: 1,
    dataGeneration: 1,
  });
  assert.deepEqual(await serviceInstance().clearLearningData(accountId, request), first);
  assert.deepEqual(await accountGenerations(accountId), { aiResultGeneration: 1, dataGeneration: 1 });
  assert.equal(queryScalar(`SELECT count(*) FROM user_card_states WHERE user_id = '${accountId}' AND card_id = 'new-card'`), '1');
});

test('content consolidation clears old history, preserves personal documents and rejects stale devices', async () => {
  const accountId = '66000000-0000-4000-8000-000000000001';
  await createAccount(accountId);
  await push(accountId, [cardMutation('content-old-card', 'old-card'), aiMutation('content-old-ai', 'old-ai', 'old-answer')]);
  const profile = { displayName: 'Test pilot', target: 'icao5-first', studyScope: 'selected' };
  const vocabulary = { favorites: ['runway'] };
  await database.insert(databaseSchema.userDocuments).values([
    { userId: accountId, documentKey: 'account_profile', payload: profile, version: 3 },
    { userId: accountId, documentKey: 'vocabulary', payload: vocabulary, version: 4 },
  ]);
  // A failed content transaction must not clear history or increment generations.
  await assert.rejects(databaseClient.begin(async (tx) => {
    await resetLearningHistoryForContent(tx);
    throw new Error('publication_failed');
  }), /publication_failed/);
  assert.deepEqual(await accountGenerations(accountId), { aiResultGeneration: 0, dataGeneration: 0 });
  assert.equal(await activeRecordCount(accountId, 'old-ai'), 1);
  await databaseClient.begin((tx) => resetLearningHistoryForContent(tx));
  assert.deepEqual(await accountGenerations(accountId), { aiResultGeneration: 1, dataGeneration: 1 });
  assert.equal(await activeRecordCount(accountId, 'old-ai'), 0);
  const stale = await push(accountId, [cardMutation('stale-card', 'old-card')]);
  assert.equal(stale.resetLearningData, true);
  assert.equal(stale.results[0].status, 'discarded');
  const documents = await databaseClient`select document_key, payload from user_documents where user_id = ${accountId}`;
  assert.deepEqual(Object.fromEntries(documents.map((row) => [row.document_key, row.payload])), { account_profile: profile, vocabulary });
  const changes = await databaseClient`select kind, entity_key from sync_changes where user_id = ${accountId}`;
  assert.deepEqual(changes.map((row) => row.kind), ['document', 'document']);
  assert.equal(queryScalar(`SELECT count(*) FROM user_card_states WHERE user_id = '${accountId}'`), '0');
  await push(accountId, [cardMutation('fresh-card', 'fresh-card')], { dataGeneration: 1, aiResultGeneration: 1 });
  assert.equal(queryScalar(`SELECT count(*) FROM user_card_states WHERE user_id = '${accountId}'`), '1');
});

test('content reset leaves a concurrently registered account and its first writes intact', async () => {
  const existing = '01000000-0000-4000-8000-000000000001';
  const newcomer = '02000000-0000-4000-8000-000000000001';
  await createAccount(existing);
  let releaseLock;
  let lockReady;
  const ready = new Promise((resolve) => { lockReady = resolve; });
  const hold = new Promise((resolve) => { releaseLock = resolve; });
  const holder = databaseClient.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtextextended(${'learning:' + existing}, 0))`;
    lockReady();
    await hold;
  });
  await ready;
  const reset = databaseClient.begin((tx) => resetLearningHistoryForContent(tx));
  try {
    // Wait until reset has read its snapshot and is waiting for the first user's
    // normal learning lock. Signup remains available on another DB connection.
    let waiting = false;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const rows = await databaseClient`select count(*)::int as count from pg_stat_activity where wait_event = 'advisory'`;
      if (rows[0].count > 0) { waiting = true; break; }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.equal(waiting, true, 'reset did not reach its account lock');
    await createAccount(newcomer);
    await push(newcomer, [cardMutation('new-user-first-write', 'new-user-first-card')]);
  } finally {
    releaseLock();
    await holder;
    await reset;
  }
  assert.deepEqual(await accountGenerations(existing), { aiResultGeneration: 1, dataGeneration: 1 });
  assert.deepEqual(await accountGenerations(newcomer), { aiResultGeneration: 0, dataGeneration: 0 });
  assert.equal(queryScalar(`SELECT count(*) FROM user_card_states WHERE user_id = '${newcomer}'`), '1');
});

test('mixed-version content publication respects checksum uniqueness and resets history only once', async (t) => {
  const accountId = '77000000-0000-4000-8000-000000000001';
  await createAccount(accountId);
  await push(accountId, [cardMutation('mixed-old', 'old-card')]);
  const ids = ['listening', 'sentences900', 'radiotelephony', 'opi', 'storytelling'];
  const release = { version: 14, banks: ids.map((id) => ({ id, version: 14, checksum: `${id}-new`, payload: { id } })) };
  await databaseClient`insert into question_bank_releases (bank_id, version, checksum, payload, active)
    values ('sentences900', 13, 'sentences900-new', '{"id":"sentences900"}', true)`;
  // The publisher uses raw postgres-js. Drizzle customizes the shared test
  // client's JSON serializers, so use the same unmodified client as production.
  const publisher = postgres({ database: 'postgres', host: socketDirectory, port, username: 'postgres', prepare: false });
  t.after(() => publisher.end());
  const publish = () => publisher.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext('app_content_publish'))`;
    const plan = planNativeContentPublication(release, await tx`select bank_id, version, checksum from question_bank_releases`, true);
    if (plan.resetHistory) await resetLearningHistoryForContent(tx);
    for (const bank of plan.banks) {
      await tx`update question_bank_releases set active = false where bank_id = ${bank.id} and active = true`;
      await tx`insert into question_bank_releases (bank_id, version, checksum, payload, active)
        values (${bank.id}, ${bank.version}, ${bank.checksum}, ${tx.json(bank.payload)}, true)
        on conflict (bank_id, version) do update set active = true`;
    }
  });
  await publish();
  assert.deepEqual(await accountGenerations(accountId), { aiResultGeneration: 1, dataGeneration: 1 });
  await push(accountId, [cardMutation('mixed-new', 'new-card')], { dataGeneration: 1, aiResultGeneration: 1 });
  await publish();
  assert.deepEqual(await accountGenerations(accountId), { aiResultGeneration: 1, dataGeneration: 1 });
  assert.equal(queryScalar(`SELECT count(*) FROM user_card_states WHERE user_id = '${accountId}'`), '1');
  assert.equal(queryScalar('SELECT count(*) FROM question_bank_releases WHERE active'), '5');
  assert.equal(queryScalar("SELECT version FROM question_bank_releases WHERE bank_id = 'sentences900' AND active"), '13');
});
