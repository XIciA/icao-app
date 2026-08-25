import { createHash, randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { opsAuditEvents } from '../database/schema';
import { DatabaseService } from '../database/database.service';
import type { CommerceEnvironment } from './product-catalog';
import { AppleStoreServerApiService } from './apple-store-server-api.service';
import {
  CommerceService,
  type AppleCommerceReconciliationReport,
} from './commerce.service';

export type AppleServerReconciliationResult = Readonly<{
  accountId: string;
  applied: number;
  batchId?: string;
  checked: number;
  environment: CommerceEnvironment;
  mismatches: number;
  mode: 'apply' | 'dry_run';
  pages: number;
  status: 'completed' | 'dry_run';
  transactions: readonly AppleCommerceReconciliationReport[];
}>;

export type AppleServerReconciliationFailureResult = Readonly<{
  accountId: string;
  applied: number;
  batchId: string;
  checked: number;
  environment: CommerceEnvironment;
  failure: Readonly<{
    code: string;
    index: number;
    stage: 'apply_item' | 'batch_completed_audit' | 'plan';
    transactionReferenceHash?: string;
  }>;
  mode: 'apply';
  pages: number;
  planned: readonly AppleCommerceReconciliationReport[];
  recovery?: Readonly<{
    resumeBatchId: string;
  }>;
  status: 'failed' | 'finalization_failed' | 'rejected';
  transactions: readonly AppleCommerceReconciliationReport[];
}>;

export class AppleServerReconciliationApplyError extends Error {
  constructor(
    message: string,
    readonly result: AppleServerReconciliationFailureResult,
  ) {
    super(message);
  }
}

function transactionReferenceHash(transactionId: string) {
  return createHash('sha256').update(`apple-reconciliation-v1\0${transactionId}`).digest('hex');
}

function safeFailureCode(error: unknown) {
  const candidate = error instanceof Error ? error.message : '';
  return /^[a-z0-9_:-]{1,120}$/u.test(candidate)
    ? candidate
    : 'apple_server_reconciliation_item_failed';
}

function isReconciliationBatchId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(value);
}

@Injectable()
export class AppleServerReconciliationService {
  constructor(
    private readonly appleServer: AppleStoreServerApiService,
    private readonly commerce: CommerceService,
    private readonly database: DatabaseService,
  ) {}

  async reconcileTransactionHistory(input: Readonly<{
    apply: boolean;
    environment: CommerceEnvironment;
    maxPages?: number;
    maxTransactions?: number;
    resumeBatchId?: string;
    transactionId: string;
  }>): Promise<AppleServerReconciliationResult> {
    if (input.resumeBatchId && (!input.apply || !isReconciliationBatchId(input.resumeBatchId))) {
      throw new Error('apple_server_reconciliation_resume_batch_id_invalid');
    }
    const history = await this.appleServer.loadTransactionHistory(
      input.environment,
      input.transactionId,
      {
        maxPages: input.maxPages,
        maxTransactions: input.maxTransactions,
      },
    );
    // Resolve every local action before the first write. Apple network access
    // has already finished, and no database transaction is held across it.
    const plan: AppleCommerceReconciliationReport[] = [];
    for (const item of history.transactions) {
      plan.push(await this.commerce.reconcileAppleServerTransaction(
        item.signedTransaction,
        input.environment,
        false,
      ));
    }
    if (!input.apply) {
      return this.result(history, input.environment, false, plan);
    }

    const batchId = input.resumeBatchId ?? randomUUID();
    const rejectedIndex = plan.findIndex((item) => (
      item.action === 'blocked_account_closed' || item.action === 'local_newer'
    ));
    if (rejectedIndex >= 0) {
      const rejected = plan[rejectedIndex]!;
      const failure = {
        code: `apple_server_reconciliation_${rejected.action}`,
        index: rejectedIndex,
        stage: 'plan' as const,
        transactionReferenceHash: transactionReferenceHash(rejected.transactionId),
      } as const;
      await this.auditBatch('apple_server_reconciliation.batch_rejected', {
        accountId: history.accountId,
        batchId,
        environment: input.environment,
        metadata: { failure, planned: this.auditPlan(plan) },
      });
      throw new AppleServerReconciliationApplyError(
        'apple_server_reconciliation_plan_rejected',
        {
          accountId: history.accountId,
          applied: 0,
          batchId,
          checked: plan.length,
          environment: input.environment,
          failure,
          mode: 'apply',
          pages: history.pages,
          planned: plan,
          status: 'rejected',
          transactions: [],
        },
      );
    }

    await this.auditBatch(
      input.resumeBatchId
        ? 'apple_server_reconciliation.batch_resumed'
        : 'apple_server_reconciliation.batch_started',
      {
        accountId: history.accountId,
        batchId,
        environment: input.environment,
        metadata: {
          planned: this.auditPlan(plan),
          resumed: Boolean(input.resumeBatchId),
        },
      },
    );
    const completed: AppleCommerceReconciliationReport[] = [];
    for (const [index, item] of history.transactions.entries()) {
      try {
        const report = await this.commerce.reconcileAppleServerTransaction(
          item.signedTransaction,
          input.environment,
          true,
        );
        if (
          report.action === 'blocked_account_closed'
          || report.action === 'local_newer'
        ) throw new Error(`apple_server_reconciliation_${report.action}`);
        completed.push(report);
        await this.auditBatch('apple_server_reconciliation.item_completed', {
          accountId: history.accountId,
          batchId,
          environment: input.environment,
          metadata: {
            action: report.action,
            applied: report.applied,
            index,
            productKey: report.productKey,
            transactionReferenceHash: transactionReferenceHash(report.transactionId),
          },
        });
      } catch (error) {
        const failure = {
          code: safeFailureCode(error),
          index,
          stage: 'apply_item' as const,
          transactionReferenceHash: transactionReferenceHash(item.transaction.transactionId),
        };
        try {
          await this.auditBatch('apple_server_reconciliation.batch_failed', {
            accountId: history.accountId,
            batchId,
            environment: input.environment,
            metadata: {
              applied: completed.filter((report) => report.applied).length,
              completed: this.auditPlan(completed),
              failure,
            },
          });
        } catch {
          // The append-only batch_started event remains the durable incomplete
          // marker. Preserve the per-item CLI report even if the failure audit
          // cannot be appended during the same infrastructure incident.
        }
        throw new AppleServerReconciliationApplyError(
          'apple_server_reconciliation_apply_failed',
          {
            accountId: history.accountId,
            applied: completed.filter((report) => report.applied).length,
            batchId,
            checked: plan.length,
            environment: input.environment,
            failure,
            mode: 'apply',
            pages: history.pages,
            planned: plan,
            status: 'failed',
            transactions: completed,
          },
        );
      }
    }
    try {
      await this.auditBatch('apple_server_reconciliation.batch_completed', {
        accountId: history.accountId,
        batchId,
        environment: input.environment,
        metadata: {
          applied: completed.filter((report) => report.applied).length,
          completed: this.auditPlan(completed),
        },
      });
    } catch (error) {
      const failure = {
        code: safeFailureCode(error),
        index: completed.length,
        stage: 'batch_completed_audit' as const,
      };
      try {
        await this.auditBatch('apple_server_reconciliation.batch_finalization_failed', {
          accountId: history.accountId,
          batchId,
          environment: input.environment,
          metadata: {
            applied: completed.filter((report) => report.applied).length,
            completed: this.auditPlan(completed),
            failure,
            recovery: { resumeBatchId: batchId },
          },
        });
      } catch {
        // The started/resumed and per-item events still prove the business
        // writes completed. Preserve the recovery handle in the CLI result.
      }
      throw new AppleServerReconciliationApplyError(
        'apple_server_reconciliation_finalization_failed',
        {
          accountId: history.accountId,
          applied: completed.filter((report) => report.applied).length,
          batchId,
          checked: plan.length,
          environment: input.environment,
          failure,
          mode: 'apply',
          pages: history.pages,
          planned: plan,
          recovery: { resumeBatchId: batchId },
          status: 'finalization_failed',
          transactions: completed,
        },
      );
    }
    return {
      ...this.result(history, input.environment, true, completed),
      batchId,
      status: 'completed',
    };
  }

  private auditPlan(reports: readonly AppleCommerceReconciliationReport[]) {
    return reports.map((report) => ({
      action: report.action,
      appleStatus: report.appleStatus,
      applied: report.applied,
      localStatus: report.localStatus,
      productKey: report.productKey,
      transactionReferenceHash: transactionReferenceHash(report.transactionId),
    }));
  }

  private async auditBatch(
    action: string,
    input: Readonly<{
      accountId: string;
      batchId: string;
      environment: CommerceEnvironment;
      metadata: Record<string, unknown>;
    }>,
  ) {
    await this.database.db.insert(opsAuditEvents).values({
      requestId: input.batchId,
      actorStaffId: null,
      actorRole: null,
      action,
      targetType: 'apple_server_reconciliation',
      targetId: input.accountId,
      reason: 'App Store Server verified transaction reconciliation',
      metadata: {
        batchId: input.batchId,
        environment: input.environment,
        ...input.metadata,
      },
    });
  }

  private result(
    history: Readonly<{ accountId: string; pages: number }>,
    environment: CommerceEnvironment,
    apply: boolean,
    transactions: readonly AppleCommerceReconciliationReport[],
  ): AppleServerReconciliationResult {
    return {
      accountId: history.accountId,
      applied: transactions.filter((item) => item.applied).length,
      checked: transactions.length,
      environment,
      mismatches: transactions.filter((item) => item.mismatch).length,
      mode: apply ? 'apply' : 'dry_run',
      pages: history.pages,
      status: apply ? 'completed' : 'dry_run',
      transactions,
    };
  }
}
