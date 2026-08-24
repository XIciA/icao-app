/* eslint-disable import/first */
const mockValues = new Map<string, string>();

jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 6,
  getItemAsync: jest.fn(async (key: string) => mockValues.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => { mockValues.set(key, value); }),
  deleteItemAsync: jest.fn(async (key: string) => { mockValues.delete(key); }),
}));
jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn().mockReturnValue('10000000-0000-4000-8000-000000000021'),
}));

import {
  clearPendingAccountDeletion,
  pendingAccountDeletionFor,
  readPendingAccountDeletion,
} from '../account-deletion-state';

describe('pending account deletion state', () => {
  beforeEach(() => mockValues.clear());

  it('persists and reuses one idempotency key across retries and restarts', async () => {
    const first = await pendingAccountDeletionFor('account-1');
    const second = await pendingAccountDeletionFor('account-1');

    expect(second).toEqual(first);
    expect(await readPendingAccountDeletion()).toEqual({
      accountId: 'account-1',
      createdAt: expect.any(Number),
      idempotencyKey: '10000000-0000-4000-8000-000000000021',
    });
  });

  it('does not allow another account to reuse a pending deletion key', async () => {
    await pendingAccountDeletionFor('account-1');
    await expect(pendingAccountDeletionFor('account-2')).rejects.toThrow('account_deletion_already_pending');
  });

  it('removes the pending receipt only after the caller confirms completion', async () => {
    await pendingAccountDeletionFor('account-1');
    await clearPendingAccountDeletion();
    expect(await readPendingAccountDeletion()).toBeUndefined();
  });
});
