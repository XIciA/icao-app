import { createHmac, randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';
import {
  cleanupTemporaryBusinessAccount,
  createTemporaryPhoneAuthUser,
} from './live-verifier-account-fixture.mjs';

const apiBase = (process.env.API_BASE ?? 'http://127.0.0.1:3101').replace(/\/$/u, '');
const supabaseUrl = process.env.SUPABASE_URL;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const databaseUrl = process.env.DATABASE_URL;
const identitySecret = process.env.ACCOUNT_IDENTITY_HASH_SECRET;
const REQUIRED_API_ORIGIN = 'https://api.readyoufife.com';
const REQUIRED_SUPABASE_ORIGIN = 'https://cloud.readyoufife.com';
const FETCH_TIMEOUT_MILLISECONDS = 45_000;

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

requireExactProductionOrigin(`${apiBase}/`, REQUIRED_API_ORIGIN, 'review_live_requires_production_api_origin');
requireExactProductionOrigin(
  supabaseUrl ? `${supabaseUrl.replace(/\/+$/u, '')}/` : '',
  REQUIRED_SUPABASE_ORIGIN,
  'review_live_requires_production_supabase_origin',
);

if (!supabaseUrl || !publishableKey || !secretKey || !databaseUrl || !identitySecret) {
  throw new Error('missing_live_verification_configuration');
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
let authUserId;
let accountId;
let verification;
let cleanupComplete = false;

function assert(value, message) {
  if (!value) throw new Error(`verification_failed:${message}`);
}

async function api(path, accessToken, init = {}) {
  const response = await fetchWithTimeout(`${apiBase}${path}`, {
    ...init,
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${accessToken}`,
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  const body = await response.json().catch(() => undefined);
  if (!response.ok) throw new Error(`api_${response.status}:${body?.error?.code ?? 'unknown'}:${body?.requestId ?? 'no_request_id'}`);
  assert(typeof body?.requestId === 'string' && body.requestId.length > 0, `${path}:request_id_missing`);
  return { data: body.data, requestId: body.requestId };
}

function preservesAviationTerms(value) {
  return ['CCA123', 'FL180', 'Runway 36L'].every((term) => value.includes(term));
}

try {
  const temporaryUser = await createTemporaryPhoneAuthUser({ admin, password });
  phone = temporaryUser.phone;
  authUserId = temporaryUser.authUserId;
  accountId = authUserId;
  await database`
    insert into accounts (id, status)
    values (${accountId}, 'active')
  `;
  await database`
    insert into account_identities (account_id, auth_user_id, provider, subject_hash)
    values (
      ${accountId},
      ${authUserId},
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
  assert(me.data?.id === accountId, 'business_account_resolution_failed');

  const consentChallenge = await api('/v1/ai/consent/challenge', token, {
    method: 'POST',
    body: JSON.stringify({
      flowRevision: 'native-explicit-consent-v1',
      policyVersion: 'ai-learning-privacy-v4',
    }),
  });
  const consent = await api('/v1/ai/consent', token, {
    method: 'POST',
    body: JSON.stringify({
      accepted: true,
      challenge: consentChallenge.data?.challenge,
      flowRevision: 'native-explicit-consent-v1',
      policyVersion: 'ai-learning-privacy-v4',
    }),
  });
  assert(consent.data?.policyVersion === 'ai-learning-privacy-v4', 'policy_version_mismatch');

  const grammar = await api('/v1/ai/review', token, {
    method: 'POST',
    body: JSON.stringify({
      mode: 'grammar',
      module: 'atc',
      questionId: 'live-verify-grammar',
      transcript: 'CCA123 were maintaining FL180 and was cleared Runway 36L.',
    }),
  });
  assert(typeof grammar.data?.grammar?.correctedText === 'string', 'grammar_result_missing');
  assert(Array.isArray(grammar.data?.grammar?.issues), 'grammar_issues_missing');
  assert(preservesAviationTerms(grammar.data.grammar.correctedText), 'grammar_aviation_terms_changed');

  const polish = await api('/v1/ai/review', token, {
    method: 'POST',
    body: JSON.stringify({
      mode: 'opi',
      module: 'opi',
      questionId: 'live-verify-polish',
      transcript: 'CCA123 were maintaining FL180 and was cleared Runway 36L.',
    }),
  });
  assert(typeof polish.data?.grammar?.correctedText === 'string', 'polish_grammar_missing');
  assert(typeof polish.data?.polishedText === 'string', 'polished_text_missing');
  assert(preservesAviationTerms(polish.data.grammar.correctedText), 'polish_grammar_aviation_terms_changed');
  assert(preservesAviationTerms(polish.data.polishedText), 'polished_aviation_terms_changed');

  const usage = await database`
    select attempt_count, capability, failure_code, prompt_version, request_id, status, upstream_status
    from ai_usage_logs
    where user_id = ${accountId} and request_id in (${grammar.requestId}, ${polish.requestId})
    order by created_at asc
  `;
  assert(usage.length === 2, 'review_usage_log_missing');
  assert(
    new Set(usage.map((row) => row.capability)).size === 2
      && usage.some((row) => row.capability === 'grammar_review')
      && usage.some((row) => row.capability === 'polish')
      && usage.every((row) => row.status === 'success'),
    'review_usage_status',
  );
  assert(usage.every((row) => row.failure_code === null && row.attempt_count >= 1), 'review_usage_observability');
  assert(usage.every((row) => ['success', 'recovered'].includes(row.upstream_status)), 'review_usage_upstream_status');
  assert(new Set(usage.map((row) => row.prompt_version)).size === 1, 'review_prompt_version_mismatch');

  verification = {
    aviationTerms: true,
    grammar: true,
    polish: true,
    promptVersion: usage[0].prompt_version,
    status: 'ok',
    usageObserved: true,
  };
} catch (error) {
  verification = { error };
}

const cleanupErrors = [];
cleanupErrors.push(...await cleanupTemporaryBusinessAccount({
  accountId,
  admin,
  authUserId,
  database,
  errorPrefix: 'review',
}));
try {
  await database.end({ timeout: 5 });
} catch (error) {
  cleanupErrors.push(new Error('review_cleanup_database_close_failed', { cause: error }));
}
cleanupComplete = cleanupErrors.length === 0;

const verificationError = verification && 'error' in verification ? verification.error : undefined;
if (verificationError || cleanupErrors.length > 0) {
  throw new AggregateError(
    [...(verificationError ? [verificationError] : []), ...cleanupErrors],
    'review_live_verification_failed',
  );
}

assert(verification, 'review_verification_incomplete');
console.log(JSON.stringify({ ...verification, cleanupComplete }));
