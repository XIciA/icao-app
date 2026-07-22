import { createHash } from 'node:crypto';
import { chmod, readFile, writeFile } from 'node:fs/promises';

const assetPath = process.env.ASR_HOTWORDS_ASSET;
const resultPath = process.env.ASR_SYNC_RESULT_PATH;
const apiKey = process.env.DASHSCOPE_API_KEY;
const supabaseUrl = process.env.SUPABASE_PUBLIC_URL ?? process.env.SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
const vocabularyPrefix = 'icaoasr';
const bucket = 'ai-transcription-inputs';

if (!assetPath) throw new Error('missing_ASR_HOTWORDS_ASSET');
if (!resultPath) throw new Error('missing_ASR_SYNC_RESULT_PATH');
if (!apiKey) throw new Error('missing_DASHSCOPE_API_KEY');
if (!supabaseUrl || !supabaseSecretKey) throw new Error('missing_supabase_storage_configuration');

const rawAsset = await readFile(assetPath);
const asset = JSON.parse(rawAsset.toString('utf8'));
if (asset.targetModel !== 'fun-asr-2025-11-07' || asset.language !== 'en' || !Array.isArray(asset.entries)) {
  throw new Error('invalid_asr_hotword_asset');
}

const asrBaseUrl = (process.env.DASHSCOPE_ASR_BASE_URL
  ?? process.env.DASHSCOPE_BASE_URL?.replace(/\/compatible-mode\/v1\/?$/, '/api/v1')
  ?? 'https://dashscope.aliyuncs.com/api/v1').replace(/\/+$/, '');
const vocabularyEndpoint = `${asrBaseUrl}/services/audio/asr/customization`;
const vocabulary = asset.entries.map(({ text, weight }) => ({ text, weight, lang: asset.language }));

async function vocabularyRequest(input) {
  const response = await fetch(vocabularyEndpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'speech-biasing', input }),
    signal: AbortSignal.timeout(20_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.code || payload?.error) {
    const code = payload?.code ?? payload?.error?.code ?? `http_${response.status}`;
    throw new Error(`asr_vocabulary_request_failed:${code}`);
  }
  return payload;
}

async function queryVocabulary(vocabularyId) {
  const payload = await vocabularyRequest({ action: 'query_vocabulary', vocabulary_id: vocabularyId });
  return payload.output;
}

async function findVocabulary() {
  if (process.env.AI_ASR_VOCABULARY_ID) {
    const current = await queryVocabulary(process.env.AI_ASR_VOCABULARY_ID);
    if (current?.target_model !== asset.targetModel) throw new Error('asr_vocabulary_model_mismatch');
    return process.env.AI_ASR_VOCABULARY_ID;
  }
  const listed = await vocabularyRequest({ action: 'list_vocabulary', prefix: vocabularyPrefix, page_index: 0, page_size: 10 });
  const candidates = listed.output?.vocabulary_list ?? [];
  const matching = [];
  for (const candidate of candidates) {
    const details = await queryVocabulary(candidate.vocabulary_id);
    if (details?.target_model === asset.targetModel) matching.push({ ...candidate, details });
  }
  matching.sort((a, b) => String(b.gmt_modified ?? '').localeCompare(String(a.gmt_modified ?? '')));
  return matching[0]?.vocabulary_id;
}

let vocabularyId = await findVocabulary();
if (vocabularyId) {
  await vocabularyRequest({ action: 'update_vocabulary', vocabulary_id: vocabularyId, vocabulary });
} else {
  const created = await vocabularyRequest({
    action: 'create_vocabulary',
    target_model: asset.targetModel,
    prefix: vocabularyPrefix,
    vocabulary,
  });
  vocabularyId = created.output?.vocabulary_id;
  if (!vocabularyId) throw new Error('asr_vocabulary_id_missing');
}

let deployed;
for (let attempt = 0; attempt < 10; attempt += 1) {
  deployed = await queryVocabulary(vocabularyId);
  if (deployed?.status === 'OK') break;
  await new Promise((resolve) => setTimeout(resolve, 1_000));
}
if (deployed?.status !== 'OK') throw new Error('asr_vocabulary_not_ready');
if (deployed.target_model !== asset.targetModel) throw new Error('asr_vocabulary_model_mismatch');
const deployedEntries = deployed.vocabulary ?? [];
if (deployedEntries.length !== vocabulary.length) throw new Error('asr_vocabulary_entry_count_mismatch');

const storageBaseUrl = supabaseUrl.replace(/\/+$/, '');
const storageHeaders = {
  apikey: supabaseSecretKey,
  Authorization: `Bearer ${supabaseSecretKey}`,
  'Content-Type': 'application/json',
};
const existingBucket = await fetch(`${storageBaseUrl}/storage/v1/bucket/${bucket}`, {
  headers: storageHeaders,
  signal: AbortSignal.timeout(15_000),
});
const existingBucketBody = await existingBucket.json().catch(() => ({}));
const bucketMissing = existingBucket.status === 404
  || (existingBucket.status === 400 && /bucket\s+not\s+found|no\s+such\s+bucket/i.test(String(existingBucketBody.message ?? existingBucketBody.error ?? '')));
if (bucketMissing) {
  const createdBucket = await fetch(`${storageBaseUrl}/storage/v1/bucket`, {
    method: 'POST',
    headers: storageHeaders,
    body: JSON.stringify({
      id: bucket,
      name: bucket,
      public: false,
      file_size_limit: 8 * 1024 * 1024,
      allowed_mime_types: ['audio/aac', 'audio/m4a', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm', 'audio/x-m4a'],
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!createdBucket.ok) throw new Error(`asr_bucket_create_failed:http_${createdBucket.status}`);
} else if (!existingBucket.ok) {
  const code = existingBucketBody.code ?? existingBucketBody.error ?? `http_${existingBucket.status}`;
  throw new Error(`asr_bucket_query_failed:${String(code).replace(/\s+/g, '_')}`);
} else {
  if (existingBucketBody.public) throw new Error('asr_bucket_must_be_private');
}

const result = {
  model: asset.targetModel,
  vocabularyId,
  hotwordsVersion: asset.version,
  hotwordsSha256: createHash('sha256').update(rawAsset).digest('hex'),
  hotwordCount: vocabulary.length,
  asrBaseUrl,
  bucket,
};
await writeFile(resultPath, `${JSON.stringify(result)}\n`, { mode: 0o600 });
await chmod(resultPath, 0o600);
console.log(`asr_cloud_ready model=${result.model} hotwords=${result.hotwordCount} version=${result.hotwordsVersion} vocabulary=${vocabularyId.slice(0, 12)}... bucket=${bucket}`);
