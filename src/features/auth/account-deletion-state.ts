import { randomUUID } from 'expo-crypto';

import { secureSessionStorage } from './secure-session-storage';

const PENDING_ACCOUNT_DELETION_KEY = 'icao.account-deletion.pending.v1';

export type PendingAccountDeletion = {
  accountId: string;
  createdAt: number;
  idempotencyKey: string;
};

function parsePendingAccountDeletion(raw: string | null): PendingAccountDeletion | undefined {
  if (!raw) return undefined;
  try {
    const value = JSON.parse(raw) as Partial<PendingAccountDeletion>;
    if (
      typeof value.accountId !== 'string'
      || !value.accountId
      || typeof value.createdAt !== 'number'
      || !Number.isFinite(value.createdAt)
      || value.createdAt <= 0
      || typeof value.idempotencyKey !== 'string'
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value.idempotencyKey)
    ) return undefined;
    return { accountId: value.accountId, createdAt: value.createdAt, idempotencyKey: value.idempotencyKey };
  } catch {
    return undefined;
  }
}

export async function readPendingAccountDeletion() {
  return parsePendingAccountDeletion(await secureSessionStorage.getItem(PENDING_ACCOUNT_DELETION_KEY));
}

export async function pendingAccountDeletionFor(accountId: string) {
  const existing = await readPendingAccountDeletion();
  if (existing) {
    if (existing.accountId !== accountId) throw new Error('account_deletion_already_pending');
    return existing;
  }
  const pending = { accountId, createdAt: Date.now(), idempotencyKey: randomUUID() };
  await secureSessionStorage.setItem(PENDING_ACCOUNT_DELETION_KEY, JSON.stringify(pending));
  return pending;
}

export async function clearPendingAccountDeletion() {
  await secureSessionStorage.removeItem(PENDING_ACCOUNT_DELETION_KEY);
}
