const apiUrl = process.env.ICAO_API_URL?.replace(/\/$/u, '');
const accessToken = process.env.ICAO_AUTH_ACCESS_TOKEN;
const secondAccessToken = process.env.ICAO_AUTH_SECOND_ACCESS_TOKEN;
const requirePhoneIdentity = process.env.ICAO_REQUIRE_PHONE_IDENTITY === '1';
if (!apiUrl || !accessToken) throw new Error('missing_account_verification_configuration');

function assert(condition, message) {
  if (!condition) throw new Error(`account_verification_failed:${message}`);
}

async function api(path, token) {
  const response = await fetch(`${apiUrl}${path}`, {
    headers: { accept: 'application/json', authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
  });
  const body = await response.json().catch(() => undefined);
  if (!response.ok) throw new Error(`account_api_${response.status}:${body?.error?.code ?? 'unknown'}`);
  return body?.data;
}

async function verifySession(token) {
  const [account, me] = await Promise.all([
    api('/v1/account', token),
    api('/v1/me', token),
  ]);
  assert(typeof account?.accountId === 'string', 'account_id_missing');
  assert(me?.id === account.accountId, 'business_identity_mismatch');
  assert(Array.isArray(account.providers) && account.providers.length > 0, 'identity_provider_missing');
  assert(account.phoneBound === account.providers.includes('phone'), 'phone_binding_state_mismatch');
  return account;
}

const first = await verifySession(accessToken);
if (requirePhoneIdentity) {
  assert(first.phoneBound && first.providers.includes('phone'), 'verified_phone_identity_required');
}
if (secondAccessToken) {
  const second = await verifySession(secondAccessToken);
  assert(second.accountId === first.accountId, 'cross_login_account_mismatch');
}

const unauthenticated = await fetch(`${apiUrl}/v1/account`, {
  headers: { accept: 'application/json' },
  signal: AbortSignal.timeout(15_000),
});
assert(unauthenticated.status === 401, 'account_endpoint_must_require_auth');

console.log(JSON.stringify({
  accountId: first.accountId,
  crossLogin: secondAccessToken ? 'verified' : 'not_requested',
  phoneBound: first.phoneBound,
  providers: first.providers,
  requiredIdentity: requirePhoneIdentity ? 'phone' : 'any_supported_provider',
  status: 'permanent_account_verified',
}));
