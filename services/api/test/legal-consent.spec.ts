import { describe, expect, it, vi } from 'vitest';
import type { AppContentLegalDocument, AppContentRelease, LegalConsentReceipt } from '@icao/contracts/app-content';
import { legalConsentMatches } from '@icao/contracts/app-content';
import { LegalConsentService } from '../src/app-content/legal-consent.service';

const id = '00000000-0000-4000-8000-000000000001';
const document = (kind: 'agreement' | 'privacy', version = 'v5.0', consentVersion = 'v5.0'): AppContentLegalDocument => ({
  id: kind, version, consentVersion, effectiveAt: '2026-09-09', title: kind, intro: '正文',
  sections: [{ title: '说明', body: '正文' }], requiresReconsent: true,
});
function fixture(receipt: LegalConsentReceipt | null = null) {
  const agreement = document('agreement'); const privacy = document('privacy');
  const content = { get: vi.fn().mockResolvedValue({ version: 1, payload: { legal: { agreement, privacy } } } as AppContentRelease) };
  const upsert = vi.fn().mockResolvedValue(undefined);
  const db = {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => receipt ? [{ payload: receipt }] : [] }) }) }),
    execute: vi.fn().mockResolvedValue(undefined),
    insert: () => ({ values: () => ({ onConflictDoUpdate: upsert }) }),
    transaction: async (action: (tx: unknown) => unknown) => action(db),
  };
  return { service: new LegalConsentService({ db } as never, content as never), content, db, upsert };
}

describe('legal version receipts', () => {
  it('requires explicit acceptance for a new account and writes server time/version against current release', async () => {
    const { service, upsert, content, db } = fixture();
    expect((await service.status(id)).required).toBe(true);
    const receipt = await service.accept(id, { agreementVersion: 'v5.0', privacyVersion: 'v5.0' });
    expect(receipt).toMatchObject({ accountId: id, agreementVersion: 'v5.0', privacyConsentVersion: 'v5.0', releaseVersion: 1 });
    expect(upsert).toHaveBeenCalledOnce(); expect(content.get).toHaveBeenLastCalledWith(db);
  });
  it('rejects a stale displayed version without recording a consent', async () => {
    const { service, upsert } = fixture();
    await expect(service.accept(id, { agreementVersion: 'v4.0', privacyVersion: 'v5.0' })).rejects.toThrow('legal_version_changed');
    expect(upsert).not.toHaveBeenCalled();
  });
  it('does not confuse minor text revision with a new required consent, or reuse another account receipt', async () => {
    const receipt = await fixture().service.accept(id, { agreementVersion: 'v5.0', privacyVersion: 'v5.0' });
    expect(legalConsentMatches(receipt, id, { agreement: document('agreement', 'v5.1'), privacy: document('privacy') })).toBe(true);
    expect(legalConsentMatches(receipt, id, { agreement: document('agreement', 'v6.0', 'v6.0'), privacy: document('privacy') })).toBe(false);
    expect(legalConsentMatches(receipt, 'another-account', { agreement: document('agreement'), privacy: document('privacy') })).toBe(false);
  });
});
