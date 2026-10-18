import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import postgres from 'postgres';
import ts from 'typescript';
import vm from 'node:vm';
import { assertHotspotReferences } from './native-content-release.mjs';

// A fixed contract is shared with the API/client. No arbitrary content-defined code is evaluated.
const contractPath = resolve(new URL('../../../packages/contracts/src/app-content.ts', import.meta.url).pathname);
const source = ts.transpileModule(readFileSync(contractPath, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const exports = {};
vm.runInNewContext(source, { exports });
const { canonicalAppContentJson, isAppContentSnapshot } = exports;

export function prepareAppContent(raw) {
  if (!isAppContentSnapshot(raw)) throw new Error('invalid_app_content_release');
  return { version: raw.version, checksum: createHash('sha256').update(canonicalAppContentJson(raw)).digest('hex'), payload: raw };
}

export function assertLegalDocumentVersions(previousPayloads, nextPayload) {
  for (const payload of previousPayloads) for (const id of ['agreement', 'privacy', 'thirdPartyServices']) {
    const previous = payload.legal[id];
    const next = nextPayload.legal[id];
    if (previous.version === next.version && canonicalAppContentJson(previous) !== canonicalAppContentJson(next)) throw new Error('legal_document_version_immutable');
  }
}

export async function publishAppContent(database, release, { beforeActivation, preserveActive = false } = {}) {
  return await database.begin(async (sql) => {
    await sql`select pg_advisory_xact_lock(hashtext('app_content_publish'))`;
    const [previous] = await sql`select version, checksum from app_content_releases where active = true limit 1`;
    // API code deployment bootstraps an empty installation only. Live work-order
    // content remains the authority, even when the image contains a newer seed.
    if (preserveActive && previous) return { ...previous, activated: false };
    if (previous && previous.version > release.version) throw new Error('app_content_version_regression');
    const [opi] = await sql`select payload from question_bank_releases where bank_id = 'opi' and active = true order by version desc limit 1`;
    assertHotspotReferences(release.payload.hotspots, opi?.payload);
    const published = await sql`select payload from app_content_releases`;
    assertLegalDocumentVersions(published.map((row) => row.payload), release.payload);
    const [existing] = await sql`select checksum from app_content_releases where version = ${release.version}`;
    if (existing && existing.checksum !== release.checksum) throw new Error('app_content_version_immutable');
    // Persist only immutable release identities before committing the activation.
    // A failed SQL transaction leaves the previous active content untouched.
    await beforeActivation?.({ schemaVersion: 1, previous: previous ?? null, next: { version: release.version, checksum: release.checksum } });
    await sql`update app_content_releases set active = false where active = true`;
    await sql`insert into app_content_releases (version, checksum, payload, active)
      values (${release.version}, ${release.checksum}, ${sql.json(release.payload)}, true)
      on conflict (version) do update set active = true`;
    return { version: release.version, checksum: release.checksum, activated: true };
  });
}

const validIdentity = (value) => value && Number.isSafeInteger(value.version) && value.version > 0 && /^[a-f0-9]{64}$/.test(value.checksum);
const sameIdentity = (left, right) => left?.version === right?.version && left?.checksum === right?.checksum;

export async function rollbackDeploymentAppContent(database, checkpoint) {
  if (checkpoint?.schemaVersion !== 1 || !validIdentity(checkpoint.next)
    || (checkpoint.previous !== null && !validIdentity(checkpoint.previous))) throw new Error('invalid_app_content_activation_checkpoint');
  await database.begin(async (sql) => {
    await sql`select pg_advisory_xact_lock(hashtext('app_content_publish'))`;
    const [active] = await sql`select version, checksum from app_content_releases where active = true limit 1`;
    if (sameIdentity(active ?? null, checkpoint.previous)) return;
    if (!sameIdentity(active, checkpoint.next)) throw new Error('app_content_changed_after_activation');
    if (checkpoint.previous) {
      const [previous] = await sql`select version, checksum from app_content_releases where version = ${checkpoint.previous.version}`;
      if (!sameIdentity(previous, checkpoint.previous)) throw new Error('app_content_rollback_version_missing');
    }
    await sql`update app_content_releases set active = false where active = true`;
    if (checkpoint.previous) await sql`update app_content_releases set active = true where version = ${checkpoint.previous.version}`;
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const rollbackIndex = process.argv.indexOf('--deployment-rollback');
  if (rollbackIndex >= 0) {
    if (!process.argv[rollbackIndex + 1]) throw new Error('missing_activation_checkpoint');
    if (!process.env.DATABASE_URL) throw new Error('missing_DATABASE_URL');
    const checkpoint = JSON.parse(readFileSync(resolve(process.argv[rollbackIndex + 1]), 'utf8'));
    const database = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
    try { await rollbackDeploymentAppContent(database, checkpoint); }
    finally { await database.end({ timeout: 5 }); }
    console.log('app_content_deployment_rollback_ok');
  } else {
    const activationIndex = process.argv.indexOf('--deployment-activate');
    if (activationIndex >= 0 && !process.argv[activationIndex + 1]) throw new Error('missing_activation_checkpoint');
    // API deployment must use the canonical sources inside its mainline image.
    const raw = activationIndex < 0 && process.env.APP_CONTENT_FILE
      ? JSON.parse(readFileSync(resolve(process.env.APP_CONTENT_FILE), 'utf8'))
      : { ...JSON.parse(readFileSync(new URL('../../../content/app-content/text.json', import.meta.url), 'utf8')),
        hotspots: JSON.parse(readFileSync(new URL('../../../content/question-banks/opi-hotspots.json', import.meta.url), 'utf8')) };
    const release = prepareAppContent(raw);
    const outputIndex = process.argv.indexOf('--prepare');
    if (outputIndex >= 0) {
      if (!process.argv[outputIndex + 1]) throw new Error('missing_output_file');
      writeFileSync(resolve(process.argv[outputIndex + 1]), `${JSON.stringify(release.payload, null, 2)}\n`);
      console.log(`app_content_prepared version=${release.version} checksum=${release.checksum}`);
    }
    else if (process.argv.includes('--validate')) console.log(`app_content_valid version=${release.version} checksum=${release.checksum}`);
    else {
      if (!process.env.DATABASE_URL) throw new Error('missing_DATABASE_URL');
      const database = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
      let result;
      try { result = await publishAppContent(database, release, activationIndex < 0 ? undefined : {
        preserveActive: true,
        beforeActivation: (checkpoint) => writeFileSync(resolve(process.argv[activationIndex + 1]), `${JSON.stringify(checkpoint)}\n`, { mode: 0o600, flag: 'wx' }),
      }); }
      finally { await database.end({ timeout: 5 }); }
      console.log(`${result.activated ? 'app_content_import_ok' : 'app_content_preserved'} version=${result.version} checksum=${result.checksum}`);
    }
  }
}
