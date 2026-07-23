const apiUrl = process.env.ICAO_API_URL;
const inviteCode = process.env.INVITE_VERIFY_CODE;
if (!apiUrl || !inviteCode) throw new Error('missing_invite_verification_configuration');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function inviteSession() {
  const response = await fetch(`${apiUrl}/v1/auth/invite/session`, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({ inviteCode }),
  });
  assert(response.status === 201, `invite_login_failed:${response.status}`);
  const body = await response.json();
  assert(typeof body.data?.accessToken === 'string', 'invite_access_token_missing');
  assert(typeof body.data?.user?.id === 'string', 'invite_user_missing');
  return body.data;
}

async function api(path, accessToken) {
  return fetch(`${apiUrl}${path}`, {
    headers: { accept: 'application/json', authorization: `Bearer ${accessToken}` },
  });
}

const first = await inviteSession();
const second = await inviteSession();
assert(first.user.id === second.user.id, 'invite_cross_device_user_mismatch');

const unauthenticated = await fetch(`${apiUrl}/v1/question-banks`);
assert(unauthenticated.status === 401, 'question_banks_must_require_auth');

const me = await api('/v1/me', first.accessToken);
assert(me.status === 200, 'invite_session_cannot_access_business_api');
assert((await me.json()).data.id === first.user.id, 'invite_session_user_mismatch');

console.log(JSON.stringify({ userId: first.user.id, displayName: first.user.displayName, status: 'invite_account_verified' }));
