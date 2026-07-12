import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';

import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';

const databaseUrl = process.env.DATABASE_URL;
const supabaseUrl = process.env.SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const releaseDir = resolve(process.env.RELEASE_DIR ?? '/release');
const audioRoot = resolve(process.env.AUDIO_ROOT ?? '/audio');
const bucket = 'question-bank-assets';

if (!databaseUrl) throw new Error('missing_DATABASE_URL');
if (!supabaseUrl) throw new Error('missing_SUPABASE_URL');
if (!secretKey) throw new Error('missing_SUPABASE_SECRET_KEY');

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const manifest = readJson(join(releaseDir, 'manifest.json'));
const resources = readJson(join(releaseDir, manifest.resources.file));
const database = postgres(databaseUrl, { max: 2, prepare: false });
const supabase = createClient(supabaseUrl, secretKey, { auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false } });

const existing = new Map((await database`select object_key, checksum from resource_objects`).map((row) => [row.object_key, row.checksum]));
const { data: existingBucket, error: bucketLookupError } = await supabase.storage.getBucket(bucket);
if (bucketLookupError && !/not found/i.test(bucketLookupError.message)) throw bucketLookupError;
if (!existingBucket) {
  const { error } = await supabase.storage.createBucket(bucket, { public: false, fileSizeLimit: 52_428_800 });
  if (error) throw error;
}

let uploaded = 0;
let skipped = 0;
const pending = resources.files.filter((file) => {
  if (existing.get(file.objectKey) === file.checksum) {
    skipped += 1;
    return false;
  }
  return true;
});

for (let index = 0; index < pending.length; index += 6) {
  const batch = pending.slice(index, index + 6);
  await Promise.all(batch.map(async (file) => {
    const sourceRelativePath = file.publicPath.replace(/^\/question-bank-assets\/audio\//, '');
    const bytes = readFileSync(join(audioRoot, sourceRelativePath));
    const checksum = createHash('sha256').update(bytes).digest('hex');
    if (checksum !== file.checksum) throw new Error(`source_checksum_mismatch:${file.objectKey}`);
    const { error } = await supabase.storage.from(bucket).upload(file.objectKey, bytes, { contentType: file.mimeType, upsert: false });
    if (error && !/already exists|duplicate/i.test(error.message)) throw new Error(`storage_upload_failed:${file.objectKey}:${error.message}`);
    uploaded += 1;
  }));
  if ((index + batch.length) % 120 === 0 || index + batch.length === pending.length) console.log(`resource_upload_progress ${index + batch.length}/${pending.length}`);
}

await database.begin(async (sql) => {
  for (const bank of manifest.banks) {
    const dataset = readJson(join(releaseDir, bank.file));
    await sql`update question_bank_releases set active = false where bank_id = ${bank.id} and version <> ${bank.version}`;
    await sql`
      insert into question_bank_releases (bank_id, version, checksum, payload, active)
      values (${bank.id}, ${bank.version}, ${bank.checksum}, ${sql.json(dataset)}, true)
      on conflict (bank_id, version) do update set checksum = excluded.checksum, payload = excluded.payload, active = true
    `;
  }
  for (const file of resources.files) {
    await sql`
      insert into resource_objects (object_key, module, source_path, checksum, size_bytes, mime_type, status)
      values (${file.objectKey}, ${file.bankId}, ${file.publicPath}, ${file.checksum}, ${file.sizeBytes}, ${file.mimeType}, ${file.status})
      on conflict (object_key) do update set module = excluded.module, source_path = excluded.source_path, checksum = excluded.checksum, size_bytes = excluded.size_bytes, mime_type = excluded.mime_type, status = excluded.status
    `;
  }
});

const [counts] = await database`select (select count(*)::int from question_bank_releases where active) as banks, (select count(*)::int from resource_objects where status = 'ready') as resources`;
await database.end({ timeout: 5 });
console.log(`content_import_ok banks=${counts.banks} resources=${counts.resources} uploaded=${uploaded} skipped=${skipped}`);
