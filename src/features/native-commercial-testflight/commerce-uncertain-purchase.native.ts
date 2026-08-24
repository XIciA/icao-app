import Storage from '@/platform/storage';

import {
  MEMBERSHIP_OFFERING_KEYS,
  type CommerceOfferingKey,
} from './commerce-provider.native';

const STORAGE_PREFIX = 'icao.commerce.uncertain-purchase.v1';

export type PersistedUncertainPurchase = Readonly<{
  accountId: string;
  offeringKey: CommerceOfferingKey;
  startedAt: string;
  baselineTransactionReferences: readonly string[];
  transactionReference?: string;
  environment?: 'sandbox' | 'production';
}>;

export type UncertainPurchaseLoadResult =
  | Readonly<{ state: 'none' }>
  | Readonly<{ state: 'pending'; purchase: PersistedUncertainPurchase }>
  | Readonly<{ state: 'invalid' }>;

function storageKey(accountId: string) {
  return `${STORAGE_PREFIX}.${accountId}`;
}

function parse(value: string | null, accountId: string): PersistedUncertainPurchase | undefined {
  if (!value) return undefined;
  try {
    const candidate = JSON.parse(value) as Partial<PersistedUncertainPurchase>;
    if (
      candidate.accountId !== accountId
      || !MEMBERSHIP_OFFERING_KEYS.includes(candidate.offeringKey as CommerceOfferingKey)
      || typeof candidate.startedAt !== 'string'
      || !Number.isFinite(Date.parse(candidate.startedAt))
      || !Array.isArray(candidate.baselineTransactionReferences)
      || candidate.baselineTransactionReferences.some((reference) => typeof reference !== 'string')
      || (candidate.transactionReference !== undefined && typeof candidate.transactionReference !== 'string')
      || (candidate.environment !== undefined && candidate.environment !== 'sandbox' && candidate.environment !== 'production')
    ) return undefined;
    return {
      accountId,
      offeringKey: candidate.offeringKey as CommerceOfferingKey,
      startedAt: candidate.startedAt,
      baselineTransactionReferences: [...new Set(candidate.baselineTransactionReferences)],
      transactionReference: candidate.transactionReference,
      environment: candidate.environment,
    };
  } catch {
    return undefined;
  }
}

export async function loadUncertainPurchase(accountId: string) {
  const key = storageKey(accountId);
  let value: string | null;
  try {
    value = await Storage.getItem(key);
  } catch {
    return { state: 'invalid' } as const;
  }
  if (!value) return { state: 'none' } as const;
  const parsed = parse(value, accountId);
  return parsed
    ? { state: 'pending', purchase: parsed } as const
    : { state: 'invalid' } as const;
}

export async function persistUncertainPurchase(purchase: PersistedUncertainPurchase) {
  await Storage.setItem(storageKey(purchase.accountId), JSON.stringify(purchase));
}

export async function clearUncertainPurchase(accountId: string) {
  await Storage.removeItem(storageKey(accountId));
}
