import { readAccountRestore, saveAccountRestore, clearAccountRestore } from '../account-restore-cache.native';
import type { NativeAccountSummary } from '@icao/contracts/native-auth';
import type { LegalConsentStatus } from '@icao/contracts/app-content';
let mockRaw: string | null = null;
jest.mock('../secure-session-storage', () => ({ secureSessionStorage: {
  getItem: async () => mockRaw, setItem: async (_key: string, value: string) => { mockRaw = value; }, removeItem: async () => { mockRaw = null; },
} }));
const account = { accountId: 'owner' } as NativeAccountSummary;
const legal = { accountId: 'owner', required: false } as LegalConsentStatus;
beforeEach(() => { mockRaw = null; });
it('only restores the securely matched identity and accepted legal state', async () => {
  await saveAccountRestore('auth-owner', account, legal);
  expect(await readAccountRestore('auth-owner')).toMatchObject({ account });
  expect(await readAccountRestore('other')).toBeUndefined();
  await clearAccountRestore(); expect(await readAccountRestore('auth-owner')).toBeUndefined();
  await saveAccountRestore('auth-owner', account, { ...legal, required: true });
  expect(await readAccountRestore('auth-owner')).toBeUndefined();
});
it('rejects future-dated and malformed snapshots', async () => {
  for (const verifiedAt of [Date.now() + 3600000]) {
    mockRaw = JSON.stringify({ userId: 'auth-owner', account, legal, verifiedAt });
    expect(await readAccountRestore('auth-owner')).toBeUndefined();
  }
  mockRaw = '{broken'; expect(await readAccountRestore('auth-owner')).toBeUndefined();
});

it('restores identity after several days without granting content access', async () => {
 mockRaw = JSON.stringify({ userId: 'auth-owner', account, legal, verifiedAt: Date.now() - 30 * 86400000 });
 expect(await readAccountRestore('auth-owner')).toMatchObject({ account });
});
