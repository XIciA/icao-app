import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';

const apiBase = process.env.API_BASE ?? 'http://127.0.0.1:3101';
const audioFile = process.env.AI_VERIFY_AUDIO_FILE ?? '/tmp/icao-asr-sample.mp3';
const audioMimeType = process.env.AI_VERIFY_AUDIO_MIME ?? 'audio/mpeg';
const bucketName = process.env.AI_ASR_STAGING_BUCKET ?? 'ai-transcription-inputs';
const expectedModel = process.env.AI_ASR_MODEL ?? 'fun-asr-2025-11-07';
const expectedHotwords = process.env.AI_ASR_HOTWORDS_VERSION ?? 'aviation-hotwords:v1';
const expectedNormalization = 'aviation-normalization:v7';
const supabaseUrl = process.env.SUPABASE_URL;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const databaseUrl = process.env.DATABASE_URL;

if (!supabaseUrl || !publishableKey || !secretKey || !databaseUrl) {
  throw new Error('missing_live_verification_configuration');
}

const options = { auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false } };
const auth = createClient(supabaseUrl, publishableKey, options);
const admin = createClient(supabaseUrl, secretKey, options);
const database = postgres(databaseUrl, { prepare: false, max: 1 });
const suffix = `${Date.now()}-${randomBytes(4).toString('hex')}`;
const email = `asr-verify-${suffix}@example.test`;
const password = `Icao-${randomBytes(18).toString('base64url')}!7`;
let userId;

function assert(value, message) {
  if (!value) throw new Error(`verification_failed:${message}`);
}

async function listStagedObjects() {
  const listed = await admin.storage.from(bucketName).list('', { limit: 100 });
  if (listed.error) throw listed.error;
  return new Set((listed.data ?? []).map((entry) => entry.name));
}

async function api(path, accessToken, init = {}) {
  const headers = new Headers(init.headers);
  headers.set('accept', 'application/json');
  headers.set('authorization', `Bearer ${accessToken}`);
  if (init.body && !(init.body instanceof FormData)) headers.set('content-type', 'application/json');
  const response = await fetch(`${apiBase}${path}`, { ...init, headers });
  const body = await response.json();
  if (!response.ok) throw new Error(`api_${response.status}:${body?.error?.code ?? 'unknown'}`);
  return body.data;
}

try {
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  assert(created.data.user?.id, 'create_user_failed');
  userId = created.data.user.id;

  const signedIn = await auth.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw signedIn.error;
  const token = signedIn.data.session?.access_token;
  assert(token, 'sign_in_failed');

  await api('/v1/ai/consent', token, {
    method: 'POST',
    body: JSON.stringify({ accepted: true, policyVersion: 'ai-learning-privacy-v1' }),
  });

  const objectsBefore = await listStagedObjects();
  const audio = await readFile(audioFile);
  const form = new FormData();
  form.append('audio', new File([audio], basename(audioFile), { type: audioMimeType }));
  const result = await api('/v1/ai/transcribe', token, { method: 'POST', body: form });
  assert(typeof result.transcript === 'string' && result.transcript.trim().length > 0, 'empty_transcript');
  assert(JSON.stringify(Object.keys(result).sort()) === JSON.stringify(['transcript']), 'public_contract_leaks_internal_fields');

  const usage = await database`
    select model, prompt_version, status
    from ai_usage_logs
    where user_id = ${userId} and capability = 'transcribe'
    order by created_at desc
    limit 1
  `;
  assert(usage.length === 1 && usage[0].status === 'success', 'usage_log_missing');
  assert(usage[0].model === expectedModel, 'unexpected_model');
  assert(usage[0].prompt_version === `${expectedHotwords}+${expectedNormalization}`, 'unexpected_workflow_version');

  const objectsAfter = await listStagedObjects();
  assert([...objectsAfter].every((name) => objectsBefore.has(name)), 'temporary_audio_not_removed');

  console.log(JSON.stringify({
    status: 'ok',
    model: expectedModel,
    hotwords: expectedHotwords,
    normalization: expectedNormalization,
    transcriptCharacters: result.transcript.length,
    temporaryAudioRemoved: true,
    publicContract: ['transcript'],
  }));
} finally {
  if (userId) {
    const deletion = await admin.auth.admin.deleteUser(userId);
    if (deletion.error) throw deletion.error;
  }
  await database.end({ timeout: 5 });
}
