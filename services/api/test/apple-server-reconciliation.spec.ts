import { Environment } from '@apple/app-store-server-library';
import { describe, expect, it, vi } from 'vitest';

import {
  AppleServerReconciliationApplyError,
  AppleServerReconciliationService,
} from '../src/commerce/apple-server-reconciliation.service';
import type {
  AppleStoreServerApiClient,
  AppleStoreServerApiClientFactory,
} from '../src/commerce/apple-store-server-api-client';
import { AppleStoreServerApiService } from '../src/commerce/apple-store-server-api.service';
import type { AppleStoreVerifier } from '../src/commerce/apple-store-verifier';
import type { CommerceService } from '../src/commerce/commerce.service';
import type { VerifiedAppleTransaction } from '../src/commerce/commerce-domain';
import type { DatabaseService } from '../src/database/database.service';

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

function auditDatabase(
  records: Array<Record<string, unknown>> = [],
  beforeWrite?: (value: Record<string, unknown>) => void | Promise<void>,
) {
  return {
    database: {
      db: {
        insert: vi.fn(() => ({
          values: vi.fn(async (value: Record<string, unknown>) => {
            await beforeWrite?.(value);
            records.push(value);
          }),
        })),
      },
    } as unknown as DatabaseService,
    records,
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
    const { database } = auditDatabase();
    const service = new AppleServerReconciliationService(appleServer, commerce, database);

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
    const { database } = auditDatabase();
    const service = new AppleServerReconciliationService(appleServer, commerce, database);
    await expect(service.reconcileTransactionHistory({
      apply: true,
      environment: 'production',
      transactionId: 'anchor',
    })).resolves.toMatchObject({ applied: 1, mismatches: 1, mode: 'apply' });
    expect(commerce.reconcileAppleServerTransaction).toHaveBeenNthCalledWith(
      1,
      'refund',
      'production',
      false,
    );
    expect(commerce.reconcileAppleServerTransaction).toHaveBeenNthCalledWith(
      2,
      'refund',
      'production',
      true,
    );
  });

  it('applies the newer refunded anchor instead of stale active history', async () => {
    const active = transaction('anchor');
    const refunded = transaction('anchor');
    const client = {
      getTransactionInfo: vi.fn(async () => ({ signedTransactionInfo: 'anchor-refunded' })),
      getTransactionHistory: vi.fn(async () => ({
        appAppleId: 1_234_567_890,
        bundleId: 'com.readyoufife.ios',
        environment: Environment.SANDBOX,
        hasMore: false,
        revision: 'complete',
        signedTransactions: ['history-active'],
      })),
      requestTestNotification: vi.fn(),
    } as AppleStoreServerApiClient;
    const values = {
      'history-active': { ...active, signedDate: new Date(1), signedPayloadHash: 'a'.repeat(64) },
      'anchor-refunded': {
        ...refunded,
        revocationDate: new Date(3),
        signedDate: new Date(2),
        signedPayloadHash: 'b'.repeat(64),
      },
    };
    const appleVerifier: AppleStoreVerifier = {
      verifyNotification: async () => { throw new Error('not_used'); },
      verifyTransaction: vi.fn(async (signed) => values[signed as keyof typeof values]),
    };
    const factory: AppleStoreServerApiClientFactory = { forEnvironment: () => client };
    const appleServer = new AppleStoreServerApiService(
      { appleIapAppAppleId: 1_234_567_890, appleIapBundleId: 'com.readyoufife.ios' },
      factory,
      appleVerifier,
    );
    const reconcileAppleServerTransaction = vi.fn(async (
      signed: string,
      environment: 'sandbox' | 'production',
      apply: boolean,
    ) => ({
      accountId: ACCOUNT_ID,
      action: 'refund' as const,
      appleStatus: 'refunded' as const,
      applied: apply,
      environment,
      localStatus: 'verified' as const,
      mismatch: true,
      productKey: 'membership_7d_v1',
      transactionId: 'anchor',
    }));
    const { database } = auditDatabase();
    const service = new AppleServerReconciliationService(
      appleServer,
      { reconcileAppleServerTransaction } as unknown as CommerceService,
      database,
    );

    await expect(service.reconcileTransactionHistory({
      apply: true,
      environment: 'sandbox',
      transactionId: 'anchor',
    })).resolves.toMatchObject({ applied: 1, status: 'completed' });
    expect(reconcileAppleServerTransaction).toHaveBeenCalledTimes(2);
    expect(reconcileAppleServerTransaction.mock.calls.every((call) => (
      call[0] === 'anchor-refunded'
    ))).toBe(true);
  });

  it('records completed items and returns a resumable report when apply fails midway', async () => {
    const signedTransactions = ['one', 'two', 'three'];
    const appleServer = {
      loadTransactionHistory: vi.fn(async () => ({
        accountId: ACCOUNT_ID,
        pages: 1,
        transactions: signedTransactions.map((signed) => ({
          accountId: ACCOUNT_ID,
          productKey: 'membership_7d_v1',
          signedTransaction: signed,
          transaction: transaction(signed),
        })),
      })),
    } as unknown as AppleStoreServerApiService;
    const reconcileAppleServerTransaction = vi.fn(async (
      signed: string,
      environment: 'sandbox' | 'production',
      apply: boolean,
    ) => {
      if (apply && signed === 'two') throw new Error('simulated_apply_failure');
      return {
        accountId: ACCOUNT_ID,
        action: 'create' as const,
        appleStatus: 'verified' as const,
        applied: apply,
        environment,
        localStatus: 'missing' as const,
        mismatch: true,
        productKey: 'membership_7d_v1',
        transactionId: signed,
      };
    });
    const { database, records } = auditDatabase();
    const service = new AppleServerReconciliationService(
      appleServer,
      { reconcileAppleServerTransaction } as unknown as CommerceService,
      database,
    );

    const error = await service.reconcileTransactionHistory({
      apply: true,
      environment: 'sandbox',
      transactionId: 'anchor',
    }).catch((caught) => caught);
    expect(error).toBeInstanceOf(AppleServerReconciliationApplyError);
    expect(error.result).toMatchObject({
      applied: 1,
      checked: 3,
      failure: { code: 'simulated_apply_failure', index: 1 },
      status: 'failed',
      transactions: [expect.objectContaining({ transactionId: 'one' })],
    });
    expect(reconcileAppleServerTransaction.mock.calls.slice(0, 3).every((call) => (
      call[2] === false
    ))).toBe(true);
    expect(records.map((record) => record.action)).toEqual([
      'apple_server_reconciliation.batch_started',
      'apple_server_reconciliation.item_completed',
      'apple_server_reconciliation.batch_failed',
    ]);
    expect(JSON.stringify(records)).not.toContain('one');
    expect(JSON.stringify(records)).not.toContain('two');
  });

  it('reports finalization failure and resumes the same batch without duplicate benefits', async () => {
    const signedTransactions = ['one', 'two'];
    const appleServer = {
      loadTransactionHistory: vi.fn(async () => ({
        accountId: ACCOUNT_ID,
        pages: 1,
        transactions: signedTransactions.map((signed) => ({
          accountId: ACCOUNT_ID,
          productKey: 'membership_7d_v1',
          signedTransaction: signed,
          transaction: transaction(signed),
        })),
      })),
    } as unknown as AppleStoreServerApiService;
    const issued = new Set<string>();
    const reconcileAppleServerTransaction = vi.fn(async (
      signed: string,
      environment: 'sandbox' | 'production',
      apply: boolean,
    ) => {
      const alreadyIssued = issued.has(signed);
      if (apply && !alreadyIssued) issued.add(signed);
      return {
        accountId: ACCOUNT_ID,
        action: alreadyIssued ? 'none' as const : 'create' as const,
        appleStatus: 'verified' as const,
        applied: apply && !alreadyIssued,
        environment,
        localStatus: alreadyIssued ? 'verified' as const : 'missing' as const,
        mismatch: !alreadyIssued,
        productKey: 'membership_7d_v1',
        transactionId: signed,
      };
    });
    let failCompletionOnce = true;
    const { database, records } = auditDatabase([], (value) => {
      if (
        value.action === 'apple_server_reconciliation.batch_completed'
        && failCompletionOnce
      ) {
        failCompletionOnce = false;
        throw new Error('simulated_finalization_audit_failure');
      }
    });
    const service = new AppleServerReconciliationService(
      appleServer,
      { reconcileAppleServerTransaction } as unknown as CommerceService,
      database,
    );

    const error = await service.reconcileTransactionHistory({
      apply: true,
      environment: 'sandbox',
      transactionId: 'anchor',
    }).catch((caught) => caught);
    expect(error).toBeInstanceOf(AppleServerReconciliationApplyError);
    expect(error.result).toMatchObject({
      applied: 2,
      checked: 2,
      failure: {
        code: 'simulated_finalization_audit_failure',
        index: 2,
        stage: 'batch_completed_audit',
      },
      recovery: { resumeBatchId: error.result.batchId },
      status: 'finalization_failed',
      transactions: [
        expect.objectContaining({ applied: true, transactionId: 'one' }),
        expect.objectContaining({ applied: true, transactionId: 'two' }),
      ],
    });
    expect(issued).toEqual(new Set(signedTransactions));
    expect(records.map((record) => record.action)).toEqual([
      'apple_server_reconciliation.batch_started',
      'apple_server_reconciliation.item_completed',
      'apple_server_reconciliation.item_completed',
      'apple_server_reconciliation.batch_finalization_failed',
    ]);

    await expect(service.reconcileTransactionHistory({
      apply: true,
      environment: 'sandbox',
      resumeBatchId: error.result.batchId,
      transactionId: 'anchor',
    })).resolves.toMatchObject({
      applied: 0,
      batchId: error.result.batchId,
      status: 'completed',
    });
    expect(issued).toEqual(new Set(signedTransactions));
    expect(records.map((record) => record.action).slice(-4)).toEqual([
      'apple_server_reconciliation.batch_resumed',
      'apple_server_reconciliation.item_completed',
      'apple_server_reconciliation.item_completed',
      'apple_server_reconciliation.batch_completed',
    ]);
  });
});
