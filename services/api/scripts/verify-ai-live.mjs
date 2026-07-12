import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';

const apiBase = process.env.API_BASE ?? 'http://api:3101';
const supabaseUrl = process.env.SUPABASE_URL;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const databaseUrl = process.env.DATABASE_URL;
const audioFile = process.env.AI_VERIFY_AUDIO_FILE ?? '/tmp/icao-ai-sample.mp3';
if (!supabaseUrl || !publishableKey || !secretKey || !databaseUrl) throw new Error('missing_live_verification_configuration');

const options = { auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false } };
const auth = createClient(supabaseUrl, publishableKey, options);
const admin = createClient(supabaseUrl, secretKey, options);
const database = postgres(databaseUrl, { prepare: false, max: 1 });
const suffix = `${Date.now()}-${randomBytes(4).toString('hex')}`;
const email = `phase2b-${suffix}@example.test`;
const password = `Icao-${randomBytes(18).toString('base64url')}!7`;
let userId;

function assert(value, message) {
  if (!value) throw new Error(`verification_failed:${message}`);
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
  const signup = await auth.auth.signUp({ email, password });
  if (signup.error) throw signup.error;
  assert(signup.data.session && signup.data.user?.id, 'signup_failed');
  userId = signup.data.user.id;
  const token = signup.data.session.access_token;

  await api('/v1/ai/consent', token, { method: 'POST', body: JSON.stringify({ accepted: true, policyVersion: 'ai-learning-privacy-v1' }) });
  const lookupInput = { module: 'sentence900', questionId: 'verify-900', word: 'cleared', sentence: 'You are cleared for takeoff runway two seven.' };
  const lookup = await api('/v1/ai/word-lookup', token, { method: 'POST', body: JSON.stringify(lookupInput) });
  assert(lookup.definition && lookup.sentenceMeaning && lookup.cached === false, 'word_lookup_invalid');
  const cached = await api('/v1/ai/word-lookup', token, { method: 'POST', body: JSON.stringify(lookupInput) });
  assert(cached.cached === true, 'word_lookup_cache_miss');

  const audio = await readFile(audioFile);
  const form = new FormData();
  form.append('audio', new File([audio], 'sample.mp3', { type: 'audio/mpeg' }));
  const transcript = await api('/v1/ai/transcribe', token, { method: 'POST', body: form });
  assert(transcript.rawTranscript && transcript.transcript && transcript.hintsVersion === 'transcribe-hints-v1', 'transcribe_invalid');

  const grammarInput = { module: 'atc', questionId: 'verify-atc', questionText: 'Report established on the localizer.', transcript: 'We is established on localizer.' };
  const grammar = await api('/v1/ai/grammar-review', token, { method: 'POST', body: JSON.stringify(grammarInput) });
  assert(grammar.correctedText && grammar.overallFeedbackZh && Array.isArray(grammar.issues), 'grammar_invalid');

  const standalonePolish = await api('/v1/ai/polish', token, { method: 'POST', body: JSON.stringify({ module: 'opi', questionId: 'verify-polish', questionText: 'Describe your response to turbulence.', transcript: 'I will slow down and tell ATC.', correctedText: 'I will slow down and inform ATC.' }) });
  assert(standalonePolish.polishedText && standalonePolish.promptVersion === 'polish-v1', 'standalone_polish_invalid');

  const opiInput = { module: 'opi', questionId: 'verify-opi', questionText: 'What would you do if you encountered severe turbulence?', transcript: 'If I meet severe turbulence, I will slow down and tell ATC.' };
  const opi = await api('/v1/ai/opi-analysis', token, { method: 'POST', body: JSON.stringify(opiInput) });
  assert(opi.grammar?.correctedText && opi.polishedText, 'opi_invalid');

  const usage = await database`select capability, status, quota_units from ai_usage_logs where user_id = ${userId} order by created_at`;
  assert(usage.length === 6, 'usage_log_count');
  assert(usage.every((row) => row.status === 'success'), 'usage_log_status');
  assert(new Set(usage.map((row) => row.capability)).size === 4, 'usage_log_capabilities');
  const quota = await database`select used_units from ai_quota_buckets where user_id = ${userId}`;
  assert(quota[0]?.used_units === 12, 'quota_total_or_cached_lookup_charge');

  console.log(JSON.stringify({ wordLookup: 'real-ok', cacheWithoutCharge: 'ok', transcribe: 'real-ok', grammar: 'real-ok', standalonePolish: 'real-ok', opiGrammarAndPolish: 'real-ok', usageLogs: usage.length, quotaUnits: quota[0].used_units }));
} finally {
  if (userId) {
    const deletion = await admin.auth.admin.deleteUser(userId);
    if (deletion.error) throw deletion.error;
  }
  await database.end({ timeout: 5 });
}
