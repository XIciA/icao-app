import type { ContentAccessCredential, ContentAccessScope } from '@icao/contracts';

import { verifyContentAccessCredential } from '../data/content-credential-verifier.native';

const ACCOUNT_ID = '00000000-0000-4000-8000-000000000001';
const NOW_SECONDS = 1_777_000_000;
const SCOPE: ContentAccessScope = {
  bankId: 'listening',
  categoryId: 'listening-category-01',
  topicId: 'listening-topic-01',
};

function credential(overrides: Record<string, unknown> = {}): ContentAccessCredential {
  const claims = {
    aud: 'icao-content-offline',
    entitlementSegmentId: '00000000-0000-4000-8000-000000000099',
    environment: 'production',
    exp: NOW_SECONDS + 3_600,
    iat: NOW_SECONDS,
    iss: 'icao-api',
    jti: '00000000-0000-4000-8000-000000000098',
    policyVersion: 'content-access-v2',
    scopes: [SCOPE],
    sub: ACCOUNT_ID,
    ...overrides,
  };
  return {
    token: `header.${btoa(JSON.stringify(claims)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')}.signature`,
    issuedAt: new Date(Number(claims.iat) * 1_000).toISOString(),
    expiresAt: new Date(Number(claims.exp) * 1_000).toISOString(),
    policyVersion: 'content-access-v2',
    environment: 'production',
    scopes: [SCOPE],
  };
}

function verify(value: ContentAccessCredential) {
  return verifyContentAccessCredential({
    accountId: ACCOUNT_ID,
    credential: value,
    environment: 'production',
    now: NOW_SECONDS * 1_000,
    scope: SCOPE,
  });
}

describe('offline member content credential verification', () => {
  it('accepts an Ed25519-verified account/environment/scope credential', () => {
    expect(verify(credential())).toMatchObject({ sub: ACCOUNT_ID, environment: 'production', scopes: [SCOPE] });
  });

  it('rejects missing signatures, old policy credentials, account/environment substitutions and outer-field tampering', () => {
    expect(verify({ ...credential(), token: 'invalid' })).toBeUndefined();
    expect(verify(credential({ policyVersion: 'content-access-v1' }))).toBeUndefined();
    expect(verify(credential({ sub: '00000000-0000-4000-8000-000000000002' }))).toBeUndefined();
    expect(verify(credential({ entitlementSegmentId: undefined }))).toBeUndefined();
    expect(verify(credential({ environment: 'sandbox' }))).toBeUndefined();
    expect(verify({ ...credential(), expiresAt: new Date((NOW_SECONDS + 7_200) * 1_000).toISOString() })).toBeUndefined();
  });

  it('rejects expired, non-finite and longer-than-72-hour credentials', () => {
    expect(verify(credential({ exp: NOW_SECONDS }))).toBeUndefined();
    expect(verify(credential({ exp: NOW_SECONDS + 72 * 60 * 60 + 1 }))).toBeUndefined();
    const malformed = credential();
    const currentPayload = malformed.token.split('.')[1]!
      .replaceAll('-', '+')
      .replaceAll('_', '/');
    const payload = btoa(JSON.stringify({
      ...JSON.parse(atob(currentPayload)),
      exp: 'not-a-number',
    })).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
    expect(verify({ ...malformed, token: `header.${payload}.signature` })).toBeUndefined();
  });
});
