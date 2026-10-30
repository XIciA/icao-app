import type { NativeAccountSummary } from '@icao/contracts/native-auth';
import type { LegalConsentStatus } from '@icao/contracts/app-content';
export async function saveAccountRestore(_userId: string, _account: NativeAccountSummary, _legal: LegalConsentStatus) {}
export async function readAccountRestore(_userId: string): Promise<{ account: NativeAccountSummary; legal: LegalConsentStatus } | undefined> { return undefined; }
export async function clearAccountRestore() {}
