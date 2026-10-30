import type { NativeAccountSummary } from '@icao/contracts/native-auth';
import type { LegalConsentStatus } from '@icao/contracts/app-content';
import { secureSessionStorage } from './secure-session-storage';

type Snapshot = { userId: string; account: NativeAccountSummary; legal: LegalConsentStatus; verifiedAt: number };
const KEY = 'icao.auth.account-restore.v1';
export async function saveAccountRestore(userId: string, account: NativeAccountSummary, legal: LegalConsentStatus) {
  await secureSessionStorage.setItem(KEY, JSON.stringify({ userId, account, legal, verifiedAt: Date.now() } satisfies Snapshot));
}
export async function readAccountRestore(userId: string): Promise<Snapshot | undefined> {
  try {
    const raw = await secureSessionStorage.getItem(KEY);
    if (!raw) return undefined;
    const value = JSON.parse(raw) as Snapshot;
    const age = Date.now() - value.verifiedAt;
    if (value.userId !== userId || !value.account?.accountId || value.legal?.accountId !== value.account.accountId
      || value.legal.required || !Number.isFinite(age) || age < 0 || age > 72 * 60 * 60 * 1000) return undefined;
    return value;
  } catch { return undefined; }
}
export async function clearAccountRestore() { await secureSessionStorage.removeItem(KEY); }
