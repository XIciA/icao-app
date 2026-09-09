import {
  legalConsentMatches, type AppContentLegalDocument, type LegalConsentReceipt, type LegalConsentStatus,
} from '@icao/contracts/app-content';
import { ApiClientError, apiAccessToken, apiRequest, apiRequestWithAccessToken, getApiBaseUrl, withApiRequestTimeout } from '@/platform/api-client';
import Storage from '@/platform/storage';
import { readAvailableLegalDocuments } from './repository.native';

const key = (accountId: string) => `icao.legal-consent.v1.${encodeURIComponent(getApiBaseUrl() ?? '')}.${accountId}`;
type CachedConsent = Pick<LegalConsentStatus, 'accountId' | 'releaseVersion' | 'agreement' | 'privacy' | 'receipt'>;
async function readCachedConsent(accountId: string): Promise<CachedConsent | undefined> {
  try {
    const raw = await Storage.getItem(key(accountId));
    const cached = raw ? JSON.parse(raw) as CachedConsent : undefined;
    return cached?.accountId === accountId && cached.agreement?.version && cached.privacy?.version ? cached : undefined;
  } catch { return undefined; }
}

export async function getLegalConsentStatus(accountId: string): Promise<LegalConsentStatus> {
  try {
    const status = await withApiRequestTimeout((signal) => apiRequest<LegalConsentStatus>('/v1/legal-consent', { signal }), undefined, 8000);
    if (status.accountId !== accountId) throw new ApiClientError('legal_account_changed', 409);
    await Storage.setItem(key(accountId), JSON.stringify(status)).catch(() => undefined);
    return status;
  } catch (cause) {
    if (cause instanceof ApiClientError && cause.status >= 400 && cause.status < 500 && cause.status !== 408 && cause.status !== 429) throw cause;
    const [available, cached] = await Promise.all([readAvailableLegalDocuments(), readCachedConsent(accountId)]);
    // Keep the exact documents accepted on this account even if the separate public cache is older.
    const documents = cached && cached.releaseVersion >= available.releaseVersion ? cached : available.documents;
    const receipt = cached?.receipt ?? null;
    return { accountId, releaseVersion: Math.max(available.releaseVersion, cached?.releaseVersion ?? 0),
      agreement: documents.agreement, privacy: documents.privacy, receipt, required: !legalConsentMatches(receipt, accountId, documents) };
  }
}

export async function acceptLegalDocuments(accountId: string, documents: { agreement: AppContentLegalDocument; privacy: AppContentLegalDocument }) {
  const accessToken = await apiAccessToken();
  if (!accessToken) throw new ApiClientError('missing_bearer_token', 401);
  // Consent belongs to the user who pressed the button, never to a new login during a 401 retry.
  const receipt = await apiRequestWithAccessToken<LegalConsentReceipt>('/v1/legal-consent', accessToken, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ agreementVersion: documents.agreement.version, privacyVersion: documents.privacy.version }),
  });
  if (!legalConsentMatches(receipt, accountId, documents)) throw new Error('invalid_legal_consent_receipt');
  await Storage.setItem(key(accountId), JSON.stringify({ accountId, releaseVersion: receipt.releaseVersion, ...documents, receipt } satisfies CachedConsent)).catch(() => undefined);
  return receipt;
}

export async function clearLegalConsentReceipt(accountId: string) {
  await Storage.removeItem(key(accountId));
}
