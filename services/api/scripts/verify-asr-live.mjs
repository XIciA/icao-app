import { createHmac, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';
import {
  cleanupTemporaryBusinessAccount,
  createTemporaryPhoneAuthUser,
  lifetimeBenefitAccountContext,
} from './live-verifier-account-fixture.mjs';

const apiBase = (process.env.API_BASE ?? 'http://127.0.0.1:3101').replace(/\/$/u, '');
const audioFile = process.env.AI_VERIFY_AUDIO_FILE
  ?? fileURLToPath(new URL('../test/fixtures/aviation-asr-live-sample.m4a', import.meta.url));
const audioMimeType = process.env.AI_VERIFY_AUDIO_MIME ?? 'audio/mp4';
const bucketName = process.env.AI_ASR_STAGING_BUCKET ?? 'ai-transcription-inputs';
const expectedModel = process.env.AI_VERIFY_ASR_MODEL ?? '16k_en';
const expectedWorkflow = 'tencent-asr:raw:v1';
const supabaseUrl = process.env.SUPABASE_URL;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const databaseUrl = process.env.DATABASE_URL;
const identitySecret = process.env.ACCOUNT_IDENTITY_HASH_SECRET;
const identityBenefitSecret = process.env.IDENTITY_BENEFIT_DIGEST_SECRET;
const REQUIRED_API_ORIGIN = 'https://api.readyoufife.com';
const REQUIRED_SUPABASE_ORIGIN = 'https://cloud.readyoufife.com';
const FETCH_TIMEOUT_MILLISECONDS = 45_000;
const STORAGE_PAGE_SIZE = 100;

function requireExactProductionOrigin(value, expectedOrigin, errorCode) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(errorCode);
  }
  if (
    parsed.origin !== expectedOrigin
    || parsed.pathname !== '/'
    || parsed.search
    || parsed.hash
    || parsed.username
    || parsed.password
  ) throw new Error(errorCode);
}

requireExactProductionOrigin(`${apiBase}/`, REQUIRED_API_ORIGIN, 'asr_live_requires_production_api_origin');
requireExactProductionOrigin(
  supabaseUrl ? `${supabaseUrl.replace(/\/+$/u, '')}/` : '',
  REQUIRED_SUPABASE_ORIGIN,
  'asr_live_requires_production_supabase_origin',
);

if (
  !supabaseUrl
  || !publishableKey
  || !secretKey
  || !databaseUrl
  || !identitySecret
  || !identityBenefitSecret
) {
  throw new Error('missing_live_verification_configuration');
}
if (!['audio/mp4', 'audio/m4a', 'audio/x-m4a'].includes(audioMimeType)) {
  throw new Error('live_verification_requires_m4a');
}

function fetchWithTimeout(input, init = {}) {
  const timeoutSignal = AbortSignal.timeout(FETCH_TIMEOUT_MILLISECONDS);
  const signal = init.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal;
  return fetch(input, { ...init, signal });
}

const options = {
  auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  global: { fetch: fetchWithTimeout },
};
const auth = createClient(supabaseUrl, publishableKey, options);
const admin = createClient(supabaseUrl, secretKey, options);
const database = postgres(databaseUrl, { prepare: false, max: 1 });
const password = `Icao-${randomBytes(18).toString('base64url')}!7`;
let phone;
let userId;
let verification;
let cleanupComplete = false;
let transcribeRequestId;
let transcribeAttempted = false;

function assert(value, message) {
  if (!value) throw new Error(`verification_failed:${message}`);
}

async function listStagedObjects() {
  const names = new Set();
  for (let offset = 0; ; offset += STORAGE_PAGE_SIZE) {
    const listed = await admin.storage.from(bucketName).list('', {
      limit: STORAGE_PAGE_SIZE,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    });
    if (listed.error) throw listed.error;
    const page = listed.data ?? [];
    for (const entry of page) names.add(entry.name);
    if (page.length < STORAGE_PAGE_SIZE) return names;
  }
}

function safeRequestId(value) {
  if (typeof value !== 'string') return undefined;
  const requestId = value.replace(/[^A-Za-z0-9_-]/gu, '').slice(0, 80);
  return requestId || undefined;
}

async function api(path, accessToken, init = {}, observeRequestId) {
  const headers = new Headers(init.headers);
  headers.set('accept', 'application/json');
  headers.set('authorization', `Bearer ${accessToken}`);
  if (init.body && !(init.body instanceof FormData)) headers.set('content-type', 'application/json');
  const response = await fetchWithTimeout(`${apiBase}${path}`, { ...init, headers });
  const body = await response.json().catch(() => undefined);
  const requestId = safeRequestId(body?.requestId);
  if (requestId) observeRequestId?.(requestId);
  if (!response.ok) throw new Error(`api_${response.status}:${body?.error?.code ?? 'unknown'}:${requestId ?? 'no_request_id'}`);
  assert(requestId, 'api_request_id_missing');
  return { data: body.data, requestId };
}

async function stagedObjectsForRequest(requestId) {
  const objects = await listStagedObjects();
  return [...objects].filter((name) => name.startsWith(`${requestId}-`));
}

async function removeStagedObjectsForRequest(requestId) {
  const objectNames = await stagedObjectsForRequest(requestId);
  if (objectNames.length > 0) {
    const removed = await admin.storage.from(bucketName).remove(objectNames);
    if (removed.error) throw removed.error;
  }
  const remains = await stagedObjectsForRequest(requestId);
  if (remains.length > 0) throw new Error('asr_cleanup_temporary_audio_remains');
}

try {
  const temporaryUser = await createTemporaryPhoneAuthUser({ admin, password });
  phone = temporaryUser.phone;
  userId = temporaryUser.authUserId;
  await database`
    insert into accounts (id, status)
    values (${userId}, 'active')
  `;
  await database`
    insert into account_identities (account_id, auth_user_id, provider, subject_hash)
    values (
      ${userId},
      ${userId},
      'phone',
      ${createHmac('sha256', identitySecret).update(`account-identity-v1\0phone\0${phone}`).digest('hex')}
    )
  `;

  const signedIn = await auth.auth.signInWithPassword({ phone, password });
  if (signedIn.error) throw signedIn.error;
  const token = signedIn.data.session?.access_token;
  assert(token, 'sign_in_failed');

  // The temporary supported phone session is intentionally pre-linked through
  // account_identities.auth_user_id; this validates business-account
  // resolution without sending SMS or pretending to exercise Apple OAuth.
  const me = await api('/v1/me', token);
  assert(me.data?.id === userId, 'business_account_resolution_failed');

  const consentChallenge = await api('/v1/ai/consent/challenge', token, {
    method: 'POST',
    body: JSON.stringify({
      flowRevision: 'native-explicit-consent-v1',
      policyVersion: 'ai-learning-privacy-v4',
    }),
  });
  await api('/v1/ai/consent', token, {
    method: 'POST',
    body: JSON.stringify({
      accepted: true,
      challenge: consentChallenge.data?.challenge,
      flowRevision: 'native-explicit-consent-v1',
      policyVersion: 'ai-learning-privacy-v4',
    }),
  });

  const audio = await readFile(audioFile);
  const form = new FormData();
  form.append('model', expectedModel);
  form.append('audio', new File([audio], basename(audioFile), { type: audioMimeType }));
  transcribeAttempted = true;
  const transcribeResponse = await api(
    '/v1/ai/transcribe',
    token,
    { method: 'POST', body: form },
    (requestId) => { transcribeRequestId = requestId; },
  );
  const result = transcribeResponse.data;
  transcribeRequestId = transcribeResponse.requestId;
  assert(typeof result.transcript === 'string' && result.transcript.trim().length > 0, 'empty_transcript');
  assert(
    JSON.stringify(Object.keys(result).sort()) === JSON.stringify(['aiPoints', 'transcript']),
    'public_contract_leaks_internal_fields',
  );
  assert(
    typeof result.aiPoints?.operationId === 'string'
      && result.aiPoints.operationId.length > 0
      && result.aiPoints.ruleVersion === 'ai-points-v1'
      && Number.isInteger(result.aiPoints.estimated)
      && result.aiPoints.estimated >= 0
      && Number.isInteger(result.aiPoints.charged)
      && result.aiPoints.charged >= 0
      && Number.isInteger(result.aiPoints.remaining)
      && result.aiPoints.remaining >= 0,
    'public_ai_points_contract_invalid',
  );

  const usage = await database`
    select attempt_count, failure_code, model, prompt_version, status, upstream_status
    from ai_usage_logs
    where user_id = ${userId} and capability = 'transcribe'
    order by created_at desc
    limit 1
  `;
  assert(usage.length === 1 && usage[0].status === 'success', 'usage_log_missing');
  assert(usage[0].model === expectedModel, 'unexpected_model');
  assert(usage[0].prompt_version === expectedWorkflow, 'unexpected_workflow_version');
  assert(usage[0].attempt_count >= 1, 'attempt_count_missing');
  assert(usage[0].failure_code === null, 'successful_usage_has_failure_code');
  assert(usage[0].upstream_status === 'success', 'successful_usage_upstream_status');

  const objectsAfter = await stagedObjectsForRequest(transcribeRequestId);
  assert(
    objectsAfter.length === 0,
    'temporary_audio_not_removed',
  );

  verification = {
    status: 'ok',
    model: expectedModel,
    workflow: expectedWorkflow,
    transcriptCharacters: result.transcript.length,
    temporaryAudioRemoved: true,
    publicContract: ['aiPoints', 'transcript'],
    requestObserved: true,
  };
} catch (error) {
  verification = { error };
}

const cleanupErrors = [];
try {
  if (transcribeRequestId) {
    await removeStagedObjectsForRequest(transcribeRequestId);
  } else if (transcribeAttempted) {
    cleanupErrors.push(new Error('asr_cleanup_request_id_unavailable'));
  }
} catch (error) {
  cleanupErrors.push(new Error('asr_cleanup_storage_verification_failed', { cause: error }));
}
cleanupErrors.push(...await cleanupTemporaryBusinessAccount({
  accountId: userId,
  admin,
  authUserId: userId,
  database,
  errorPrefix: 'asr',
  lifetimeClaimContextDigest: userId
    ? lifetimeBenefitAccountContext(userId, identityBenefitSecret)
    : undefined,
}));
try {
  await database.end({ timeout: 5 });
} catch (error) {
  cleanupErrors.push(new Error('asr_cleanup_database_close_failed', { cause: error }));
}
cleanupComplete = cleanupErrors.length === 0;

const verificationError = verification && 'error' in verification ? verification.error : undefined;
if (verificationError || cleanupErrors.length > 0) {
  throw new AggregateError(
    [...(verificationError ? [verificationError] : []), ...cleanupErrors],
    'asr_live_verification_failed',
  );
}

assert(verification, 'asr_verification_incomplete');
console.log(JSON.stringify({ ...verification, cleanupComplete }));
