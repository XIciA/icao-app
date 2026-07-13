import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_PUBLIC_URL;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const apiUrl = process.env.ICAO_API_URL;
if (!supabaseUrl || !publishableKey || !apiUrl) throw new Error('missing_account_verification_configuration');

const email = `phase2c-${Date.now()}@icao.test`;
const password = 'Phase2cPassword1';
const nextPassword = 'Phase2cPassword2';

function client() {
  return createClient(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function api(path, token, init = {}) {
  return fetch(`${apiUrl}${path}`, {
    ...init,
    headers: { accept: 'application/json', authorization: `Bearer ${token}`, ...init.headers },
  });
}

const first = client();
const second = client();
const third = client();

const signup = await first.auth.signUp({ email, password });
if (signup.error || !signup.data.session) throw signup.error ?? new Error('signup_session_missing');
const userId = signup.data.user?.id;
const firstToken = signup.data.session.access_token;

const unauthenticated = await fetch(`${apiUrl}/v1/question-banks`);
assert(unauthenticated.status === 401, 'question_banks_must_require_auth');
assert((await unauthenticated.json()).error.code === 'missing_bearer_token', 'question_bank_auth_error_mismatch');

const banks = await api('/v1/question-banks', firstToken);
assert(banks.status === 200, 'authenticated_question_banks_failed');

const consent = await api('/v1/ai/consent', firstToken, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ accepted: true, policyVersion: 'ai-learning-privacy-v1' }),
});
assert(consent.status === 201, 'authenticated_ai_consent_failed');

const sync = await api('/v1/sync/push', firstToken, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ mutations: [{
    mutationId: `phase2c:${userId}:record`,
    kind: 'learning_record',
    payload: {
      recordId: 'phase2c-account-verification',
      record: { id: 'phase2c-account-verification', kind: 'account-verification' },
      occurredAt: new Date().toISOString(),
    },
  }] }),
});
assert(sync.status === 201, 'authenticated_sync_failed');

const secondLogin = await second.auth.signInWithPassword({ email, password });
if (secondLogin.error || !secondLogin.data.session) throw secondLogin.error ?? new Error('second_session_missing');

const reauth = await first.auth.signInWithPassword({ email, password });
if (reauth.error || !reauth.data.session) throw reauth.error ?? new Error('reauthentication_failed');
const passwordUpdate = await first.auth.updateUser({ password: nextPassword });
if (passwordUpdate.error) throw passwordUpdate.error;
const updatedSession = await first.auth.getSession();
const updatedToken = updatedSession.data.session?.access_token;
assert(Boolean(updatedToken), 'updated_session_missing');

const revoke = await api('/v1/account/sessions/revoke-all', updatedToken, { method: 'POST' });
assert(revoke.status === 201, 'global_session_revocation_failed');

const rejectedSecond = await api('/v1/me', secondLogin.data.session.access_token);
assert(rejectedSecond.status === 401, 'second_session_remained_active');
assert(['session_revoked', 'invalid_access_token'].includes((await rejectedSecond.json()).error.code), 'revoked_session_error_mismatch');

const oldPassword = await third.auth.signInWithPassword({ email, password });
assert(Boolean(oldPassword.error), 'old_password_still_valid');
const newPassword = await third.auth.signInWithPassword({ email, password: nextPassword });
if (newPassword.error || !newPassword.data.session) throw newPassword.error ?? new Error('new_password_login_failed');

const deletion = await api('/v1/account', newPassword.data.session.access_token, {
  method: 'DELETE',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ currentPassword: nextPassword, confirmation: '注销账号' }),
});
assert(deletion.status === 204, 'account_deletion_failed');

const deletedLogin = await client().auth.signInWithPassword({ email, password: nextPassword });
assert(Boolean(deletedLogin.error), 'deleted_account_can_still_login');

console.log(JSON.stringify({ email, userId, status: 'account_governance_verified' }));
