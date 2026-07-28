import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';

const apiBase = process.env.API_BASE ?? 'http://127.0.0.1:3101';
const supabaseUrl = process.env.SUPABASE_URL;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const databaseUrl = process.env.DATABASE_URL;
if (!supabaseUrl || !publishableKey || !secretKey || !databaseUrl) throw new Error('missing_live_verification_configuration');

const options = { auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false } };
const first = createClient(supabaseUrl, publishableKey, options);
const second = createClient(supabaseUrl, publishableKey, options);
const admin = createClient(supabaseUrl, secretKey, options);
const database = postgres(databaseUrl, { prepare: false, max: 1 });
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
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  assert(created.data.user?.id, 'create_user_failed');
  userId = created.data.user.id;
  await database`
    insert into invite_accounts (code_lookup, code_hash, display_name, user_id, status)
    values (${`live-verify-${suffix}`}, ${'verification-only'}, ${'接口验证'}, ${userId}, ${'active'})
  `;

  const firstLogin = await first.auth.signInWithPassword({ email, password });
  if (firstLogin.error) throw firstLogin.error;
  assert(firstLogin.data.session, 'first_session_missing');
  const firstToken = firstLogin.data.session.access_token;
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
  const recordId = `record-${suffix}`;
  const recordMutation = {
    mutationId: `verify-record-${suffix}-v1`,
    kind: 'learning_record',
    payload: {
      recordId,
      record: { id: recordId, reason: 'complete', aiResult: { transcript: 'session-a' } },
      occurredAt: new Date().toISOString(),
    },
  };
  const mutations = [
    stateMutation,
    recordMutation,
    {
      mutationId: `verify-document-${suffix}-v1`,
      kind: 'document',
      payload: { documentKey: 'annotations', document: { version: 1, entries: { sample: { note: 'session-a' } } }, version: 1, updatedAt: new Date().toISOString() },
    },
  ];
  const firstPush = await api('/v1/sync/push', firstToken, { method: 'POST', body: JSON.stringify({ ownerUserId: userId, mutations }) });
  assert(firstPush.results.every((result) => result.status === 'accepted'), 'first_push_not_accepted');
  assert(firstPush.results[1]?.authoritative?.version === 1, 'legacy_record_was_not_treated_as_v1');
  const duplicate = await api('/v1/sync/push', firstToken, { method: 'POST', body: JSON.stringify({ ownerUserId: userId, mutations }) });
  assert(duplicate.results.every((result) => result.status === 'duplicate'), 'duplicate_push_not_idempotent');

  const stale = structuredClone(stateMutation);
  stale.mutationId = `verify-card-${suffix}-stale`;
  stale.payload.state.completed = false;
  stale.payload.state.note = 'must-not-overwrite';
  const stalePush = await api('/v1/sync/push', secondToken, { method: 'POST', body: JSON.stringify({ ownerUserId: userId, mutations: [stale] }) });
  assert(stalePush.results[0]?.status === 'conflict', 'stale_version_not_rejected');
  assert(stalePush.results[0]?.authoritative?.state?.note === 'session-a', 'stale_version_overwrote_newer_state');

  const secondPull = await api(`/v1/sync/pull?cursor=0&ownerUserId=${encodeURIComponent(userId)}`, secondToken);
  assert(secondPull.changes.length === 3, 'second_session_restore_change_count');
  assert(new Set(secondPull.changes.map((change) => change.kind)).size === 3, 'second_session_restore_kinds');

  const newer = structuredClone(stateMutation);
  newer.mutationId = `verify-card-${suffix}-v2`;
  newer.payload.version = 2;
  newer.payload.updatedAt = new Date(Date.now() + 1_000).toISOString();
  newer.payload.state.updatedAt = newer.payload.updatedAt;
  newer.payload.state.note = 'session-b';
  const recordV2 = structuredClone(recordMutation);
  recordV2.mutationId = `verify-record-${suffix}-v2`;
  recordV2.payload.version = 2;
  recordV2.payload.updatedAt = new Date(Date.now() + 1_000).toISOString();
  recordV2.payload.record.aiResult.transcript = 'session-b-latest';
  const secondPush = await api('/v1/sync/push', secondToken, { method: 'POST', body: JSON.stringify({ ownerUserId: userId, mutations: [newer, recordV2] }) });
  assert(secondPush.results.every((result) => result.status === 'accepted'), 'newer_versions_not_accepted');
  assert(secondPush.results[1]?.authoritative?.version === 2, 'record_v2_authoritative_version');
  assert(secondPush.results[1]?.authoritative?.record?.aiResult?.transcript === 'session-b-latest', 'record_v2_authoritative_content');

  const staleRecord = structuredClone(recordMutation);
  staleRecord.mutationId = `verify-record-${suffix}-stale`;
  staleRecord.payload.version = 1;
  staleRecord.payload.updatedAt = new Date(Date.now() + 2_000).toISOString();
  staleRecord.payload.record.aiResult.transcript = 'must-not-overwrite';
  const staleRecordPush = await api('/v1/sync/push', firstToken, { method: 'POST', body: JSON.stringify({ ownerUserId: userId, mutations: [staleRecord] }) });
  assert(staleRecordPush.results[0]?.status === 'conflict', 'stale_record_version_not_rejected');
  assert(staleRecordPush.results[0]?.authoritative?.version === 2, 'stale_record_authoritative_version');
  assert(staleRecordPush.results[0]?.authoritative?.record?.aiResult?.transcript === 'session-b-latest', 'stale_record_overwrote_newer_answer');

  const recordDuplicate = await api('/v1/sync/push', secondToken, { method: 'POST', body: JSON.stringify({ ownerUserId: userId, mutations: [recordV2] }) });
  assert(recordDuplicate.results[0]?.status === 'duplicate', 'record_v2_retry_not_idempotent');
  const firstPull = await api(`/v1/sync/pull?cursor=${secondPull.cursor}&ownerUserId=${encodeURIComponent(userId)}`, firstToken);
  const cardChange = firstPull.changes.find((change) => change.kind === 'card_state');
  const recordChange = firstPull.changes.find((change) => change.kind === 'learning_record');
  assert(firstPull.changes.length === 2 && cardChange?.payload.state.note === 'session-b', 'first_session_did_not_restore_second_card_change');
  assert(recordChange?.payload?.version === 2 && recordChange?.payload?.record?.aiResult?.transcript === 'session-b-latest', 'first_session_did_not_restore_record_v2');

  console.log(JSON.stringify({
    auth: 'admin-provision-login-wrong-password-session-restore-ok',
    duplicate: 'ok',
    staleConflict: 'ok',
    recordUpdate: 'v1-v2-stale-pull-ok',
    crossSessionChanges: secondPull.changes.length,
    incrementalChanges: firstPull.changes.length,
    ...(keepTestUser ? { testUserId: userId } : {}),
  }));
} finally {
  if (userId && !keepTestUser) {
    await database`delete from invite_accounts where user_id = ${userId}`;
    const deletion = await admin.auth.admin.deleteUser(userId);
    if (deletion.error) throw deletion.error;
  }
  await database.end({ timeout: 5 });
}
