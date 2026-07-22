import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { createClient } from '@supabase/supabase-js';

const ADAPTER_VERSION = 'fun-asr-eval:v1';
const manifestPath = resolve(requiredEnv('ASR_EVAL_MANIFEST'));
const outputPath = resolve(requiredEnv('ASR_EVAL_OUTPUT'));
const concurrency = integerEnv('ASR_EVAL_CONCURRENCY', 3, 1, 6);
const retryFailed = process.argv.includes('--retry-failed');
const mode = process.env.ASR_EVAL_HOTWORD_MODE ?? 'none';
const model = process.env.AI_ASR_MODEL ?? 'fun-asr-2025-11-07';
const apiKey = requiredEnv('DASHSCOPE_API_KEY');
const asrBaseUrl = (process.env.DASHSCOPE_ASR_BASE_URL ?? 'https://dashscope.aliyuncs.com/api/v1').replace(/\/+$/, '');
const supabaseUrl = requiredEnv('SUPABASE_URL');
const supabasePublicUrl = requiredEnv('SUPABASE_PUBLIC_URL');
const supabaseSecretKey = requiredEnv('SUPABASE_SECRET_KEY');
const productionVocabularyId = process.env.AI_ASR_VOCABULARY_ID;
const evaluationVocabularyId = process.env.ASR_EVAL_VOCABULARY_ID;

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`missing_${name}`);
  return value;
}

function integerEnv(name, fallback, minimum, maximum) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < minimum || value > maximum) throw new Error(`invalid_${name}`);
  return value;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function writeJsonAtomic(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.next`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, path);
}

function hotwordIdentity(manifest) {
  if (mode === 'none') return { mode: 'none' };
  if (mode === 'configured') {
    if (!productionVocabularyId) throw new Error('missing_AI_ASR_VOCABULARY_ID');
    return {
      mode,
      assetVersion: manifest.run.hotwords.assetVersion,
      assetSha256: manifest.run.hotwords.assetSha256,
      providerVocabularySha256: manifest.run.hotwords.providerVocabularySha256,
    };
  }
  if (mode === 'candidate') {
    if (!evaluationVocabularyId) throw new Error('missing_ASR_EVAL_VOCABULARY_ID');
    if (evaluationVocabularyId === productionVocabularyId) throw new Error('evaluation_vocabulary_must_be_isolated');
    return {
      mode,
      assetVersion: manifest.run.hotwords.assetVersion,
      assetSha256: manifest.run.hotwords.assetSha256,
      providerVocabularySha256: manifest.run.hotwords.providerVocabularySha256,
    };
  }
  throw new Error(`invalid_ASR_EVAL_HOTWORD_MODE:${mode}`);
}

function vocabularyIdForMode() {
  if (mode === 'none') return undefined;
  if (mode === 'configured') return productionVocabularyId;
  return evaluationVocabularyId;
}

async function requestJson(url, init, timeoutMs = 20_000) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`asr_http_${response.status}`);
  return payload;
}

async function transcribeUrl(fileUrl, vocabularyId) {
  const parameters = {
    channel_id: [0],
    diarization_enabled: false,
    language_hints: ['en'],
  };
  if (vocabularyId) parameters.vocabulary_id = vocabularyId;
  const submitted = await requestJson(`${asrBaseUrl}/services/audio/asr/transcription`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-DashScope-Async': 'enable',
    },
    body: JSON.stringify({ model, input: { file_urls: [fileUrl] }, parameters }),
  });
  const taskId = submitted.output?.task_id;
  if (!taskId || submitted.output?.task_status !== 'PENDING') throw new Error('asr_invalid_submit_response');

  const deadline = Date.now() + 120_000;
  for (;;) {
    if (Date.now() >= deadline) throw new Error('asr_timeout');
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 2_000));
    const polled = await requestJson(`${asrBaseUrl}/tasks/${encodeURIComponent(taskId)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const status = polled.output?.task_status;
    if (status === 'SUCCEEDED') {
      const result = polled.output?.results?.[0];
      if (result?.subtask_status !== 'SUCCEEDED' || !result.transcription_url) throw new Error(`asr_subtask_failed:${result?.code ?? 'unknown'}`);
      const transcription = await requestJson(result.transcription_url, {}, 20_000);
      const rawTranscript = (transcription.transcripts ?? [])
        .map((entry) => entry.text?.trim())
        .filter(Boolean)
        .join('\n')
        .trim();
      if (!rawTranscript) throw new Error('asr_empty_transcript');
      return { rawTranscript, durationSeconds: polled.usage?.duration ?? null };
    }
    if (['FAILED', 'CANCELED', 'UNKNOWN'].includes(status)) {
      const code = polled.output?.code ?? polled.output?.results?.[0]?.code ?? 'unknown';
      throw new Error(code === 'ASR_RESPONSE_HAVE_NO_WORDS' ? 'no_speech_detected' : `asr_task_failed:${code}`);
    }
    if (!['PENDING', 'RUNNING'].includes(status)) throw new Error('asr_invalid_poll_response');
  }
}

const manifest = await readJson(manifestPath);
if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.samples) || !manifest.run) throw new Error('invalid_asr_eval_manifest');
if (manifest.run.model !== model) throw new Error(`asr_eval_model_mismatch:${manifest.run.model}:${model}`);
const identity = hotwordIdentity(manifest);
const callLimit = manifest.run.callLimit;
if (!Number.isInteger(callLimit) || callLimit < 1 || callLimit > 1_000) throw new Error('invalid_asr_eval_call_limit');

let output;
try {
  output = await readJson(outputPath);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  output = {
    schemaVersion: 1,
    adapterVersion: ADAPTER_VERSION,
    runId: manifest.run.id,
    model,
    hotwords: identity,
    attempts: [],
    results: {},
  };
}
if (output.adapterVersion !== ADAPTER_VERSION || output.runId !== manifest.run.id
  || output.model !== model || canonical(output.hotwords) !== canonical(identity)) {
  throw new Error('asr_eval_output_identity_mismatch');
}
if (output.attempts.some((attempt) => attempt.status === 'submitting')) throw new Error('asr_eval_uncertain_previous_attempt');

const cacheKeyFor = (sample) => sha256(canonical({
  adapterVersion: ADAPTER_VERSION,
  model,
  audioSha256: sample.audio.checksum,
  parameters: { channelId: [0], diarizationEnabled: false, languageHints: ['en'] },
  hotwords: identity,
}));
const pending = manifest.samples.filter((sample) => {
  const result = output.results[sample.id];
  if (result?.cacheKey === cacheKeyFor(sample) && result.status === 'success') return false;
  if (result?.status === 'failed' && !retryFailed) return false;
  return true;
});
if (output.attempts.length + pending.length > callLimit) {
  throw new Error(`asr_eval_call_limit_exceeded:${output.attempts.length}:${pending.length}:${callLimit}`);
}

const storage = createClient(supabaseUrl, supabaseSecretKey, {
  auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
});
const vocabularyId = vocabularyIdForMode();

async function runSample(sample) {
  const signed = await storage.storage.from('question-bank-assets').createSignedUrl(sample.audio.objectKey, 600);
  if (signed.error || !signed.data?.signedUrl) throw new Error('question_bank_audio_signing_failed');
  const fileUrl = signed.data.signedUrl.replace(supabaseUrl.replace(/\/+$/, ''), supabasePublicUrl.replace(/\/+$/, ''));
  return transcribeUrl(fileUrl, vocabularyId);
}

for (let index = 0; index < pending.length; index += concurrency) {
  const batch = pending.slice(index, index + concurrency);
  const batchAttempts = batch.map((sample) => ({
    id: `${manifest.run.id}:${sample.id}:${output.attempts.length + 1}`,
    sampleId: sample.id,
    status: 'submitting',
    startedAt: new Date().toISOString(),
  }));
  output.attempts.push(...batchAttempts);
  await writeJsonAtomic(outputPath, output);
  const results = await Promise.allSettled(batch.map(runSample));
  for (let offset = 0; offset < batch.length; offset += 1) {
    const sample = batch[offset];
    const attempt = batchAttempts[offset];
    const result = results[offset];
    attempt.finishedAt = new Date().toISOString();
    if (result.status === 'fulfilled') {
      attempt.status = 'success';
      output.results[sample.id] = {
        status: 'success',
        cacheKey: cacheKeyFor(sample),
        rawTranscript: result.value.rawTranscript,
        providerDurationSeconds: result.value.durationSeconds,
        transcribedAt: attempt.finishedAt,
      };
    } else {
      attempt.status = 'failed';
      attempt.error = result.reason instanceof Error ? result.reason.message : 'unknown_error';
      output.results[sample.id] = {
        status: 'failed',
        cacheKey: cacheKeyFor(sample),
        error: attempt.error,
        transcribedAt: attempt.finishedAt,
      };
    }
  }
  await writeJsonAtomic(outputPath, output);
  process.stdout.write(`asr_eval_progress run=${manifest.run.id} completed=${Math.min(index + batch.length, pending.length)}/${pending.length} calls=${output.attempts.length}/${callLimit}\n`);
}

const successes = Object.values(output.results).filter((result) => result.status === 'success').length;
const failures = Object.values(output.results).filter((result) => result.status === 'failed').length;
process.stdout.write(`asr_eval_complete run=${manifest.run.id} successes=${successes} failures=${failures} calls=${output.attempts.length}\n`);
