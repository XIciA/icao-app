const apiBase = (process.env.API_BASE ?? 'http://127.0.0.1:3101').replace(/\/$/u, '');
const mode = process.env.ICAO_LIVE_VERIFY_MODE ?? 'readiness';

function assert(value, message) {
  if (!value) throw new Error(`verification_failed:${message}`);
}

async function request(path, init = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      accept: 'application/json',
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...init.headers,
    },
    signal: AbortSignal.timeout(15_000),
  });
  const body = await response.json().catch(() => undefined);
  return { body, response };
}

if (!['readiness', 'account', 'phone-account'].includes(mode)) {
  throw new Error('invalid_live_verification_mode');
}

const ready = await request('/health/ready');
assert(ready.response.ok, `readiness_http_${ready.response.status}`);

const unauthenticated = await request('/v1/account');
assert(unauthenticated.response.status === 401, 'account_endpoint_must_require_auth');

for (const path of ['/v1/auth/phone/otp/start', '/v1/auth/phone/recovery/start']) {
  const probe = await request(path, {
    method: 'POST',
    body: JSON.stringify({ phone: 'invalid-live-verification-probe' }),
  });
  assert(probe.response.status === 400, `${path}:invalid_phone_status`);
  assert(probe.body?.error?.code === 'invalid_phone_number', `${path}:invalid_phone_contract`);
}

if (mode === 'account' || mode === 'phone-account') {
  if (!process.env.ICAO_AUTH_ACCESS_TOKEN) {
    throw new Error('missing_account_verification_token');
  }
  process.env.ICAO_API_URL = apiBase;
  process.env.ICAO_REQUIRE_PHONE_IDENTITY = mode === 'phone-account' ? '1' : '0';
  await import('./verify-account-live.mjs');
}

console.log(JSON.stringify({
  account: mode === 'readiness' ? 'not_requested' : 'verified',
  authGuard: 'unauthenticated_request_rejected_as_expected',
  mode,
  phoneOtpRoutes: 'server_owned_invalid_probe_ok',
  readiness: 'ok',
}));
