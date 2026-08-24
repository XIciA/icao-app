/* eslint-disable import/first */
const mockValues = new Map<string, string>();

jest.mock('@/platform/storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key: string) => mockValues.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => { mockValues.set(key, value); }),
    removeItem: jest.fn(async (key: string) => { mockValues.delete(key); }),
  },
}));

import Storage from '@/platform/storage';

import {
  clearUncertainPurchase,
  loadUncertainPurchase,
  persistUncertainPurchase,
} from '../commerce-uncertain-purchase.native';

const accountId = '10000000-0000-4000-8000-000000000101';

describe('uncertain purchase persistence', () => {
  beforeEach(() => {
    mockValues.clear();
    jest.clearAllMocks();
  });

  it('persists and restores an account-scoped purchase lock', async () => {
    const value = {
      accountId,
      offeringKey: 'membership_31d_v1' as const,
      startedAt: '2026-08-24T08:30:00.000Z',
      baselineTransactionReferences: ['old-transaction', 'old-transaction'],
    };

    await persistUncertainPurchase(value);

    await expect(loadUncertainPurchase(accountId)).resolves.toEqual({
      state: 'pending',
      purchase: {
        ...value,
        baselineTransactionReferences: ['old-transaction'],
      },
    });
    expect(Storage.setItem).toHaveBeenCalledTimes(1);
  });

  it('fails closed without deleting malformed data', async () => {
    const key = `icao.commerce.uncertain-purchase.v1.${accountId}`;
    mockValues.set(key, JSON.stringify({ accountId, offeringKey: 'unknown' }));

    await expect(loadUncertainPurchase(accountId)).resolves.toEqual({ state: 'invalid' });
    expect(Storage.removeItem).not.toHaveBeenCalled();
  });

  it('fails closed when storage cannot be read', async () => {
    jest.mocked(Storage.getItem).mockRejectedValueOnce(new Error('sqlite_unavailable'));

    await expect(loadUncertainPurchase(accountId)).resolves.toEqual({ state: 'invalid' });
  });

  it('clears only the current account lock', async () => {
    const otherAccountId = '10000000-0000-4000-8000-000000000202';
    mockValues.set(`icao.commerce.uncertain-purchase.v1.${accountId}`, '{}');
    mockValues.set(`icao.commerce.uncertain-purchase.v1.${otherAccountId}`, '{}');

    await clearUncertainPurchase(accountId);

    expect(mockValues.has(`icao.commerce.uncertain-purchase.v1.${accountId}`)).toBe(false);
    expect(mockValues.has(`icao.commerce.uncertain-purchase.v1.${otherAccountId}`)).toBe(true);
  });
});
