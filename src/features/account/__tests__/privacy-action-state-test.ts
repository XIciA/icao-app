/* eslint-disable import/first */
const mockValues = new Map<string, string>();
const mockRandomUUID = jest.fn();

jest.mock('@/platform/storage', () => ({
  __esModule: true,
  default: {
    getAllKeys: jest.fn(async () => [...mockValues.keys()]),
    getItem: jest.fn(async (key: string) => mockValues.get(key) ?? null),
    multiRemove: jest.fn(async (keys: string[]) => { keys.forEach((key) => mockValues.delete(key)); }),
    removeItem: jest.fn(async (key: string) => { mockValues.delete(key); }),
    setItem: jest.fn(async (key: string, value: string) => { mockValues.set(key, value); }),
  },
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => mockRandomUUID() }));

import {
  clearPendingPrivacyActionsForAccount,
  completePrivacyAction,
  pendingPrivacyActionFor,
  resetPrivacyActionStateForTests,
} from '../privacy-action-state';

const firstKey = '30000000-0000-4000-8000-000000000001';
const secondKey = '30000000-0000-4000-8000-000000000002';

describe('privacy destructive action state', () => {
  beforeEach(() => {
    mockValues.clear();
    mockRandomUUID.mockReset().mockReturnValueOnce(firstKey).mockReturnValue(secondKey);
    resetPrivacyActionStateForTests();
  });

  it('serializes concurrent callers onto one persisted idempotency key', async () => {
    const [first, second] = await Promise.all([
      pendingPrivacyActionFor('account-1', 'delete_all_ai_results'),
      pendingPrivacyActionFor('account-1', 'delete_all_ai_results'),
    ]);

    expect(second).toEqual(first);
    expect(first.idempotencyKey).toBe(firstKey);
    expect(mockRandomUUID).toHaveBeenCalledTimes(1);

    resetPrivacyActionStateForTests();
    await expect(pendingPrivacyActionFor('account-1', 'delete_all_ai_results')).resolves.toEqual(first);
  });

  it('removes a receipt only after the matching operation completes', async () => {
    const first = await pendingPrivacyActionFor('account-1', 'clear_learning_data');
    await completePrivacyAction({ ...first, idempotencyKey: secondKey });
    await expect(pendingPrivacyActionFor('account-1', 'clear_learning_data')).resolves.toEqual(first);

    await completePrivacyAction(first);
    await expect(pendingPrivacyActionFor('account-1', 'clear_learning_data'))
      .resolves.toMatchObject({ idempotencyKey: secondKey });
  });

  it('clears only the deleted account receipts when an account id is supplied', async () => {
    await pendingPrivacyActionFor('account-1', 'delete_all_ai_results');
    await pendingPrivacyActionFor('account-2', 'clear_learning_data');

    await clearPendingPrivacyActionsForAccount('account-1');

    expect([...mockValues.keys()].some((key) => key.includes('.account-1.'))).toBe(false);
    expect([...mockValues.keys()].some((key) => key.includes('.account-2.'))).toBe(true);
  });

  it('clears every pending receipt during whole-account local cleanup', async () => {
    await pendingPrivacyActionFor('account-1', 'delete_all_ai_results');
    await pendingPrivacyActionFor('account-2', 'clear_learning_data');

    await clearPendingPrivacyActionsForAccount();

    expect(mockValues.size).toBe(0);
  });
});
