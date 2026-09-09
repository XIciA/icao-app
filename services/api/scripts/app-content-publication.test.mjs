import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prepareAppContent, publishAppContent, rollbackDeploymentAppContent } from './import-app-content.mjs';

const repo = new URL('../../../', import.meta.url);
const read = (name) => readFileSync(new URL(name, repo), 'utf8');
const snapshot = {
  ...JSON.parse(read('content/app-content/text.json')),
  hotspots: JSON.parse(read('content/question-banks/opi-hotspots.json')),
};
const topics = new Map();
for (const brief of snapshot.hotspots.briefs) for (const topic of brief.topics) {
  const cards = topics.get(topic.topicId) ?? new Set();
  topic.cardIds.forEach((id) => cards.add(id));
  topics.set(topic.topicId, cards);
}
const opi = { id: 'opi', categories: [{ topics: [...topics].map(([id, cards]) => ({ id, cards: [...cards].map((id) => ({ id })) })) }] };
const identity = ({ version, checksum }) => ({ version, checksum });
function release(offset = 0) {
  const data = structuredClone(snapshot);
  data.version += offset;
  if (offset) data.help[0].answer += ` 发布测试 ${offset}`;
  return prepareAppContent(data);
}

// A fresh local PostgreSQL cluster verifies the actual importer transaction and
// unique-active constraint, without environment files or existing databases.
const directory = mkdtempSync(join(tmpdir(), 'icao-app-content-publication-'));
const data = join(directory, 'data');
let started = false;
let database;
beforeAll(async () => {
  const port = await new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
  execFileSync('initdb', ['-D', data, '-A', 'trust', '-U', 'postgres', '--no-locale'], { stdio: 'ignore' });
  execFileSync('pg_ctl', ['-D', data, '-o', `-F -h 127.0.0.1 -k ${directory} -p ${port}`, '-w', 'start'], { stdio: 'ignore' });
  started = true;
  database = postgres({ host: '127.0.0.1', port, username: 'postgres', database: 'postgres', max: 2, onnotice: () => undefined });
  await database.unsafe(`CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE TABLE question_bank_releases(bank_id text, version integer, payload jsonb, active boolean);`);
  await database.unsafe(read('services/api/drizzle/0043_app_content_releases.sql').replaceAll('--> statement-breakpoint', ''));
  await database`insert into question_bank_releases values ('opi', 12, ${database.json(opi)}, true)`;
}, 30_000);
beforeEach(async () => { await database`truncate app_content_releases`; });
afterAll(async () => {
  if (database) await database.end();
  if (started) execFileSync('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop'], { stdio: 'ignore' });
  rmSync(directory, { recursive: true, force: true });
});
const active = async () => (await database`select version, checksum from app_content_releases where active = true`)[0] ?? null;

describe('candidate app-content activation and deployment rollback', () => {
  it('records the previous identity before activation and can restore it idempotently', async () => {
    const original = release(), candidate = release(1);
    await publishAppContent(database, original);
    let checkpoint;
    await publishAppContent(database, candidate, { beforeActivation: async (value) => {
      expect(await active()).toEqual(identity(original));
      checkpoint = value;
    } });
    expect(checkpoint).toEqual({ schemaVersion: 1, previous: identity(original), next: identity(candidate) });
    expect(await active()).toEqual(identity(candidate));
    await rollbackDeploymentAppContent(database, checkpoint);
    expect(await active()).toEqual(identity(original));
    await rollbackDeploymentAppContent(database, checkpoint);
    expect(await active()).toEqual(identity(original));
    expect((await database`select version from app_content_releases`).length).toBe(2);
  });
  it('does not activate when saving the private rollback checkpoint fails', async () => {
    const original = release();
    await publishAppContent(database, original);
    await expect(publishAppContent(database, release(1), { beforeActivation: () => { throw new Error('checkpoint_unwritable'); } })).rejects.toThrow('checkpoint_unwritable');
    expect(await active()).toEqual(identity(original));
    expect((await database`select version from app_content_releases`).length).toBe(1);
  });
  it('rejects broken hotspot references before writing the checkpoint or changing live content', async () => {
    const original = release();
    await publishAppContent(database, original);
    const invalid = release(1).payload;
    invalid.hotspots.briefs[0].topics[0].cardIds[0] = 'missing-question';
    let checkpointWritten = false;
    await expect(publishAppContent(database, prepareAppContent(invalid), { beforeActivation: () => { checkpointWritten = true; } })).rejects.toThrow('hotspot_card_missing');
    expect(checkpointWritten).toBe(false);
    expect(await active()).toEqual(identity(original));
  });
  it('preserves immutable content and legal-document versions across deploys', async () => {
    const original = release();
    await publishAppContent(database, original);
    const edited = release(1).payload;
    edited.version = original.version;
    await expect(publishAppContent(database, prepareAppContent(edited))).rejects.toThrow('app_content_version_immutable');
    edited.version += 1;
    edited.legal.privacy.intro += '未提升文档版本的改动';
    await expect(publishAppContent(database, prepareAppContent(edited))).rejects.toThrow('legal_document_version_immutable');
    expect(await active()).toEqual(identity(original));
  });
  it('can undo initial activation and safely ignore a checkpoint from a failed transaction', async () => {
    let checkpoint;
    await expect(publishAppContent(database, release(), { beforeActivation: (value) => {
      checkpoint = value;
      throw new Error('transaction_interrupted');
    } })).rejects.toThrow('transaction_interrupted');
    await rollbackDeploymentAppContent(database, checkpoint);
    expect(await active()).toBeNull();
    await publishAppContent(database, release(), { beforeActivation: (value) => { checkpoint = value; } });
    await rollbackDeploymentAppContent(database, checkpoint);
    expect(await active()).toBeNull();
  });
  it('never overwrites a newer independent publication during API rollback', async () => {
    await publishAppContent(database, release());
    let checkpoint;
    await publishAppContent(database, release(1), { beforeActivation: (value) => { checkpoint = value; } });
    const newer = release(2);
    await publishAppContent(database, newer);
    await expect(rollbackDeploymentAppContent(database, checkpoint)).rejects.toThrow('app_content_changed_after_activation');
    expect(await active()).toEqual(identity(newer));
  });
  it('refuses a missing previous version without deactivating the candidate', async () => {
    const candidate = release(1);
    await publishAppContent(database, candidate);
    await expect(rollbackDeploymentAppContent(database, { schemaVersion: 1, previous: identity(release()), next: identity(candidate) })).rejects.toThrow('app_content_rollback_version_missing');
    expect(await active()).toEqual(identity(candidate));
  });
});

it('packages fixed content for deployment and both migration paths, and activates before API cutover', () => {
  const sources = ['content/app-content/text.json', 'content/question-banks/opi-hotspots.json'];
  const dockerfile = read('infra/api/Dockerfile');
  for (const file of sources) expect(dockerfile).toContain(`COPY ${file} ${file}`);
  for (const file of ['scripts/deploy-api-release.sh', 'scripts/apply-production-migrations.sh', 'scripts/rehearse-production-migrations.sh']) {
    const archive = read(file).match(/git archive[\s\S]*?content\/vocabulary[^\n]*/)?.[0];
    for (const source of sources) expect(archive).toContain(source);
  }
  const deploy = read('scripts/deploy-api-release.sh');
  expect(deploy.indexOf('--deployment-activate')).toBeGreaterThan(deploy.indexOf('migration-plan.mjs --require-current'));
  expect(deploy.indexOf('--deployment-activate')).toBeLessThan(deploy.indexOf('cutover_started=1'));
  const cleanup = deploy.slice(deploy.indexOf('cleanup_release() {'), deploy.indexOf('trap cleanup_release EXIT'));
  expect(cleanup).toContain('--deployment-rollback');
});
