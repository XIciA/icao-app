import { describe, expect, it, vi } from 'vitest';

import { AppleServerReconciliationService } from '../src/commerce/apple-server-reconciliation.service';
import type { AppleStoreServerApiService } from '../src/commerce/apple-store-server-api.service';
import type { CommerceService } from '../src/commerce/commerce.service';
import type { VerifiedAppleTransaction } from '../src/commerce/commerce-domain';

const ACCOUNT_ID = '00000000-0000-4000-8000-000000000001';

function transaction(transactionId: string): VerifiedAppleTransaction {
  return {
    environment: 'sandbox',
    transactionId,
    originalTransactionId: 'anchor',
    productId: 'com.readyoufife.ios.membership.7d.v1',
    bundleId: 'com.readyoufife.ios',
    appAccountToken: ACCOUNT_ID,
    purchaseDate: new Date(0),
    signedDate: new Date(1),
    productType: 'non_renewing_subscription',
    quantity: 1,
    signedPayloadHash: transactionId.padEnd(64, '0'),
    decodedPayload: {},
  };
}

describe('AppleServerReconciliationService', () => {
  it('reports mismatches in dry-run and never asks commerce to apply them', async () => {
    const appleServer = {
      loadTransactionHistory: vi.fn(async () => ({
        accountId: ACCOUNT_ID,
        pages: 2,
        transactions: [
          { accountId: ACCOUNT_ID, productKey: 'membership_7d_v1', signedTransaction: 'one', transaction: transaction('one') },
          { accountId: ACCOUNT_ID, productKey: 'membership_7d_v1', signedTransaction: 'refund', transaction: transaction('refund') },
        ],
      })),
    } as unknown as AppleStoreServerApiService;
    const reconcileAppleServerTransaction = vi.fn(async (
      signedTransaction: string,
      environment: 'sandbox' | 'production',
      apply: boolean,
    ) => ({
      accountId: ACCOUNT_ID,
      action: signedTransaction === 'refund' ? 'refund' as const : 'none' as const,
      appleStatus: signedTransaction === 'refund' ? 'refunded' as const : 'verified' as const,
      applied: apply,
      environment,
      localStatus: 'verified' as const,
      mismatch: signedTransaction === 'refund',
      productKey: 'membership_7d_v1',
      transactionId: signedTransaction,
    }));
    const commerce = { reconcileAppleServerTransaction } as unknown as CommerceService;
    const service = new AppleServerReconciliationService(appleServer, commerce);

    await expect(service.reconcileTransactionHistory({
      apply: false,
      environment: 'sandbox',
      transactionId: 'anchor',
    })).resolves.toMatchObject({
      applied: 0,
      checked: 2,
      environment: 'sandbox',
      mismatches: 1,
      mode: 'dry_run',
      pages: 2,
    });
    expect(reconcileAppleServerTransaction).toHaveBeenCalledTimes(2);
    expect(reconcileAppleServerTransaction.mock.calls.every((call) => call[2] === false)).toBe(true);
  });

  it('uses the idempotent commerce entry for apply, including refunded transactions', async () => {
    const appleServer = {
      loadTransactionHistory: vi.fn(async () => ({
        accountId: ACCOUNT_ID,
        pages: 1,
        transactions: [
          { accountId: ACCOUNT_ID, productKey: 'membership_7d_v1', signedTransaction: 'refund', transaction: transaction('refund') },
        ],
      })),
    } as unknown as AppleStoreServerApiService;
    const commerce = {
      reconcileAppleServerTransaction: vi.fn(async () => ({
        accountId: ACCOUNT_ID,
        action: 'refund' as const,
        appleStatus: 'refunded' as const,
        applied: true,
        environment: 'production' as const,
        localStatus: 'verified' as const,
        mismatch: true,
        productKey: 'membership_7d_v1',
        transactionId: 'refund',
      })),
    } as unknown as CommerceService;
    const service = new AppleServerReconciliationService(appleServer, commerce);
    await expect(service.reconcileTransactionHistory({
      apply: true,
      environment: 'production',
      transactionId: 'anchor',
    })).resolves.toMatchObject({ applied: 1, mismatches: 1, mode: 'apply' });
    expect(commerce.reconcileAppleServerTransaction)
      .toHaveBeenCalledWith('refund', 'production', true);
  });
});
