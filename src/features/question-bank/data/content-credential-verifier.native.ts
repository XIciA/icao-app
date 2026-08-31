import {
  CONTENT_ACCESS_POLICY_VERSION,
  CONTENT_CREDENTIAL_PUBLIC_KEY_BASE64,
  type CommerceEnvironment,
  type ContentAccessCredential,
  type ContentAccessScope,
} from '@icao/contracts';
import { verifyIcaoEd25519Jws } from '@icao/distribution-environment';

const MAX_OFFLINE_SECONDS = 72 * 60 * 60;
const CLOCK_SKEW_SECONDS = 5 * 60;

type SignedContentCredentialClaims = {
  aud: string | string[];
  entitlementSegmentId: string;
  environment: CommerceEnvironment;
  exp: number;
  iat: number;
  iss: string;
  jti: string;
  policyVersion: typeof CONTENT_ACCESS_POLICY_VERSION;
  scopes: ContentAccessScope[];
  sub: string;
};

function scopeIdentity(scope: ContentAccessScope) {
  return `${scope.bankId}/${scope.categoryId}/${scope.topicId}`;
}

function validScope(value: unknown): value is ContentAccessScope {
  const scope = value as Partial<ContentAccessScope> | undefined;
  return Boolean(
    scope
    && typeof scope.bankId === 'string'
    && typeof scope.categoryId === 'string'
    && typeof scope.topicId === 'string',
  );
}

function sameScopes(left: readonly ContentAccessScope[], right: readonly ContentAccessScope[]) {
  return left.length === right.length
    && left.every((scope, index) => scopeIdentity(scope) === scopeIdentity(right[index]!));
}

function parseClaims(payload: string): SignedContentCredentialClaims | undefined {
  try {
    const claims = JSON.parse(payload) as Partial<SignedContentCredentialClaims>;
    if (
      claims.iss !== 'icao-api'
      || !(claims.aud === 'icao-content-offline'
        || (Array.isArray(claims.aud) && claims.aud.includes('icao-content-offline')))
      || typeof claims.sub !== 'string'
      || typeof claims.entitlementSegmentId !== 'string'
      || typeof claims.jti !== 'string'
      || claims.policyVersion !== CONTENT_ACCESS_POLICY_VERSION
      || (claims.environment !== 'production' && claims.environment !== 'sandbox')
      || !Number.isSafeInteger(claims.iat)
      || !Number.isSafeInteger(claims.exp)
      || !Array.isArray(claims.scopes)
      || !claims.scopes.every(validScope)
    ) return undefined;
    return claims as SignedContentCredentialClaims;
  } catch {
    return undefined;
  }
}

export function verifyContentAccessCredential({
  accountId,
  credential,
  environment,
  now = Date.now(),
  scope,
}: {
  accountId: string;
  credential: ContentAccessCredential;
  environment: CommerceEnvironment;
  now?: number;
  scope: ContentAccessScope;
}): SignedContentCredentialClaims | undefined {
  const inspection = inspectContentAccessCredential({
    accountId,
    credential,
    environment,
    now,
    scope,
  });
  return inspection.status === 'valid' ? inspection.claims : undefined;
}

export type ContentAccessCredentialInspection =
  | Readonly<{ status: 'valid'; claims: SignedContentCredentialClaims }>
  | Readonly<{ status: 'expired'; claims: SignedContentCredentialClaims }>
  | Readonly<{ status: 'invalid' }>;

/**
 * Verifies signature and every owner/scope/outer-field binding before time is
 * classified. Only an otherwise valid credential can be reported expired.
 */
export function inspectContentAccessCredential({
  accountId,
  credential,
  environment,
  now = Date.now(),
  scope,
}: {
  accountId: string;
  credential: ContentAccessCredential;
  environment: CommerceEnvironment;
  now?: number;
  scope: ContentAccessScope;
}): ContentAccessCredentialInspection {
  const payload = verifyIcaoEd25519Jws(
    credential.token,
    CONTENT_CREDENTIAL_PUBLIC_KEY_BASE64,
  );
  if (!payload) return { status: 'invalid' };
  const claims = parseClaims(payload);
  if (!claims) return { status: 'invalid' };

  const nowSeconds = Math.floor(now / 1_000);
  if (
    claims.sub !== accountId
    || claims.environment !== environment
    || claims.iat > nowSeconds + CLOCK_SKEW_SECONDS
    || claims.exp <= claims.iat
    || claims.exp - claims.iat > MAX_OFFLINE_SECONDS
    || credential.policyVersion !== claims.policyVersion
    || credential.environment !== claims.environment
    || credential.issuedAt !== new Date(claims.iat * 1_000).toISOString()
    || credential.expiresAt !== new Date(claims.exp * 1_000).toISOString()
    || !sameScopes(credential.scopes, claims.scopes)
    || !claims.scopes.some((candidate) => scopeIdentity(candidate) === scopeIdentity(scope))
  ) return { status: 'invalid' };

  return claims.exp <= nowSeconds
    ? { status: 'expired', claims }
    : { status: 'valid', claims };
}
