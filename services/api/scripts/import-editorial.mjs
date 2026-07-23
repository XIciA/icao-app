import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';

const databaseUrl = process.env.DATABASE_URL;
const supabaseUrl = process.env.SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const releaseDir = resolve(process.env.RELEASE_DIR ?? '/editorial-release');
const bucket = 'editorial-assets';

if (!databaseUrl) throw new Error('missing_DATABASE_URL');
if (!supabaseUrl) throw new Error('missing_SUPABASE_URL');
if (!secretKey) throw new Error('missing_SUPABASE_SECRET_KEY');

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const checksum = (bytes) => createHash('sha256').update(bytes).digest('hex');
const manifest = readJson(join(releaseDir, 'manifest.json'));
const releaseBytes = readFileSync(join(releaseDir, manifest.releaseFile));
const release = JSON.parse(releaseBytes);

if (checksum(releaseBytes) !== manifest.checksum) throw new Error('editorial_release_checksum_mismatch');
if (release.schemaVersion !== 1 || release.version !== manifest.version) throw new Error('editorial_release_invalid');
if (manifest.publicationGate?.approved !== true) throw new Error('editorial_preview_not_approved');
for (const article of manifest.publicationGate.articles ?? []) {
  if (!['preview_approved', 'published'].includes(article.state) || !article.previewApprovedAt) {
    throw new Error(`editorial_preview_not_approved:${article.slug}`);
  }
}

const database = postgres(databaseUrl, { max: 2, prepare: false });
const supabase = createClient(supabaseUrl, secretKey, {
  auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
});
const { data: existingBucket, error: bucketLookupError } = await supabase.storage.getBucket(bucket);
if (bucketLookupError && !/not found/i.test(bucketLookupError.message)) throw bucketLookupError;
if (!existingBucket) {
  const { error } = await supabase.storage.createBucket(bucket, { public: false, fileSizeLimit: 10_485_760 });
  if (error) throw error;
}

const [existingRelease] = await database`
  select checksum from editorial_releases where version = ${manifest.version}
`;
if (existingRelease && existingRelease.checksum !== manifest.checksum) {
  throw new Error(`editorial_release_version_immutable:${manifest.version}`);
}

for (const asset of manifest.assets) {
  const bytes = readFileSync(join(releaseDir, asset.file));
  if (checksum(bytes) !== asset.checksum) throw new Error(`editorial_asset_checksum_mismatch:${asset.publicPath}`);
  const { error } = await supabase.storage.from(bucket).upload(asset.objectKey, bytes, {
    contentType: asset.mimeType,
    upsert: false,
  });
  if (error && !/already exists|duplicate/i.test(error.message)) {
    throw new Error(`editorial_asset_upload_failed:${asset.publicPath}:${error.message}`);
  }
}

await database.begin(async (sql) => {
  await sql`update editorial_releases set active = false where active = true and version <> ${manifest.version}`;
  await sql`
    insert into editorial_releases (version, checksum, payload, active)
    values (${manifest.version}, ${manifest.checksum}, ${sql.json(release)}, true)
    on conflict (version) do nothing
  `;
  await sql`
    update editorial_releases
    set active = true
    where version = ${manifest.version} and checksum = ${manifest.checksum}
  `;
  for (const asset of manifest.assets) {
    await sql`
      insert into resource_objects (object_key, module, storage_bucket, source_path, checksum, size_bytes, mime_type, status)
      values (${asset.objectKey}, ${`editorial:${asset.articleSlug}`}, ${bucket}, ${asset.publicPath}, ${asset.checksum}, ${asset.sizeBytes}, ${asset.mimeType}, 'ready')
      on conflict (object_key) do update
        set module = excluded.module,
            storage_bucket = excluded.storage_bucket,
            source_path = excluded.source_path,
            checksum = excluded.checksum,
            size_bytes = excluded.size_bytes,
            mime_type = excluded.mime_type,
            status = excluded.status
    `;
    await sql`
      update resource_objects
      set status = 'superseded'
      where module = ${`editorial:${asset.articleSlug}`}
        and storage_bucket = ${bucket}
        and source_path = ${asset.publicPath}
        and object_key <> ${asset.objectKey}
    `;
  }
});

const [active] = await database`select version, checksum from editorial_releases where active = true`;
await database.end({ timeout: 5 });
console.log(`editorial_import_ok version=${active.version} checksum=${active.checksum} assets=${manifest.assets.length}`);
