import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const apiBase = process.env.API_BASE ?? 'http://127.0.0.1:3101';
const supabaseUrl = process.env.SUPABASE_URL;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!supabaseUrl || !publishableKey || !secretKey) throw new Error('missing_live_verification_configuration');

const options = { auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false } };
const first = createClient(supabaseUrl, publishableKey, options);
const second = createClient(supabaseUrl, publishableKey, options);
const admin = createClient(supabaseUrl, secretKey, options);
const suffix = `${Date.now()}-${randomBytes(4).toString('hex')}`;
const email = `phase2a-${suffix}@example.test`;
const password = `Icao-${randomBytes(18).toString('base64url')}!7`;
let userId;
const keepTestUser = process.env.KEEP_TEST_USER === '1';

function assert(value, message) {
  if (!value) throw new Error(`verification_failed:${message}`);
}

async function api(path, accessToken, init = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${accessToken}`,
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`api_${response.status}:${body?.error?.code ?? 'unknown'}`);
  return body.data;
}

try {
  const signup = await first.auth.signUp({ email, password });
  if (signup.error) throw signup.error;
  assert(signup.data.session, 'signup_session_missing');
  assert(signup.data.user?.id, 'signup_user_missing');
  userId = signup.data.user.id;
  const firstToken = signup.data.session.access_token;
  const me = await api('/v1/me', firstToken);
  assert(me.id === userId && me.email === email, 'authenticated_user_mismatch');

  const wrongPassword = await second.auth.signInWithPassword({ email, password: `${password}-wrong` });
  assert(Boolean(wrongPassword.error), 'wrong_password_was_accepted');
  const login = await second.auth.signInWithPassword({ email, password });
  if (login.error) throw login.error;
  assert(login.data.session, 'second_session_missing');
  const secondToken = login.data.session.access_token;

  const stateMutation = {
    mutationId: `verify-card-${suffix}-v1`,
    kind: 'card_state',
    payload: {
      bankId: 'listening',
      topicId: 'listening-main',
      cardId: 'listening-main-001',
      state: { visited: true, completed: true, note: 'session-a', updatedAt: new Date().toISOString() },
      version: 1,
      updatedAt: new Date().toISOString(),
    },
  };
  stateMutation.payload.state.updatedAt = stateMutation.payload.updatedAt;
  const mutations = [
    stateMutation,
    {
      mutationId: `verify-record-${suffix}`,
      kind: 'learning_record',
      payload: { recordId: `record-${suffix}`, record: { id: `record-${suffix}`, reason: 'complete' }, occurredAt: new Date().toISOString() },
    },
    {
      mutationId: `verify-document-${suffix}-v1`,
      kind: 'document',
      payload: { documentKey: 'annotations', document: { version: 1, entries: { sample: { note: 'session-a' } } }, version: 1, updatedAt: new Date().toISOString() },
    },
  ];
  const firstPush = await api('/v1/sync/push', firstToken, { method: 'POST', body: JSON.stringify({ mutations }) });
  assert(firstPush.results.every((result) => result.status === 'accepted'), 'first_push_not_accepted');
  const duplicate = await api('/v1/sync/push', firstToken, { method: 'POST', body: JSON.stringify({ mutations }) });
  assert(duplicate.results.every((result) => result.status === 'duplicate'), 'duplicate_push_not_idempotent');

  const stale = structuredClone(stateMutation);
  stale.mutationId = `verify-card-${suffix}-stale`;
  stale.payload.state.completed = false;
  stale.payload.state.note = 'must-not-overwrite';
  const stalePush = await api('/v1/sync/push', secondToken, { method: 'POST', body: JSON.stringify({ mutations: [stale] }) });
  assert(stalePush.results[0]?.status === 'conflict', 'stale_version_not_rejected');
  assert(stalePush.results[0]?.authoritative?.state?.note === 'session-a', 'stale_version_overwrote_newer_state');

  const secondPull = await api('/v1/sync/pull?cursor=0', secondToken);
  assert(secondPull.changes.length === 3, 'second_session_restore_change_count');
  assert(new Set(secondPull.changes.map((change) => change.kind)).size === 3, 'second_session_restore_kinds');

  const newer = structuredClone(stateMutation);
  newer.mutationId = `verify-card-${suffix}-v2`;
  newer.payload.version = 2;
  newer.payload.updatedAt = new Date(Date.now() + 1_000).toISOString();
  newer.payload.state.updatedAt = newer.payload.updatedAt;
  newer.payload.state.note = 'session-b';
  const secondPush = await api('/v1/sync/push', secondToken, { method: 'POST', body: JSON.stringify({ mutations: [newer] }) });
  assert(secondPush.results[0]?.status === 'accepted', 'newer_version_not_accepted');
  const firstPull = await api(`/v1/sync/pull?cursor=${secondPull.cursor}`, firstToken);
  assert(firstPull.changes.length === 1 && firstPull.changes[0].payload.state.note === 'session-b', 'first_session_did_not_restore_second_change');

  console.log(JSON.stringify({
    auth: 'signup-login-wrong-password-session-restore-ok',
    duplicate: 'ok',
    staleConflict: 'ok',
    crossSessionChanges: secondPull.changes.length,
    incrementalChanges: firstPull.changes.length,
    ...(keepTestUser ? { testUserId: userId } : {}),
  }));
} finally {
  if (userId && !keepTestUser) {
    const deletion = await admin.auth.admin.deleteUser(userId);
    if (deletion.error) throw deletion.error;
  }
}
