import type { ContentAccessCredential, ContentAccessScope } from '@icao/contracts';
import * as distributionEnvironment from '@icao/distribution-environment';

import {
  inspectContentAccessCredential,
  verifyContentAccessCredential,
} from '../data/content-credential-verifier.native';

const { generateKeyPairSync, sign, verify: verifySignature } = jest.requireActual('node:crypto');
const { Buffer } = jest.requireActual('node:buffer');

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
  beforeEach(() => {
    jest.mocked(distributionEnvironment.verifyIcaoEd25519Jws).mockImplementation((token) => {
      try { return token.split('.')[1] ? Buffer.from(token.split('.')[1]!, 'base64url').toString('utf8') : undefined; }
      catch { return undefined; }
    });
  });
  afterEach(() => jest.restoreAllMocks());

  it('accepts the real API millisecond envelope while signed JWT timestamps remain whole seconds', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const value = credential();
    const payload = value.token.split('.')[1]!;
    const message = `${Buffer.from(JSON.stringify({ alg: 'EdDSA', typ: 'JWT' })).toString('base64url')}.${payload}`;
    value.token = `${message}.${sign(null, Buffer.from(message), privateKey).toString('base64url')}`;
    value.issuedAt = new Date(NOW_SECONDS * 1_000 + 437).toISOString();
    value.expiresAt = new Date((NOW_SECONDS + 3_600) * 1_000 + 437).toISOString();
    jest.spyOn(distributionEnvironment, 'verifyIcaoEd25519Jws').mockImplementation((token) => {
      const [header, body, signature] = token.split('.');
      return header && body && signature && verifySignature(null, Buffer.from(`${header}.${body}`), publicKey, Buffer.from(signature, 'base64url'))
        ? Buffer.from(body, 'base64url').toString('utf8') : undefined;
    });

    expect(verify(value)).toMatchObject({ sub: ACCOUNT_ID });
    expect(verify({ ...value, expiresAt: new Date((NOW_SECONDS + 3_601) * 1_000).toISOString() })).toBeUndefined();
    expect(verify({ ...value, issuedAt: 'invalid' })).toBeUndefined();
    expect(verify({ ...value, token: `${message}.invalid` })).toBeUndefined();
    expect(verifyContentAccessCredential({ accountId: 'another-account', credential: value, environment: 'production', now: NOW_SECONDS * 1_000, scope: SCOPE })).toBeUndefined();
    expect(inspectContentAccessCredential({ accountId: ACCOUNT_ID, credential: value, environment: 'production', now: (NOW_SECONDS + 3_600) * 1_000, scope: SCOPE }).status).toBe('expired');
  });

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

  it('classifies expiry only after signature and bindings are valid', () => {
    const expired = credential({ iat: NOW_SECONDS - 3_600, exp: NOW_SECONDS - 1 });
    expect(inspectContentAccessCredential({
      accountId: ACCOUNT_ID,
      credential: expired,
      environment: 'production',
      now: NOW_SECONDS * 1_000,
      scope: SCOPE,
    }).status).toBe('expired');
    expect(inspectContentAccessCredential({
      accountId: ACCOUNT_ID,
      credential: { ...expired, token: 'invalid-signature', expiresAt: '2020-01-01T00:00:00.000Z' },
      environment: 'production',
      now: NOW_SECONDS * 1_000,
      scope: SCOPE,
    }).status).toBe('invalid');
  });
});
