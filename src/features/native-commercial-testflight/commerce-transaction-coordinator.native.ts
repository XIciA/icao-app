import type {
  CommerceErrorResult,
  CommerceQuarantinedTransaction,
  CommerceResult,
  CommerceTransaction,
  CommerceTransactionInbox,
  NativeCommerceProvider,
} from './commerce-provider.native';
import type { CommerceOperationLifecycle } from './commerce-runtime-operation.native';

/** Release gate marker: the coordinator is ready for the authenticated iOS runtime. */
export const NATIVE_COMMERCE_COORDINATOR_READY = true as const;

export type CommerceTransactionConsumption =
  | Readonly<{ state: 'deferred' }>
  | Readonly<{
      state: 'server-verified';
      transactionReference: string;
      signedTransaction: string;
    }>;

export interface CommerceTransactionConsumer {
  consume(
    transaction: CommerceTransaction,
    options?: Readonly<{
      signal: AbortSignal;
      lifecycle?: CommerceOperationLifecycle;
    }>,
  ): Promise<CommerceTransactionConsumption>;
  /** Verified and acknowledged; native finish may still be draining. */
  onServerVerified?(transaction: CommerceTransaction): void;
  observeQuarantined?(transaction: CommerceQuarantinedTransaction): Promise<void>;
}

export type CommerceTransactionCoordinationReport = Readonly<{
  observed: number;
  observedReferences: readonly string[];
  serverVerified: number;
  serverVerifiedReferences: readonly string[];
  serverVerifiedTransactions: readonly Readonly<{
    transactionReference: string;
    offeringKey: CommerceTransaction['offeringKey'];
    purchasedAt: string;
    environment: CommerceTransaction['environment'];
  }>[];
  finished: number;
  finishedReferences: readonly string[];
  deferred: number;
  quarantined: number;
}>;

type InboxResult = Promise<CommerceResult<CommerceTransactionInbox>>;

export type CommerceCoordinationOptions = Readonly<{
  lifecycle?: CommerceOperationLifecycle;
  signal?: AbortSignal;
}>;

export type CommerceCoordinationRuntime = Readonly<{
  now(): number;
  schedule(delayMs: number, callback: () => void): () => void;
}>;

export type CommerceTransactionCoordinatorOptions = Readonly<{
  deadlineMs?: number;
  maxPages?: number;
  maxTransactions?: number;
  maxQuarantinedTransactions?: number;
  runtime?: CommerceCoordinationRuntime;
}>;

type CoordinationOperation = {
  abortController: AbortController;
  cancelled: boolean;
  completePublic?: (value: CommerceErrorResult) => void;
  deadlineAt: number;
  generation: number;
  lifecycle?: CommerceOperationLifecycle;
  signal?: AbortSignal;
};

const DEFAULT_COORDINATION_DEADLINE_MS = 45_000;
const DEFAULT_MAX_PAGES = 8;
const DEFAULT_MAX_TRANSACTIONS = 1_024;
const DEFAULT_MAX_QUARANTINED_TRANSACTIONS = 1_024;
const DEFAULT_RUNTIME: CommerceCoordinationRuntime = {
  now: () => Date.now(),
  schedule: (delayMs, callback) => {
    const timeout = setTimeout(callback, delayMs);
    return () => clearTimeout(timeout);
  },
};

function coordinationFailure(
  code: CommerceErrorResult['code'],
  retryable: boolean,
): CommerceErrorResult {
  return { ok: false, state: 'error', code, charged: false, retryable };
}

export class NativeCommerceTransactionCoordinator {
  private activeOperation?: CoordinationOperation;
  private disposed = false;
  private generation = 0;
  private readonly idleWaiters = new Set<() => void>();
  private readonly deadlineMs: number;
  private readonly maxPages: number;
  private readonly maxTransactions: number;
  private readonly maxQuarantinedTransactions: number;
  private readonly runtime: CommerceCoordinationRuntime;

  constructor(
    private readonly provider: NativeCommerceProvider,
    private readonly consumer: CommerceTransactionConsumer,
    options: CommerceTransactionCoordinatorOptions = {},
  ) {
    this.deadlineMs = Math.max(1, options.deadlineMs ?? DEFAULT_COORDINATION_DEADLINE_MS);
    this.maxPages = Math.max(1, options.maxPages ?? DEFAULT_MAX_PAGES);
    this.maxTransactions = Math.max(1, options.maxTransactions ?? DEFAULT_MAX_TRANSACTIONS);
    this.maxQuarantinedTransactions = Math.max(
      1,
      options.maxQuarantinedTransactions ?? DEFAULT_MAX_QUARANTINED_TRANSACTIONS,
    );
    this.runtime = options.runtime ?? DEFAULT_RUNTIME;
  }

  /** Silent app-start reconciliation. This path never invokes Restore Purchases. */
  start(
    options: CommerceCoordinationOptions = {},
  ): Promise<CommerceResult<CommerceTransactionCoordinationReport>> {
    return this.runExclusive(
      (operation) => this.consumePages(
        () => this.provider.reconcileTransactions({ lifecycle: operation.lifecycle }),
        operation,
      ),
      options,
    );
  }

  /** The only coordinator entry point intended for an explicit Restore Purchases action. */
  restorePurchasesFromUserAction(
    options: CommerceCoordinationOptions = {},
  ): Promise<
    CommerceResult<CommerceTransactionCoordinationReport>
  > {
    return this.runExclusive(async (operation) => {
      let firstPage = true;
      return this.consumePages(() => {
        if (firstPage) {
          firstPage = false;
          return this.provider.restorePurchases({ lifecycle: operation.lifecycle });
        }
        return this.provider.reconcileTransactions({ lifecycle: operation.lifecycle });
      }, operation);
    }, options);
  }

  drainObservedTransactions(
    options: CommerceCoordinationOptions = {},
  ): Promise<CommerceResult<CommerceTransactionCoordinationReport>> {
    return this.runExclusive(async (operation) => {
      let firstPage = true;
      return this.consumePages(() => {
        if (firstPage) {
          firstPage = false;
          return this.provider.drainTransactionInbox({ lifecycle: operation.lifecycle });
        }
        return this.provider.reconcileTransactions({ lifecycle: operation.lifecycle });
      }, operation);
    }, options);
  }

  dispose(options: Readonly<{ lifecycle?: CommerceOperationLifecycle }> = {}): Promise<void> {
    this.disposed = true;
    this.generation += 1;
    if (this.activeOperation) {
      this.activeOperation.cancelled = true;
      this.activeOperation.abortController.abort();
      this.activeOperation.completePublic?.(
        coordinationFailure('commerce_operation_cancelled', true),
      );
    }
    return this.provider.dispose(options);
  }

  /**
   * Resolves only after the underlying provider/consumer chain has physically
   * settled. A public timeout intentionally does not make the coordinator idle:
   * native promises cannot be cancelled, so starting another operation before
   * this resolves would allow two StoreKit histories to mutate the same inbox.
   */
  whenIdle(): Promise<void> {
    if (!this.activeOperation) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.add(resolve));
  }

  private async consumePages(
    nextPage: () => InboxResult,
    operation: CoordinationOperation,
  ): Promise<CommerceResult<CommerceTransactionCoordinationReport>> {
    const report = {
      observed: 0,
      observedReferences: [] as string[],
      serverVerified: 0,
      serverVerifiedReferences: [] as string[],
      serverVerifiedTransactions: [] as {
        transactionReference: string;
        offeringKey: CommerceTransaction['offeringKey'];
        purchasedAt: string;
        environment: CommerceTransaction['environment'];
      }[],
      finished: 0,
      finishedReferences: [] as string[],
      deferred: 0,
      quarantined: 0,
    };
    const observedReferences = new Set<string>();
    const quarantinedKeys = new Set<string>();
    let pages = 0;
    let scannedTransactions = 0;
    let scannedQuarantinedTransactions = 0;

    let overflowed: boolean;
    do {
      const beforePage = this.operationFailure(operation);
      if (beforePage) return beforePage;
      if (pages >= this.maxPages) {
        return coordinationFailure('commerce_reconciliation_budget_exceeded', false);
      }
      const page = await nextPage();
      const afterPage = this.operationFailure(operation);
      if (afterPage) return afterPage;
      if (!page.ok) return page;
      pages += 1;
      scannedTransactions +=
        page.value.transactions.length + page.value.quarantinedTransactions.length;
      scannedQuarantinedTransactions += page.value.quarantinedTransactions.length;
      if (
        scannedTransactions > this.maxTransactions
        || scannedQuarantinedTransactions > this.maxQuarantinedTransactions
      ) {
        return coordinationFailure('commerce_reconciliation_budget_exceeded', false);
      }
      overflowed = page.value.overflowed;
      for (const transaction of page.value.quarantinedTransactions) {
        const beforeQuarantined = this.operationFailure(operation);
        if (beforeQuarantined) return beforeQuarantined;
        const quarantineKey = [
          transaction.transactionReference ?? '',
          transaction.productId,
          transaction.purchasedAt ?? '',
          transaction.signedTransaction ?? '',
        ].join(':');
        if (quarantinedKeys.has(quarantineKey)) continue;
        quarantinedKeys.add(quarantineKey);
        report.quarantined += 1;
        await this.consumer.observeQuarantined?.(transaction).catch(() => undefined);
      }
      for (const transaction of page.value.transactions) {
        const beforeTransaction = this.operationFailure(operation);
        if (beforeTransaction) return beforeTransaction;
        if (observedReferences.has(transaction.transactionReference)) continue;
        observedReferences.add(transaction.transactionReference);
        report.observed += 1;
        report.observedReferences.push(transaction.transactionReference);
        const consumption = await this.consumer
          .consume(transaction, {
            signal: operation.abortController.signal,
            lifecycle: operation.lifecycle,
          })
          .catch((): CommerceTransactionConsumption => ({ state: 'deferred' }));
        const afterConsumption = this.operationFailure(operation);
        if (afterConsumption) return afterConsumption;
        if (
          consumption.state !== 'server-verified' ||
          consumption.transactionReference !== transaction.transactionReference ||
          consumption.signedTransaction !== transaction.signedTransaction
        ) {
          report.deferred += 1;
          continue;
        }

        const acknowledgement = await this.provider.markServerVerified({
          transactionReference: consumption.transactionReference,
          signedTransaction: consumption.signedTransaction,
        }, { lifecycle: operation.lifecycle });
        const afterAcknowledgement = this.operationFailure(operation);
        if (afterAcknowledgement) return afterAcknowledgement;
        if (!acknowledgement.ok) {
          report.deferred += 1;
          continue;
        }
        report.serverVerified += 1;
        report.serverVerifiedReferences.push(transaction.transactionReference);
        report.serverVerifiedTransactions.push({
          transactionReference: transaction.transactionReference,
          offeringKey: transaction.offeringKey,
          purchasedAt: transaction.purchasedAt,
          environment: transaction.environment,
        });
        this.consumer.onServerVerified?.(transaction);
        const finish = await this.provider.finishTransaction({
          acknowledgement: acknowledgement.value,
        }, { lifecycle: operation.lifecycle });
        const afterFinish = this.operationFailure(operation);
        if (afterFinish) return afterFinish;
        if (finish.ok) {
          report.finished += 1;
          report.finishedReferences.push(transaction.transactionReference);
        }
        else report.deferred += 1;
      }
    } while (overflowed);

    return { ok: true, state: 'succeeded', value: report };
  }

  private runExclusive(
    work: (
      operation: CoordinationOperation,
    ) => Promise<CommerceResult<CommerceTransactionCoordinationReport>>,
    options: CommerceCoordinationOptions,
  ): Promise<CommerceResult<CommerceTransactionCoordinationReport>> {
    if (this.disposed) {
      return Promise.resolve(coordinationFailure('commerce_provider_disposed', false));
    }
    if (this.activeOperation) {
      return Promise.resolve(coordinationFailure('commerce_operation_busy', true));
    }
    const operation: CoordinationOperation = {
      abortController: new AbortController(),
      cancelled: false,
      deadlineAt: this.runtime.now() + this.deadlineMs,
      generation: this.generation,
      ...(options.lifecycle ? { lifecycle: options.lifecycle } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
    };
    this.activeOperation = operation;

    const result = new Promise<CommerceResult<CommerceTransactionCoordinationReport>>(
      (resolve) => {
        let publicSettled = false;
        let cancelDeadline: () => void = () => undefined;
        const finishPublic = (value: CommerceResult<CommerceTransactionCoordinationReport>) => {
          if (publicSettled) return;
          publicSettled = true;
          cancelDeadline();
          options.signal?.removeEventListener('abort', onAbort);
          resolve(value);
        };
        const onAbort = () => {
          operation.cancelled = true;
          operation.abortController.abort();
          finishPublic(coordinationFailure('commerce_operation_cancelled', true));
        };
        operation.completePublic = finishPublic;
        cancelDeadline = this.runtime.schedule(this.deadlineMs, () => {
          operation.cancelled = true;
          operation.abortController.abort();
          finishPublic(coordinationFailure('commerce_reconciliation_timed_out', true));
        });
        if (options.signal?.aborted) {
          onAbort();
          this.releaseOperation(operation);
          return;
        }
        options.signal?.addEventListener('abort', onAbort, { once: true });
        void work(operation).then(
          (value) => finishPublic(value),
          () => finishPublic(coordinationFailure('commerce_restore_failed', true)),
        ).finally(() => {
          // The public caller may already have received a timeout/cancellation.
          // Keep the single-flight lock until the uncancellable native chain has
          // drained, then let a future operation use the provider again.
          this.releaseOperation(operation);
        });
      },
    );
    return result;
  }

  private releaseOperation(operation: CoordinationOperation) {
    if (this.activeOperation !== operation) return;
    this.activeOperation = undefined;
    for (const waiter of this.idleWaiters) waiter();
    this.idleWaiters.clear();
  }

  private operationFailure(operation: CoordinationOperation): CommerceErrorResult | undefined {
    if (
      operation.cancelled
      || operation.signal?.aborted
      || operation.generation !== this.generation
      || this.disposed
    ) {
      return coordinationFailure('commerce_operation_cancelled', true);
    }
    if (this.runtime.now() >= operation.deadlineAt) {
      operation.cancelled = true;
      return coordinationFailure('commerce_reconciliation_timed_out', true);
    }
    return undefined;
  }
}
