import { createHash, randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';

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
  cumulativeBatchResult?: Readonly<{
    applied: number;
    completed: number;
  }>;
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
  cumulativeBatchResult?: Readonly<{
    applied: number;
    completed: number;
  }>;
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

class AppleServerReconciliationStateError extends Error {}

type ReconciliationTransaction = Parameters<
  Parameters<DatabaseService['db']['transaction']>[0]
>[0];

type AuditEvent = Readonly<{
  action: string;
  metadata: unknown;
  sequence: number;
  targetId: string | null;
}>;

type BatchEvidence = Readonly<{
  accountId: string;
  batchId: string;
  environment: CommerceEnvironment;
  itemIdentities: readonly Readonly<{
    appleStatus: AppleCommerceReconciliationReport['appleStatus'];
    productKey: string;
    transactionReferenceHash: string;
  }>[];
  planFingerprint: string;
}>;

type AuditedReconciliationReport = Readonly<{
  action: AppleCommerceReconciliationReport['action'];
  appleStatus: AppleCommerceReconciliationReport['appleStatus'];
  applied: boolean;
  localStatus: AppleCommerceReconciliationReport['localStatus'];
  mismatch: boolean;
  productKey: string;
  transactionReferenceHash: string;
}>;

type CumulativeBatchResult = Readonly<{
  applied: number;
  completed: readonly AuditedReconciliationReport[];
}>;

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

function metadataRecord(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AppleServerReconciliationStateError(
      'apple_server_reconciliation_resume_evidence_invalid',
    );
  }
  return value as Record<string, unknown>;
}

function auditedReport(value: unknown): AuditedReconciliationReport {
  const report = metadataRecord(value);
  const actions: readonly AppleCommerceReconciliationReport['action'][] = [
    'blocked_account_closed',
    'create',
    'local_newer',
    'none',
    'record_refund',
    'refresh',
    'refund',
    'restore',
  ];
  const appleStatuses: readonly AppleCommerceReconciliationReport['appleStatus'][] = [
    'refunded',
    'verified',
  ];
  const localStatuses: readonly AppleCommerceReconciliationReport['localStatus'][] = [
    'missing',
    'refunded',
    'revoked',
    'verified',
  ];
  if (
    !actions.includes(report.action as AppleCommerceReconciliationReport['action'])
    || !appleStatuses.includes(report.appleStatus as AppleCommerceReconciliationReport['appleStatus'])
    || typeof report.applied !== 'boolean'
    || !localStatuses.includes(report.localStatus as AppleCommerceReconciliationReport['localStatus'])
    || typeof report.mismatch !== 'boolean'
    || typeof report.productKey !== 'string'
    || !/^[a-f0-9]{64}$/u.test(String(report.transactionReferenceHash))
  ) {
    throw new AppleServerReconciliationStateError(
      'apple_server_reconciliation_resume_evidence_invalid',
    );
  }
  return {
    action: report.action as AppleCommerceReconciliationReport['action'],
    appleStatus: report.appleStatus as AppleCommerceReconciliationReport['appleStatus'],
    applied: report.applied,
    localStatus: report.localStatus as AppleCommerceReconciliationReport['localStatus'],
    mismatch: report.mismatch,
    productKey: report.productKey,
    transactionReferenceHash: String(report.transactionReferenceHash),
  };
}

function auditedReports(value: unknown) {
  if (!Array.isArray(value)) {
    throw new AppleServerReconciliationStateError(
      'apple_server_reconciliation_resume_evidence_invalid',
    );
  }
  return value.map(auditedReport);
}

function sameAuditedReport(
  left: AuditedReconciliationReport,
  right: AuditedReconciliationReport,
) {
  return left.action === right.action
    && left.appleStatus === right.appleStatus
    && left.applied === right.applied
    && left.localStatus === right.localStatus
    && left.mismatch === right.mismatch
    && left.productKey === right.productKey
    && left.transactionReferenceHash === right.transactionReferenceHash;
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
    // Apple network access finishes before any batch transaction or advisory
    // lock. The local plan is also complete before the first business write.
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

    const planFingerprint = this.planFingerprint(
      history.accountId,
      input.environment,
      plan,
    );
    const evidence: BatchEvidence = {
      accountId: history.accountId,
      batchId: input.resumeBatchId ?? randomUUID(),
      environment: input.environment,
      itemIdentities: plan.map((report) => ({
        appleStatus: report.appleStatus,
        productKey: report.productKey,
        transactionReferenceHash: transactionReferenceHash(report.transactionId),
      })),
      planFingerprint,
    };
    if (input.resumeBatchId) {
      return this.resumeFinalization(history, input.environment, plan, evidence);
    }

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
        ...evidence,
        metadata: { failure, planned: this.auditPlan(plan) },
      });
      throw new AppleServerReconciliationApplyError(
        'apple_server_reconciliation_plan_rejected',
        {
          accountId: history.accountId,
          applied: 0,
          batchId: evidence.batchId,
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

    await this.withBatchLock(evidence.batchId, async (transaction) => {
      await this.auditBatch('apple_server_reconciliation.batch_started', {
        ...evidence,
        metadata: { planned: this.auditPlan(plan) },
      }, transaction);
    });
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
          ...evidence,
          metadata: {
            action: report.action,
            appleStatus: report.appleStatus,
            applied: report.applied,
            index,
            localStatus: report.localStatus,
            mismatch: report.mismatch,
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
            ...evidence,
            metadata: {
              applied: completed.filter((report) => report.applied).length,
              completed: this.auditPlan(completed),
              failure,
            },
          });
        } catch {
          // The append-only started event remains the durable incomplete
          // marker. Preserve the per-item CLI report during an audit outage.
        }
        throw new AppleServerReconciliationApplyError(
          'apple_server_reconciliation_apply_failed',
          {
            accountId: history.accountId,
            applied: completed.filter((report) => report.applied).length,
            batchId: evidence.batchId,
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

    const batchCompletion = await this.completeBatch(
      history,
      plan,
      completed,
      evidence,
      false,
    );
    return {
      ...this.result(history, input.environment, true, completed),
      batchId: evidence.batchId,
      cumulativeBatchResult: this.cumulativeSummary(batchCompletion.cumulativeBatchResult),
      status: 'completed',
    };
  }

  private async resumeFinalization(
    history: Awaited<ReturnType<AppleStoreServerApiService['loadTransactionHistory']>>,
    environment: CommerceEnvironment,
    plan: readonly AppleCommerceReconciliationReport[],
    evidence: BatchEvidence,
  ) {
    const batchCompletion = await this.completeBatch(
      history,
      plan,
      plan,
      evidence,
      true,
      async () => {
        const lockedPlan: AppleCommerceReconciliationReport[] = [];
        for (const item of history.transactions) {
          lockedPlan.push(await this.commerce.reconcileAppleServerTransaction(
            item.signedTransaction,
            environment,
            false,
          ));
        }
        return lockedPlan;
      },
    );
    return {
      ...this.result(history, environment, true, batchCompletion.reports),
      batchId: evidence.batchId,
      cumulativeBatchResult: this.cumulativeSummary(batchCompletion.cumulativeBatchResult),
      status: 'completed' as const,
    };
  }

  private async completeBatch(
    history: Readonly<{ accountId: string; pages: number }>,
    plan: readonly AppleCommerceReconciliationReport[],
    completed: readonly AppleCommerceReconciliationReport[],
    evidence: BatchEvidence,
    resume: boolean,
    refreshResumePlan?: () => Promise<readonly AppleCommerceReconciliationReport[]>,
  ) {
    let finalPlan = plan;
    let finalCompleted = completed;
    let cumulativeBatchResult: CumulativeBatchResult | undefined;
    try {
      await this.withBatchLock(evidence.batchId, async (transaction) => {
        const events = await this.batchEvents(evidence.batchId, transaction);
        const state = this.assertBatchEvidence(events, evidence, {
          allowCompleted: false,
          requireFinalizationFailure: resume,
        });
        cumulativeBatchResult = state.cumulativeBatchResult;
        if (resume) {
          finalPlan = await refreshResumePlan!();
          finalCompleted = finalPlan;
          if (this.planFingerprint(
            history.accountId,
            evidence.environment,
            finalPlan,
          ) !== evidence.planFingerprint) {
            throw new AppleServerReconciliationStateError(
              'apple_server_reconciliation_resume_plan_mismatch',
            );
          }
        }
        const driftIndex = resume
          ? finalPlan.findIndex((report) => report.action !== 'none')
          : -1;
        if (driftIndex >= 0) {
          const drift = finalPlan[driftIndex]!;
          throw new AppleServerReconciliationApplyError(
            'apple_server_reconciliation_resume_state_drift',
            {
              accountId: history.accountId,
              applied: 0,
              batchId: evidence.batchId,
              checked: finalPlan.length,
              environment: evidence.environment,
              failure: {
                code: 'apple_server_reconciliation_resume_requires_new_batch',
                index: driftIndex,
                stage: 'plan',
                transactionReferenceHash: transactionReferenceHash(drift.transactionId),
              },
              mode: 'apply',
              pages: history.pages,
              planned: finalPlan,
              status: 'rejected',
              transactions: [],
            },
          );
        }
        if (resume) {
          await this.auditBatch('apple_server_reconciliation.batch_resumed', {
            ...evidence,
            metadata: { planned: this.auditPlan(finalPlan) },
          }, transaction);
        }
        await this.auditBatch('apple_server_reconciliation.batch_completed', {
          ...evidence,
          metadata: {
            applied: cumulativeBatchResult.applied,
            completed: cumulativeBatchResult.completed,
          },
        }, transaction);
      });
      return {
        cumulativeBatchResult: cumulativeBatchResult!,
        reports: finalCompleted,
      };
    } catch (error) {
      if (
        error instanceof AppleServerReconciliationApplyError
        || error instanceof AppleServerReconciliationStateError
      ) throw error;

      const failure = {
        code: safeFailureCode(error),
        index: finalCompleted.length,
        stage: 'batch_completed_audit' as const,
      };
      let recoveryRecorded = false;
      try {
        const recovery = await this.withBatchLock(evidence.batchId, async (transaction) => {
          const events = await this.batchEvents(evidence.batchId, transaction);
          const state = this.assertBatchEvidence(events, evidence, {
            allowCompleted: true,
            requireFinalizationFailure: resume,
          });
          cumulativeBatchResult = state.cumulativeBatchResult;
          if (state.completed) return 'completed' as const;
          await this.auditBatch('apple_server_reconciliation.batch_finalization_failed', {
            ...evidence,
            metadata: {
              applied: cumulativeBatchResult.applied,
              completed: cumulativeBatchResult.completed,
              failure,
            },
          }, transaction);
          return 'failure_recorded' as const;
        });
        if (recovery === 'completed') {
          return {
            cumulativeBatchResult: cumulativeBatchResult!,
            reports: finalCompleted,
          };
        }
        recoveryRecorded = true;
      } catch {
        // If neither the completion nor failure marker can be read durably,
        // do not advertise the batch as resumable.
      }
      throw new AppleServerReconciliationApplyError(
        'apple_server_reconciliation_finalization_failed',
        {
          accountId: history.accountId,
          applied: finalCompleted.filter((report) => report.applied).length,
          batchId: evidence.batchId,
          checked: finalPlan.length,
          ...(cumulativeBatchResult
            ? { cumulativeBatchResult: this.cumulativeSummary(cumulativeBatchResult) }
            : {}),
          environment: evidence.environment,
          failure,
          mode: 'apply',
          pages: history.pages,
          planned: finalPlan,
          ...(recoveryRecorded
            ? { recovery: { resumeBatchId: evidence.batchId } }
            : {}),
          status: 'finalization_failed',
          transactions: finalCompleted,
        },
      );
    }
  }

  private assertBatchEvidence(
    events: readonly AuditEvent[],
    evidence: BatchEvidence,
    options: Readonly<{
      allowCompleted: boolean;
      requireFinalizationFailure: boolean;
    }>,
  ) {
    if (events.length === 0) {
      throw new AppleServerReconciliationStateError(
        'apple_server_reconciliation_resume_batch_not_found',
      );
    }
    for (const event of events) {
      if (event.targetId !== evidence.accountId) {
        throw new AppleServerReconciliationStateError(
          'apple_server_reconciliation_resume_account_mismatch',
        );
      }
      const metadata = metadataRecord(event.metadata);
      if (metadata.environment !== evidence.environment) {
        throw new AppleServerReconciliationStateError(
          'apple_server_reconciliation_resume_environment_mismatch',
        );
      }
      if (metadata.batchId !== evidence.batchId) {
        throw new AppleServerReconciliationStateError(
          'apple_server_reconciliation_resume_evidence_invalid',
        );
      }
      if (metadata.planFingerprint !== evidence.planFingerprint) {
        throw new AppleServerReconciliationStateError(
          'apple_server_reconciliation_resume_plan_mismatch',
        );
      }
    }
    const started = events.filter((event) => (
      event.action === 'apple_server_reconciliation.batch_started'
    ));
    if (started.length !== 1) {
      throw new AppleServerReconciliationStateError(
        'apple_server_reconciliation_resume_evidence_incomplete',
      );
    }
    const startedPlan = auditedReports(metadataRecord(started[0]!.metadata).planned);
    if (
      startedPlan.length !== evidence.itemIdentities.length
      || startedPlan.some((report, index) => {
        const identity = evidence.itemIdentities[index];
        return !identity
          || report.appleStatus !== identity.appleStatus
          || report.productKey !== identity.productKey
          || report.transactionReferenceHash !== identity.transactionReferenceHash;
      })
    ) {
      throw new AppleServerReconciliationStateError(
        'apple_server_reconciliation_resume_evidence_incomplete',
      );
    }
    if (events.some((event) => (
      event.action === 'apple_server_reconciliation.batch_failed'
      || event.action === 'apple_server_reconciliation.batch_rejected'
    ))) {
      throw new AppleServerReconciliationStateError(
        'apple_server_reconciliation_resume_evidence_invalid',
      );
    }
    const completedEvents = events.filter((event) => (
      event.action === 'apple_server_reconciliation.batch_completed'
    ));
    if (completedEvents.length > 1) {
      throw new AppleServerReconciliationStateError(
        'apple_server_reconciliation_resume_evidence_invalid',
      );
    }
    const itemEvents = events.filter((event) => (
      event.action === 'apple_server_reconciliation.item_completed'
    ));
    if (itemEvents.length !== evidence.itemIdentities.length) {
      throw new AppleServerReconciliationStateError(
        'apple_server_reconciliation_resume_evidence_incomplete',
      );
    }
    const itemReports: AuditedReconciliationReport[] = [];
    let previousSequence = started[0]!.sequence;
    for (const [index, event] of itemEvents.entries()) {
      const metadata = metadataRecord(event.metadata);
      const report = auditedReport(metadata);
      const identity = evidence.itemIdentities[index];
      if (
        metadata.index !== index
        || event.sequence <= previousSequence
        || !identity
        || report.appleStatus !== identity.appleStatus
        || report.productKey !== identity.productKey
        || report.transactionReferenceHash !== identity.transactionReferenceHash
      ) {
        throw new AppleServerReconciliationStateError(
          'apple_server_reconciliation_resume_evidence_incomplete',
        );
      }
      previousSequence = event.sequence;
      itemReports.push(report);
    }
    const cumulativeFromMetadata = (metadata: Record<string, unknown>) => {
      const cumulativeReports = auditedReports(metadata.completed);
      const applied = metadata.applied;
      if (
        !Number.isSafeInteger(applied)
        || applied !== cumulativeReports.filter((report) => report.applied).length
        || cumulativeReports.length !== itemReports.length
        || cumulativeReports.some((report, index) => (
          !sameAuditedReport(report, itemReports[index]!)
        ))
      ) {
        throw new AppleServerReconciliationStateError(
          'apple_server_reconciliation_resume_evidence_incomplete',
        );
      }
      return { applied: Number(applied), completed: cumulativeReports } as const;
    };
    if (completedEvents.length === 1) {
      const cumulativeBatchResult = cumulativeFromMetadata(
        metadataRecord(completedEvents[0]!.metadata),
      );
      if (!options.allowCompleted) {
        throw new AppleServerReconciliationStateError(
          'apple_server_reconciliation_resume_already_completed',
        );
      }
      return { completed: true, cumulativeBatchResult } as const;
    }
    if (options.requireFinalizationFailure) {
      const finalizationFailures = events.filter((event) => (
        event.action === 'apple_server_reconciliation.batch_finalization_failed'
        && event.sequence > previousSequence
      ));
      if (finalizationFailures.length === 0) {
        throw new AppleServerReconciliationStateError(
          'apple_server_reconciliation_resume_evidence_incomplete',
        );
      }
      const latestFailureMetadata = metadataRecord(finalizationFailures.at(-1)!.metadata);
      const failure = metadataRecord(latestFailureMetadata.failure);
      if (failure.stage !== 'batch_completed_audit') {
        throw new AppleServerReconciliationStateError(
          'apple_server_reconciliation_resume_evidence_incomplete',
        );
      }
      return {
        completed: false,
        cumulativeBatchResult: cumulativeFromMetadata(latestFailureMetadata),
      } as const;
    }
    return {
      completed: false,
      cumulativeBatchResult: {
        applied: itemReports.filter((report) => report.applied).length,
        completed: itemReports,
      },
    } as const;
  }

  private async batchEvents(
    batchId: string,
    database: Pick<ReconciliationTransaction, 'select'>,
  ): Promise<readonly AuditEvent[]> {
    return database.select({
      action: opsAuditEvents.action,
      metadata: opsAuditEvents.metadata,
      sequence: opsAuditEvents.sequence,
      targetId: opsAuditEvents.targetId,
    }).from(opsAuditEvents).where(and(
      eq(opsAuditEvents.requestId, batchId),
      eq(opsAuditEvents.targetType, 'apple_server_reconciliation'),
    )).orderBy(asc(opsAuditEvents.sequence));
  }

  private async withBatchLock<T>(
    batchId: string,
    operation: (transaction: ReconciliationTransaction) => Promise<T>,
  ) {
    return this.database.db.transaction(async (transaction) => {
      await transaction.execute(sql`
        select pg_advisory_xact_lock(
          hashtextextended(${`apple-reconciliation-batch:${batchId}`}, 0)
        )
      `);
      return operation(transaction);
    });
  }

  private planFingerprint(
    accountId: string,
    environment: CommerceEnvironment,
    reports: readonly AppleCommerceReconciliationReport[],
  ) {
    return createHash('sha256').update(JSON.stringify({
      accountId,
      environment,
      transactions: reports.map((report) => ({
        appleStatus: report.appleStatus,
        productKey: report.productKey,
        transactionReferenceHash: transactionReferenceHash(report.transactionId),
      })),
    })).digest('hex');
  }

  private auditPlan(reports: readonly AppleCommerceReconciliationReport[]) {
    return reports.map((report) => ({
      action: report.action,
      appleStatus: report.appleStatus,
      applied: report.applied,
      localStatus: report.localStatus,
      mismatch: report.mismatch,
      productKey: report.productKey,
      transactionReferenceHash: transactionReferenceHash(report.transactionId),
    }));
  }

  private async auditBatch(
    action: string,
    input: BatchEvidence & Readonly<{ metadata: Record<string, unknown> }>,
    database: Pick<ReconciliationTransaction, 'insert'> = this.database.db,
  ) {
    await database.insert(opsAuditEvents).values({
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
        planFingerprint: input.planFingerprint,
        ...input.metadata,
      },
    });
  }

  private cumulativeSummary(result: CumulativeBatchResult) {
    return {
      applied: result.applied,
      completed: result.completed.length,
    } as const;
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
