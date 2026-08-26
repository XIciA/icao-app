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
  afterCommit?: (values: readonly Record<string, unknown>[]) => void | Promise<void>,
) {
  let transactionTail = Promise.resolve();
  const executor = {
    execute: vi.fn(async () => undefined),
    insert: vi.fn(() => ({
      values: vi.fn(async (value: Record<string, unknown>) => {
        await beforeWrite?.(value);
        if (
          value.action === 'apple_server_reconciliation.batch_completed'
          && records.some((record) => (
            record.action === value.action && record.requestId === value.requestId
          ))
        ) throw new Error('duplicate_batch_completed');
        records.push({ sequence: records.length + 1, ...value });
      }),
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(async () => (
            [...records].sort((left, right) => Number(left.sequence) - Number(right.sequence))
          )),
        })),
      })),
    })),
  };
  return {
    database: {
      db: {
        ...executor,
        transaction: vi.fn(async (operation: (value: typeof executor) => Promise<unknown>) => {
          const previous = transactionTail;
          let release = () => {};
          transactionTail = new Promise<void>((resolve) => { release = resolve; });
          await previous;
          const originalLength = records.length;
          let callbackCompleted = false;
          try {
            const result = await operation(executor);
            callbackCompleted = true;
            await afterCommit?.(records.slice(originalLength));
            return result;
          } catch (error) {
            if (!callbackCompleted) records.splice(originalLength);
            throw error;
          } finally {
            release();
          }
        }),
      },
    } as unknown as DatabaseService,
    records,
  };
}

function reconciliationFixture(
  completionFailure: 'after_commit' | 'before_commit' | 'none' = 'before_commit',
) {
  let currentAccountId = ACCOUNT_ID;
  let currentTransactions = ['one', 'two'];
  let drift = false;
  const issued = new Set<string>();
  const appleServer = {
    loadTransactionHistory: vi.fn(async () => ({
      accountId: currentAccountId,
      pages: 1,
      transactions: currentTransactions.map((signed) => ({
        accountId: currentAccountId,
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
    const alreadyIssued = issued.has(signed);
    const action = alreadyIssued ? (drift ? 'refresh' as const : 'none' as const) : 'create' as const;
    if (apply && !alreadyIssued) issued.add(signed);
    return {
      accountId: currentAccountId,
      action,
      appleStatus: 'verified' as const,
      applied: apply && !alreadyIssued,
      environment,
      localStatus: alreadyIssued ? 'verified' as const : 'missing' as const,
      mismatch: action !== 'none',
      productKey: 'membership_7d_v1',
      transactionId: signed,
    };
  });
  let failCompletionOnce = completionFailure !== 'none';
  const shouldFailCompletion = (values: readonly Record<string, unknown>[]) => (
    failCompletionOnce
    && values.some((value) => (
      value.action === 'apple_server_reconciliation.batch_completed'
    ))
  );
  const { database, records } = auditDatabase(
    [],
    completionFailure === 'before_commit'
      ? (value) => {
        if (shouldFailCompletion([value])) {
          failCompletionOnce = false;
          throw new Error('simulated_finalization_audit_failure');
        }
      }
      : undefined,
    completionFailure === 'after_commit'
      ? (values) => {
        if (shouldFailCompletion(values)) {
          failCompletionOnce = false;
          throw new Error('simulated_commit_ack_failure');
        }
      }
      : undefined,
  );
  return {
    issued,
    reconcileAppleServerTransaction,
    records,
    service: new AppleServerReconciliationService(
      appleServer,
      { reconcileAppleServerTransaction } as unknown as CommerceService,
      database,
    ),
    setAccountId(value: string) { currentAccountId = value; },
    setDrift(value: boolean) { drift = value; },
    setTransactions(value: string[]) { currentTransactions = value; },
  };
}

async function createRecoverableBatch() {
  const fixture = reconciliationFixture('before_commit');
  const error = await fixture.service.reconcileTransactionHistory({
    apply: true,
    environment: 'sandbox',
    transactionId: 'anchor',
  }).catch((caught) => caught);
  if (!(error instanceof AppleServerReconciliationApplyError) || !error.result.recovery) {
    throw new Error('test_recoverable_batch_not_created');
  }
  return { error, fixture };
}

function rewriteStartedEvidence(
  records: Array<Record<string, unknown>>,
  index: number,
  changes: Record<string, unknown>,
) {
  const started = records.find((record) => (
    record.action === 'apple_server_reconciliation.batch_started'
  ))!;
  const metadata = started.metadata as Record<string, unknown>;
  const planned = metadata.planned as Array<Record<string, unknown>>;
  started.metadata = {
    ...metadata,
    planned: planned.map((report, reportIndex) => (
      reportIndex === index ? { ...report, ...changes } : report
    )),
  };
}

function rewriteCompletedEvidence(
  records: Array<Record<string, unknown>>,
  index: number,
  changes: Record<string, unknown>,
) {
  const items = records.filter((record) => (
    record.action === 'apple_server_reconciliation.item_completed'
  ));
  const item = items[index]!;
  item.metadata = {
    ...(item.metadata as Record<string, unknown>),
    ...changes,
  };

  const finalizationFailure = records.find((record) => (
    record.action === 'apple_server_reconciliation.batch_finalization_failed'
  ))!;
  const finalizationMetadata = finalizationFailure.metadata as Record<string, unknown>;
  const completed = (finalizationMetadata.completed as Array<Record<string, unknown>>)
    .map((report, reportIndex) => (
      reportIndex === index ? { ...report, ...changes } : report
    ));
  finalizationFailure.metadata = {
    ...finalizationMetadata,
    applied: completed.filter((report) => report.applied === true).length,
    completed,
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
      reconcileAppleServerTransaction: vi.fn(async (
        _signed: string,
        _environment: 'sandbox' | 'production',
        apply: boolean,
      ) => ({
        accountId: ACCOUNT_ID,
        action: 'refund' as const,
        appleStatus: 'refunded' as const,
        applied: apply,
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
      getTestNotificationStatus: vi.fn(),
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
      cumulativeBatchResult: { applied: 2, completed: 2 },
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

    const recovery = await service.reconcileTransactionHistory({
      apply: true,
      environment: 'sandbox',
      resumeBatchId: error.result.batchId,
      transactionId: 'anchor',
    });
    expect(recovery).toMatchObject({
      applied: 0,
      batchId: error.result.batchId,
      cumulativeBatchResult: { applied: 2, completed: 2 },
      status: 'completed',
    });
    expect(issued).toEqual(new Set(signedTransactions));
    expect(records.map((record) => record.action).slice(-2)).toEqual([
      'apple_server_reconciliation.batch_resumed',
      'apple_server_reconciliation.batch_completed',
    ]);
    const terminal = records.find((record) => (
      record.action === 'apple_server_reconciliation.batch_completed'
    ));
    expect(terminal?.metadata).toMatchObject({
      applied: 2,
      completed: [
        expect.objectContaining({ action: 'create', applied: true }),
        expect.objectContaining({ action: 'create', applied: true }),
      ],
    });
    expect(reconcileAppleServerTransaction.mock.calls.filter((call) => call[2])).toHaveLength(2);
  });

  it('rejects item evidence whose sequence does not increase with its index', async () => {
    const { error, fixture } = await createRecoverableBatch();
    const items = fixture.records.filter((record) => (
      record.action === 'apple_server_reconciliation.item_completed'
    ));
    const firstSequence = items[0]!.sequence;
    items[0]!.sequence = items[1]!.sequence;
    items[1]!.sequence = firstSequence;

    await expect(fixture.service.reconcileTransactionHistory({
      apply: true,
      environment: 'sandbox',
      resumeBatchId: error.result.batchId,
      transactionId: 'anchor',
    })).rejects.toThrow('apple_server_reconciliation_resume_evidence_incomplete');
  });

  it('rejects duplicate item indexes even when the item count is complete', async () => {
    const { error, fixture } = await createRecoverableBatch();
    const items = fixture.records.filter((record) => (
      record.action === 'apple_server_reconciliation.item_completed'
    ));
    items[1]!.metadata = {
      ...(items[1]!.metadata as Record<string, unknown>),
      index: 0,
    };

    await expect(fixture.service.reconcileTransactionHistory({
      apply: true,
      environment: 'sandbox',
      resumeBatchId: error.result.batchId,
      transactionId: 'anchor',
    })).rejects.toThrow('apple_server_reconciliation_resume_evidence_incomplete');
  });

  it('rejects finalization metadata that disagrees with original item results', async () => {
    const { error, fixture } = await createRecoverableBatch();
    const finalizationFailure = fixture.records.find((record) => (
      record.action === 'apple_server_reconciliation.batch_finalization_failed'
    ))!;
    const metadata = finalizationFailure.metadata as Record<string, unknown>;
    const completed = metadata.completed as Array<Record<string, unknown>>;
    finalizationFailure.metadata = {
      ...metadata,
      applied: 1,
      completed: [
        completed[0],
        { ...completed[1], action: 'none', applied: false },
      ],
    };

    await expect(fixture.service.reconcileTransactionHistory({
      apply: true,
      environment: 'sandbox',
      resumeBatchId: error.result.batchId,
      transactionId: 'anchor',
    })).rejects.toThrow('apple_server_reconciliation_resume_evidence_incomplete');
  });

  it('rejects a forged started report marked as already applied', async () => {
    const { error, fixture } = await createRecoverableBatch();
    rewriteStartedEvidence(fixture.records, 0, { applied: true });

    await expect(fixture.service.reconcileTransactionHistory({
      apply: true,
      environment: 'sandbox',
      resumeBatchId: error.result.batchId,
      transactionId: 'anchor',
    })).rejects.toThrow('apple_server_reconciliation_resume_evidence_invalid');
  });

  it('rejects started-plan mismatch metadata that disagrees with its action', async () => {
    const { error, fixture } = await createRecoverableBatch();
    rewriteStartedEvidence(fixture.records, 0, { mismatch: false });

    await expect(fixture.service.reconcileTransactionHistory({
      apply: true,
      environment: 'sandbox',
      resumeBatchId: error.result.batchId,
      transactionId: 'anchor',
    })).rejects.toThrow('apple_server_reconciliation_resume_evidence_invalid');
  });

  it.each([
    { action: 'blocked_account_closed', localStatus: 'missing' },
    { action: 'local_newer', localStatus: 'verified' },
  ] as const)('rejects forbidden $action actions in the started plan', async ({
    action,
    localStatus,
  }) => {
    const { error, fixture } = await createRecoverableBatch();
    rewriteStartedEvidence(fixture.records, 0, {
      action,
      applied: false,
      localStatus,
      mismatch: true,
    });

    await expect(fixture.service.reconcileTransactionHistory({
      apply: true,
      environment: 'sandbox',
      resumeBatchId: error.result.batchId,
      transactionId: 'anchor',
    })).rejects.toThrow('apple_server_reconciliation_resume_evidence_invalid');
  });

  it('rejects a started action and status combination the planner cannot produce', async () => {
    const { error, fixture } = await createRecoverableBatch();
    rewriteStartedEvidence(fixture.records, 0, {
      action: 'refund',
      applied: false,
      localStatus: 'missing',
      mismatch: true,
    });

    await expect(fixture.service.reconcileTransactionHistory({
      apply: true,
      environment: 'sandbox',
      resumeBatchId: error.result.batchId,
      transactionId: 'anchor',
    })).rejects.toThrow('apple_server_reconciliation_resume_evidence_invalid');
  });

  it.each([
    { action: 'blocked_account_closed', localStatus: 'missing' },
    { action: 'local_newer', localStatus: 'verified' },
  ] as const)('rejects forbidden $action actions in completed item evidence', async ({
    action,
    localStatus,
  }) => {
    const { error, fixture } = await createRecoverableBatch();
    rewriteCompletedEvidence(fixture.records, 0, {
      action,
      applied: false,
      localStatus,
      mismatch: true,
    });

    await expect(fixture.service.reconcileTransactionHistory({
      apply: true,
      environment: 'sandbox',
      resumeBatchId: error.result.batchId,
      transactionId: 'anchor',
    })).rejects.toThrow('apple_server_reconciliation_resume_evidence_invalid');
  });

  it('rejects a completed none action forged as applied', async () => {
    const { error, fixture } = await createRecoverableBatch();
    rewriteCompletedEvidence(fixture.records, 0, {
      action: 'none',
      applied: true,
      localStatus: 'verified',
      mismatch: false,
    });

    await expect(fixture.service.reconcileTransactionHistory({
      apply: true,
      environment: 'sandbox',
      resumeBatchId: error.result.batchId,
      transactionId: 'anchor',
    })).rejects.toThrow('apple_server_reconciliation_resume_evidence_invalid');
  });

  it('rejects a completed change action forged as not applied', async () => {
    const { error, fixture } = await createRecoverableBatch();
    rewriteCompletedEvidence(fixture.records, 0, {
      action: 'create',
      applied: false,
      localStatus: 'missing',
      mismatch: true,
    });

    await expect(fixture.service.reconcileTransactionHistory({
      apply: true,
      environment: 'sandbox',
      resumeBatchId: error.result.batchId,
      transactionId: 'anchor',
    })).rejects.toThrow('apple_server_reconciliation_resume_evidence_invalid');
  });

  it('rejects mismatch metadata that disagrees with the completed action', async () => {
    const { error, fixture } = await createRecoverableBatch();
    rewriteCompletedEvidence(fixture.records, 0, { mismatch: false });

    await expect(fixture.service.reconcileTransactionHistory({
      apply: true,
      environment: 'sandbox',
      resumeBatchId: error.result.batchId,
      transactionId: 'anchor',
    })).rejects.toThrow('apple_server_reconciliation_resume_evidence_invalid');
  });

  it('rejects an action and Apple/local status combination the planner cannot produce', async () => {
    const { error, fixture } = await createRecoverableBatch();
    rewriteCompletedEvidence(fixture.records, 0, {
      action: 'refund',
      applied: true,
      localStatus: 'missing',
      mismatch: true,
    });

    await expect(fixture.service.reconcileTransactionHistory({
      apply: true,
      environment: 'sandbox',
      resumeBatchId: error.result.batchId,
      transactionId: 'anchor',
    })).rejects.toThrow('apple_server_reconciliation_resume_evidence_invalid');
  });

  it.each([
    {
      changes: {
        action: 'record_refund',
        appleStatus: 'refunded',
        applied: true,
        localStatus: 'missing',
        mismatch: true,
      },
      field: 'Apple status',
    },
    { changes: { productKey: 'membership_31d_v1' }, field: 'product' },
    { changes: { transactionReferenceHash: 'f'.repeat(64) }, field: 'transaction hash' },
  ])('rejects a completed item whose $field differs from the started identity', async ({
    changes,
  }) => {
    const { error, fixture } = await createRecoverableBatch();
    rewriteCompletedEvidence(fixture.records, 0, changes);

    await expect(fixture.service.reconcileTransactionHistory({
      apply: true,
      environment: 'sandbox',
      resumeBatchId: error.result.batchId,
      transactionId: 'anchor',
    })).rejects.toThrow('apple_server_reconciliation_resume_evidence_incomplete');
  });

  it('accepts a legal local-state change between the started plan and item completion', async () => {
    const { error, fixture } = await createRecoverableBatch();
    rewriteCompletedEvidence(fixture.records, 0, {
      action: 'none',
      applied: false,
      localStatus: 'verified',
      mismatch: false,
    });

    await expect(fixture.service.reconcileTransactionHistory({
      apply: true,
      environment: 'sandbox',
      resumeBatchId: error.result.batchId,
      transactionId: 'anchor',
    })).resolves.toMatchObject({
      applied: 0,
      cumulativeBatchResult: { applied: 1, completed: 2 },
      status: 'completed',
    });
    const terminal = fixture.records.find((record) => (
      record.action === 'apple_server_reconciliation.batch_completed'
    ));
    expect(terminal?.metadata).toMatchObject({
      applied: 1,
      completed: [
        expect.objectContaining({ action: 'none', applied: false, localStatus: 'verified' }),
        expect.objectContaining({ action: 'create', applied: true, localStatus: 'missing' }),
      ],
    });
  });

  it('rejects an arbitrary resume UUID without durable batch evidence', async () => {
    const fixture = reconciliationFixture('none');
    await expect(fixture.service.reconcileTransactionHistory({
      apply: true,
      environment: 'sandbox',
      resumeBatchId: '00000000-0000-4000-8000-000000000099',
      transactionId: 'anchor',
    })).rejects.toThrow('apple_server_reconciliation_resume_batch_not_found');
    expect(fixture.issued.size).toBe(0);
  });

  it('rejects resume evidence bound to another account', async () => {
    const { error, fixture } = await createRecoverableBatch();
    fixture.setAccountId('00000000-0000-4000-8000-000000000002');
    await expect(fixture.service.reconcileTransactionHistory({
      apply: true,
      environment: 'sandbox',
      resumeBatchId: error.result.batchId,
      transactionId: 'anchor',
    })).rejects.toThrow('apple_server_reconciliation_resume_account_mismatch');
  });

  it('rejects resume evidence bound to another environment', async () => {
    const { error, fixture } = await createRecoverableBatch();
    await expect(fixture.service.reconcileTransactionHistory({
      apply: true,
      environment: 'production',
      resumeBatchId: error.result.batchId,
      transactionId: 'anchor',
    })).rejects.toThrow('apple_server_reconciliation_resume_environment_mismatch');
  });

  it('rejects a resume when the verified transaction plan fingerprint changed', async () => {
    const { error, fixture } = await createRecoverableBatch();
    fixture.setTransactions(['one', 'two', 'three']);
    await expect(fixture.service.reconcileTransactionHistory({
      apply: true,
      environment: 'sandbox',
      resumeBatchId: error.result.batchId,
      transactionId: 'anchor',
    })).rejects.toThrow('apple_server_reconciliation_resume_plan_mismatch');
  });

  it('requires a new batch when finalization-only resume detects local state drift', async () => {
    const { error, fixture } = await createRecoverableBatch();
    fixture.setDrift(true);
    const rejected = await fixture.service.reconcileTransactionHistory({
      apply: true,
      environment: 'sandbox',
      resumeBatchId: error.result.batchId,
      transactionId: 'anchor',
    }).catch((caught) => caught);
    expect(rejected).toBeInstanceOf(AppleServerReconciliationApplyError);
    expect(rejected).toMatchObject({
      message: 'apple_server_reconciliation_resume_state_drift',
      result: {
        applied: 0,
        failure: {
          code: 'apple_server_reconciliation_resume_requires_new_batch',
          index: 0,
          stage: 'plan',
        },
        status: 'rejected',
      },
    });
    expect(fixture.records.some((record) => (
      record.action === 'apple_server_reconciliation.batch_completed'
    ))).toBe(false);
    expect(fixture.reconcileAppleServerTransaction.mock.calls.filter((call) => call[2]))
      .toHaveLength(2);
  });

  it('rejects resume after the batch already has its unique completed terminal event', async () => {
    const { error, fixture } = await createRecoverableBatch();
    const input = {
      apply: true,
      environment: 'sandbox' as const,
      resumeBatchId: error.result.batchId,
      transactionId: 'anchor',
    };
    await expect(fixture.service.reconcileTransactionHistory(input)).resolves.toMatchObject({
      status: 'completed',
    });
    await expect(fixture.service.reconcileTransactionHistory(input))
      .rejects.toThrow('apple_server_reconciliation_resume_already_completed');
    expect(fixture.records.filter((record) => (
      record.action === 'apple_server_reconciliation.batch_completed'
    ))).toHaveLength(1);
  });

  it('serializes concurrent resumes so only one can complete the batch', async () => {
    const { error, fixture } = await createRecoverableBatch();
    const input = {
      apply: true,
      environment: 'sandbox' as const,
      resumeBatchId: error.result.batchId,
      transactionId: 'anchor',
    };
    const results = await Promise.allSettled([
      fixture.service.reconcileTransactionHistory(input),
      fixture.service.reconcileTransactionHistory(input),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected).toMatchObject({
      reason: expect.objectContaining({
        message: 'apple_server_reconciliation_resume_already_completed',
      }),
    });
    expect(fixture.records.filter((record) => (
      record.action === 'apple_server_reconciliation.batch_completed'
    ))).toHaveLength(1);
  });

  it('treats a committed batch_completed row as success after a lost commit acknowledgement', async () => {
    const fixture = reconciliationFixture('after_commit');
    await expect(fixture.service.reconcileTransactionHistory({
      apply: true,
      environment: 'sandbox',
      transactionId: 'anchor',
    })).resolves.toMatchObject({
      applied: 2,
      status: 'completed',
    });
    expect(fixture.records.filter((record) => (
      record.action === 'apple_server_reconciliation.batch_completed'
    ))).toHaveLength(1);
    expect(fixture.records.some((record) => (
      record.action === 'apple_server_reconciliation.batch_finalization_failed'
    ))).toBe(false);
  });
});
