import { readFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';
import { assertHotspotReferences, assertImmutableRelease, contentChecksum, prepareNativeContentRelease, selectNativeContentBanks } from './native-content-release.mjs';
import { resetLearningHistoryForContent } from './native-content-history-reset.mjs';
import { ensureNativeContentResource } from './native-content-resources.mjs';

const releaseDir = resolve(process.env.RELEASE_DIR ?? '/release');
const safeJoin = (root, relative) => {
  const file = resolve(root, relative);
  if (!file.startsWith(`${root}${sep}`)) throw new Error('invalid_release_path');
  return file;
};
const manifest = JSON.parse(readFileSync(join(releaseDir, 'manifest.json'), 'utf8'));
const resourcesBytes = readFileSync(safeJoin(releaseDir, manifest.resources.file));
if (contentChecksum(resourcesBytes) !== manifest.resources.checksum) throw new Error('resource_manifest_checksum_mismatch');
const datasets = new Map(manifest.banks.map((bank) => {
  const bytes = readFileSync(safeJoin(releaseDir, bank.file));
  if (contentChecksum(bytes) !== bank.checksum) throw new Error('bank_checksum_mismatch');
  return [bank.id, JSON.parse(bytes)];
}));
const completeRelease = prepareNativeContentRelease(manifest, JSON.parse(resourcesBytes), datasets, Number(process.env.NATIVE_CONTENT_VERSION));
const release = process.env.CONTENT_BANK_IDS
  ? selectNativeContentBanks(completeRelease, process.env.CONTENT_BANK_IDS.split(','))
  : completeRelease;
if (process.argv.includes('--validate')) {
  console.log(`native_content_valid version=${release.version} banks=${release.banks.length} resources=${release.files.length}`);
} else {
  for (const key of ['DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'RESOURCE_ROOT']) if (!process.env[key]) throw new Error(`missing_${key}`);
  const resourceRoot = resolve(process.env.RESOURCE_ROOT);
  const sql = postgres(process.env.DATABASE_URL, { max: 2, prepare: false });
  const storage = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { fetch: (url, init) => fetch(url, { ...init,
      signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(60_000)]) : AbortSignal.timeout(60_000),
    }) },
  }).storage.from('question-bank-assets');
  try {
    for (const bank of release.banks) {
      const [existing] = await sql`select checksum from question_bank_releases where bank_id = ${bank.id} and version = ${bank.version}`;
      assertImmutableRelease(existing, bank);
    }
    const existing = new Map((await sql`select object_key, checksum from resource_objects where storage_bucket = 'question-bank-assets'`).map((row) => [row.object_key, row.checksum]));
    let checkedResources = 0;
    for (const file of release.files) {
      if (existing.has(file.objectKey)) {
        if (existing.get(file.objectKey) !== file.checksum) throw new Error('resource_object_immutable');
        continue;
      }
      const bytes = readFileSync(safeJoin(resourceRoot, file.sourcePublicPath.slice('/question-bank-assets/'.length)));
      await ensureNativeContentResource(storage, file, bytes);
      checkedResources += 1;
      if (checkedResources % 100 === 0) console.log(`native_content_resources_verified count=${checkedResources}`);
    }
    let historyReset;
    await sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtext('app_content_publish'))`;
      if (process.env.RESET_LEARNING_HISTORY === '1') {
        if (release.banks.length !== 5) throw new Error('history_reset_requires_complete_release');
        const prior = await tx`select bank_id from question_bank_releases where version = ${release.version}`;
        // The complete release and reset commit atomically. Retrying an already
        // published release cannot clear new study work for a second time.
        if (prior.length !== 0 && prior.length !== release.banks.length) throw new Error('history_reset_partial_version');
        if (prior.length === 0) {
          historyReset = await resetLearningHistoryForContent(tx);
        }
      }
      const [appContent] = await tx`select payload from app_content_releases where active = true limit 1`;
      const opi = release.banks.find((bank) => bank.id === 'opi');
      if (appContent && opi) assertHotspotReferences(appContent.payload.hotspots, opi.payload);
      for (const bank of release.banks) {
        const [existing] = await tx`select checksum from question_bank_releases where bank_id = ${bank.id} and version = ${bank.version}`;
        assertImmutableRelease(existing, bank);
        await tx`update question_bank_releases set active = false where bank_id = ${bank.id} and active = true`;
        await tx`insert into question_bank_releases (bank_id, version, checksum, payload, active)
          values (${bank.id}, ${bank.version}, ${bank.checksum}, ${tx.json(bank.payload)}, true)
          on conflict (bank_id, version) do update set active = true`;
      }
      for (const file of release.files) {
        await tx`insert into resource_objects (object_key, module, storage_bucket, source_path, checksum, size_bytes, mime_type, status)
          values (${file.objectKey}, ${file.bankId}, 'question-bank-assets', ${file.publicPath}, ${file.checksum}, ${file.sizeBytes}, ${file.mimeType}, 'ready')
          on conflict (object_key) do nothing`;
      }
    });
    if (historyReset) console.log(`content_history_reset ${JSON.stringify(historyReset)}`);
    console.log(`native_content_import_ok version=${release.version} banks=${release.banks.length} resources=${release.files.length}`);
  } finally { await sql.end({ timeout: 5 }); }
}
