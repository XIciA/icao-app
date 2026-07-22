import { createHash } from 'node:crypto';
import { chmod, readFile, writeFile } from 'node:fs/promises';

const command = process.argv[2];
const apiKey = requiredEnv('DASHSCOPE_API_KEY');
const outputPath = requiredEnv('ASR_VOCABULARY_OUTPUT');
const asrBaseUrl = (process.env.DASHSCOPE_ASR_BASE_URL
  ?? process.env.DASHSCOPE_BASE_URL?.replace(/\/compatible-mode\/v1\/?$/, '/api/v1')
  ?? 'https://dashscope.aliyuncs.com/api/v1').replace(/\/+$/, '');
const endpoint = `${asrBaseUrl}/services/audio/asr/customization`;

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`missing_${name}`);
  return value;
}

function canonicalEntries(entries) {
  return [...entries]
    .map((entry) => ({ text: String(entry.text), weight: Number(entry.weight), lang: String(entry.lang ?? 'en') }))
    .sort((left, right) => left.text.toLocaleLowerCase().localeCompare(right.text.toLocaleLowerCase()));
}

function entriesSha256(entries) {
  return createHash('sha256').update(JSON.stringify(canonicalEntries(entries))).digest('hex');
}

async function request(input) {
  const response = await fetch(endpoint, {
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
  return payload.output;
}

async function query(vocabularyId) {
  return request({ action: 'query_vocabulary', vocabulary_id: vocabularyId });
}

async function waitReady(vocabularyId) {
  let details;
  for (let attempt = 0; attempt < 15; attempt += 1) {
    details = await query(vocabularyId);
    if (details?.status === 'OK') return details;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 1_000));
  }
  throw new Error(`asr_vocabulary_not_ready:${details?.status ?? 'unknown'}`);
}

async function writeProtected(value) {
  await writeFile(outputPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await chmod(outputPath, 0o600);
}

if (command === 'query-production') {
  const vocabularyId = requiredEnv('AI_ASR_VOCABULARY_ID');
  const details = await waitReady(vocabularyId);
  const entries = canonicalEntries(details.vocabulary ?? []);
  await writeProtected({
    schemaVersion: 1,
    environment: 'production',
    status: 'verified',
    model: details.target_model,
    hotwordsVersion: requiredEnv('AI_ASR_HOTWORDS_VERSION'),
    verifiedAt: new Date().toISOString(),
    providerEntriesSha256: entriesSha256(entries),
    entries,
  });
  process.stdout.write(`asr_production_vocabulary_verified model=${details.target_model} version=${process.env.AI_ASR_HOTWORDS_VERSION} entries=${entries.length}\n`);
} else if (command === 'prepare-evaluation' || command === 'prepare-production') {
  const assetPath = requiredEnv('ASR_HOTWORDS_ASSET');
  const assetRaw = await readFile(assetPath);
  const asset = JSON.parse(assetRaw.toString('utf8'));
  if (asset.targetModel !== 'fun-asr-2025-11-07' || asset.language !== 'en' || !Array.isArray(asset.entries) || asset.entries.length === 0) {
    throw new Error('invalid_nonempty_asr_hotword_asset');
  }
  const vocabulary = canonicalEntries(asset.entries.map((entry) => ({ ...entry, lang: asset.language })));
  const productionVocabularyId = process.env.AI_ASR_VOCABULARY_ID;
  const prefix = command === 'prepare-evaluation' ? 'icaoeval' : 'icaoasr';
  const created = await request({
    action: 'create_vocabulary',
    target_model: asset.targetModel,
    prefix,
    vocabulary,
  });
  const vocabularyId = created?.vocabulary_id;
  if (!vocabularyId || vocabularyId === productionVocabularyId) throw new Error('asr_isolated_vocabulary_creation_failed');
  const details = await waitReady(vocabularyId);
  const deployed = canonicalEntries(details.vocabulary ?? []);
  if (details.target_model !== asset.targetModel || entriesSha256(deployed) !== entriesSha256(vocabulary)) {
    throw new Error('asr_vocabulary_exact_content_mismatch');
  }
  await writeProtected({
    schemaVersion: 1,
    purpose: command === 'prepare-evaluation' ? 'evaluation' : 'production-candidate',
    vocabularyId,
    model: details.target_model,
    hotwordsVersion: asset.version,
    assetSha256: createHash('sha256').update(assetRaw).digest('hex'),
    providerEntriesSha256: entriesSha256(deployed),
    entryCount: deployed.length,
    verifiedAt: new Date().toISOString(),
  });
  process.stdout.write(`asr_isolated_vocabulary_ready purpose=${command === 'prepare-evaluation' ? 'evaluation' : 'production-candidate'} model=${details.target_model} version=${asset.version} entries=${deployed.length}\n`);
} else {
  throw new Error(`unsupported_command:${command ?? ''}`);
}
