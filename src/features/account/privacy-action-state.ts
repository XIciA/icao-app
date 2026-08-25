import { randomUUID } from 'expo-crypto';

import Storage from '@/platform/storage';

const PRIVACY_ACTION_PREFIX = 'icao.privacy-action.pending.v1';
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export type PrivacyAction = 'delete_all_ai_results' | 'clear_learning_data';

export type PendingPrivacyAction = {
  accountId: string;
  action: PrivacyAction;
  createdAt: number;
  idempotencyKey: string;
};

let stateQueue = Promise.resolve();

function storageKey(accountId: string, action: PrivacyAction) {
  return `${PRIVACY_ACTION_PREFIX}.${accountId}.${action}`;
}

function parsePending(raw: string | null, accountId: string, action: PrivacyAction) {
  if (!raw) return undefined;
  try {
    const value = JSON.parse(raw) as Partial<PendingPrivacyAction>;
    if (
      value.accountId !== accountId
      || value.action !== action
      || typeof value.createdAt !== 'number'
      || !Number.isFinite(value.createdAt)
      || value.createdAt <= 0
      || typeof value.idempotencyKey !== 'string'
      || !UUID_V4.test(value.idempotencyKey)
    ) return undefined;
    return value as PendingPrivacyAction;
  } catch {
    return undefined;
  }
}

function enqueueStateUpdate<T>(operation: () => Promise<T>) {
  const next = stateQueue.catch(() => undefined).then(operation);
  stateQueue = next.then(() => undefined, () => undefined);
  return next;
}

export function pendingPrivacyActionFor(accountId: string, action: PrivacyAction) {
  return enqueueStateUpdate(async () => {
    const key = storageKey(accountId, action);
    const existing = parsePending(await Storage.getItem(key), accountId, action);
    if (existing) return existing;
    const pending: PendingPrivacyAction = {
      accountId,
      action,
      createdAt: Date.now(),
      idempotencyKey: randomUUID(),
    };
    await Storage.setItem(key, JSON.stringify(pending));
    return pending;
  });
}

export function completePrivacyAction(pending: PendingPrivacyAction) {
  return enqueueStateUpdate(async () => {
    const key = storageKey(pending.accountId, pending.action);
    const current = parsePending(await Storage.getItem(key), pending.accountId, pending.action);
    if (current?.idempotencyKey === pending.idempotencyKey) await Storage.removeItem(key);
  });
}

export function clearPendingPrivacyActionsForAccount(accountId?: string) {
  return enqueueStateUpdate(async () => {
    const prefix = accountId
      ? `${PRIVACY_ACTION_PREFIX}.${accountId}.`
      : `${PRIVACY_ACTION_PREFIX}.`;
    const keys = (await Storage.getAllKeys()).filter((key) => key.startsWith(prefix));
    if (keys.length > 0) await Storage.multiRemove(keys);
  });
}

export function resetPrivacyActionStateForTests() {
  stateQueue = Promise.resolve();
}
