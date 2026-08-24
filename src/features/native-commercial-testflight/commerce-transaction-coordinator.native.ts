import type {
  CommerceQuarantinedTransaction,
  CommerceResult,
  CommerceTransaction,
  CommerceTransactionInbox,
  NativeCommerceProvider,
} from './commerce-provider.native';

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
  consume(transaction: CommerceTransaction): Promise<CommerceTransactionConsumption>;
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

export class NativeCommerceTransactionCoordinator {
  private currentRun: Promise<void> = Promise.resolve();

  constructor(
    private readonly provider: NativeCommerceProvider,
    private readonly consumer: CommerceTransactionConsumer,
  ) {}

  /** Silent app-start reconciliation. This path never invokes Restore Purchases. */
  start(): Promise<CommerceResult<CommerceTransactionCoordinationReport>> {
    return this.serialize(() => this.consumePages(() => this.provider.reconcileTransactions()));
  }

  /** The only coordinator entry point intended for an explicit Restore Purchases action. */
  restorePurchasesFromUserAction(): Promise<
    CommerceResult<CommerceTransactionCoordinationReport>
  > {
    return this.serialize(async () => {
      let firstPage = true;
      return this.consumePages(() => {
        if (firstPage) {
          firstPage = false;
          return this.provider.restorePurchases();
        }
        return this.provider.reconcileTransactions();
      });
    });
  }

  drainObservedTransactions(): Promise<CommerceResult<CommerceTransactionCoordinationReport>> {
    return this.serialize(async () => {
      let firstPage = true;
      return this.consumePages(() => {
        if (firstPage) {
          firstPage = false;
          return this.provider.drainTransactionInbox();
        }
        return this.provider.reconcileTransactions();
      });
    });
  }

  dispose(): Promise<void> {
    return this.provider.dispose();
  }

  private async consumePages(
    nextPage: () => InboxResult,
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

    let overflowed: boolean;
    do {
      const page = await nextPage();
      if (!page.ok) return page;
      overflowed = page.value.overflowed;
      for (const transaction of page.value.quarantinedTransactions) {
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
        if (observedReferences.has(transaction.transactionReference)) continue;
        observedReferences.add(transaction.transactionReference);
        report.observed += 1;
        report.observedReferences.push(transaction.transactionReference);
        const consumption = await this.consumer
          .consume(transaction)
          .catch((): CommerceTransactionConsumption => ({ state: 'deferred' }));
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
        });
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
        const finish = await this.provider.finishTransaction({
          acknowledgement: acknowledgement.value,
        });
        if (finish.ok) {
          report.finished += 1;
          report.finishedReferences.push(transaction.transactionReference);
        }
        else report.deferred += 1;
      }
    } while (overflowed);

    return { ok: true, state: 'succeeded', value: report };
  }

  private serialize<T>(work: () => Promise<T>): Promise<T> {
    const result = this.currentRun.then(work, work);
    this.currentRun = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}
