import type {
  CommerceQuarantinedTransaction,
  CommerceServerVerifiedAcknowledgement,
  CommerceTransaction,
  NativeCommerceProvider,
} from '../commerce-provider.native';
import {
  NATIVE_COMMERCE_COORDINATOR_READY,
  NativeCommerceTransactionCoordinator,
  type CommerceTransactionConsumption,
  type CommerceTransactionConsumer,
} from '../commerce-transaction-coordinator.native';

function transaction(reference: string): CommerceTransaction {
  return {
    offeringKey: 'membership_31d_v1',
    transactionReference: reference,
    purchasedAt: '2026-08-24T08:00:00.000Z',
    signedTransaction: `jws-${reference}`,
    environment: 'sandbox',
    requiresServerVerification: true,
  };
}

const quarantined: CommerceQuarantinedTransaction = {
  productId: 'unknown.product',
  transactionReference: 'unknown-transaction',
  environment: 'sandbox',
  reason: 'unknown_product',
  finishAllowed: false,
};

function inbox(
  transactions: readonly CommerceTransaction[],
  overflowed = false,
  quarantinedTransactions: readonly CommerceQuarantinedTransaction[] = [],
) {
  return Promise.resolve({
    ok: true,
    state: 'succeeded',
    value: {
      transactions,
      quarantinedTransactions,
      overflowed,
      entitlementGranted: false,
    },
  } as const);
}

function createProvider(): NativeCommerceProvider & {
  reconcileTransactions: jest.Mock;
  restorePurchases: jest.Mock;
  drainTransactionInbox: jest.Mock;
  markServerVerified: jest.Mock;
  finishTransaction: jest.Mock;
  dispose: jest.Mock;
} {
  const acknowledgement = {
    transactionReference: 'verified',
  } as CommerceServerVerifiedAcknowledgement;
  return {
    listOfferings: jest.fn(),
    purchase: jest.fn(),
    reconcileTransactions: jest.fn(() => inbox([])),
    restorePurchases: jest.fn(() => inbox([])),
    drainTransactionInbox: jest.fn(() => inbox([])),
    markServerVerified: jest.fn(async () => ({
      ok: true,
      state: 'succeeded',
      value: acknowledgement,
    } as const)),
    finishTransaction: jest.fn(async () => ({
      ok: true,
      state: 'succeeded',
      value: {
        transactionReference: 'verified',
        transactionFinished: true,
        completion: 'finished',
      },
    } as const)),
    dispose: jest.fn(async () => undefined),
  };
}

describe('native commerce transaction coordinator', () => {
  it('is explicitly release-gated as ready for the authenticated runtime', () => {
    expect(NATIVE_COMMERCE_COORDINATOR_READY).toBe(true);
  });

  it('silently reconciles every startup page and finishes only an exact server-verified JWS', async () => {
    const provider = createProvider();
    provider.reconcileTransactions
      .mockImplementationOnce(() => inbox([transaction('deferred')], true, [quarantined]))
      .mockImplementationOnce(() => inbox([transaction('verified')]));
    const consumer: CommerceTransactionConsumer = {
      consume: jest.fn(async (observed) =>
        observed.transactionReference === 'verified'
          ? {
              state: 'server-verified' as const,
              transactionReference: observed.transactionReference,
              signedTransaction: observed.signedTransaction,
            }
          : { state: 'deferred' as const },
      ),
      observeQuarantined: jest.fn(async () => undefined),
    };
    const coordinator = new NativeCommerceTransactionCoordinator(provider, consumer);

    await expect(coordinator.start()).resolves.toEqual({
      ok: true,
      state: 'succeeded',
      value: {
        observed: 2,
        observedReferences: ['deferred', 'verified'],
        serverVerified: 1,
        serverVerifiedReferences: ['verified'],
        serverVerifiedTransactions: [{
          transactionReference: 'verified',
          offeringKey: 'membership_31d_v1',
          purchasedAt: '2026-08-24T08:00:00.000Z',
          environment: 'sandbox',
        }],
        finished: 1,
        finishedReferences: ['verified'],
        deferred: 1,
        quarantined: 1,
      },
    });

    expect(provider.restorePurchases).not.toHaveBeenCalled();
    expect(provider.reconcileTransactions).toHaveBeenCalledTimes(2);
    expect(provider.markServerVerified).toHaveBeenCalledTimes(1);
    expect(provider.markServerVerified).toHaveBeenCalledWith(
      {
        transactionReference: 'verified',
        signedTransaction: 'jws-verified',
      },
      { lifecycle: undefined },
    );
    expect(provider.finishTransaction).toHaveBeenCalledTimes(1);
    expect(consumer.observeQuarantined).toHaveBeenCalledWith(quarantined);
  });

  it('uses explicit restore once, then continues overflow with silent reconciliation', async () => {
    const provider = createProvider();
    provider.restorePurchases.mockImplementationOnce(() => inbox([transaction('restored')], true));
    provider.reconcileTransactions.mockImplementationOnce(() => inbox([transaction('remaining')]));
    const consumer: CommerceTransactionConsumer = {
      consume: jest.fn(
        async (): Promise<CommerceTransactionConsumption> => ({ state: 'deferred' }),
      ),
    };
    const coordinator = new NativeCommerceTransactionCoordinator(provider, consumer);

    await expect(coordinator.restorePurchasesFromUserAction()).resolves.toEqual(
      expect.objectContaining({
        ok: true,
        value: expect.objectContaining({ observed: 2, deferred: 2, finished: 0 }),
      }),
    );

    expect(provider.restorePurchases).toHaveBeenCalledTimes(1);
    expect(provider.reconcileTransactions).toHaveBeenCalledTimes(1);
    expect(provider.markServerVerified).not.toHaveBeenCalled();
    expect(provider.finishTransaction).not.toHaveBeenCalled();
  });

  it('never acknowledges or finishes a mismatched server response', async () => {
    const provider = createProvider();
    provider.reconcileTransactions.mockImplementationOnce(() => inbox([transaction('expected')]));
    const consumer: CommerceTransactionConsumer = {
      consume: jest.fn(async (): Promise<CommerceTransactionConsumption> => ({
        state: 'server-verified',
        transactionReference: 'different',
        signedTransaction: 'jws-different',
      })),
    };
    const coordinator = new NativeCommerceTransactionCoordinator(provider, consumer);

    await expect(coordinator.start()).resolves.toEqual(
      expect.objectContaining({
        ok: true,
        value: expect.objectContaining({ deferred: 1, serverVerified: 0, finished: 0 }),
      }),
    );
    expect(provider.markServerVerified).not.toHaveBeenCalled();
    expect(provider.finishTransaction).not.toHaveBeenCalled();
  });

  it('falls back from an overflowing live inbox to silent history without double-consuming', async () => {
    const provider = createProvider();
    provider.drainTransactionInbox.mockImplementationOnce(() => inbox([transaction('repeated')], true));
    provider.reconcileTransactions.mockImplementationOnce(() =>
      inbox([transaction('repeated'), transaction('recovered')]),
    );
    const consumer: CommerceTransactionConsumer = {
      consume: jest.fn(
        async (): Promise<CommerceTransactionConsumption> => ({ state: 'deferred' }),
      ),
    };
    const coordinator = new NativeCommerceTransactionCoordinator(provider, consumer);

    await expect(coordinator.drainObservedTransactions()).resolves.toEqual(
      expect.objectContaining({
        ok: true,
        value: expect.objectContaining({ observed: 2, deferred: 2 }),
      }),
    );
    expect(provider.drainTransactionInbox).toHaveBeenCalledTimes(1);
    expect(provider.reconcileTransactions).toHaveBeenCalledTimes(1);
    expect(consumer.consume).toHaveBeenCalledTimes(2);
  });

  it('delegates disposal without starting any commerce lifecycle', async () => {
    const provider = createProvider();
    const coordinator = new NativeCommerceTransactionCoordinator(provider, {
      consume: jest.fn(
        async (): Promise<CommerceTransactionConsumption> => ({ state: 'deferred' }),
      ),
    });

    await coordinator.dispose();

    expect(provider.dispose).toHaveBeenCalledTimes(1);
    expect(provider.reconcileTransactions).not.toHaveBeenCalled();
    expect(provider.restorePurchases).not.toHaveBeenCalled();
  });

  it('rejects an overlapping user restore instead of interleaving it with startup', async () => {
    const provider = createProvider();
    let resolveStartup!: () => void;
    provider.reconcileTransactions.mockImplementationOnce(() => new Promise((resolve) => {
      resolveStartup = () => resolve({
        ok: true,
        state: 'succeeded',
        value: {
          transactions: [],
          quarantinedTransactions: [],
          overflowed: false,
          entitlementGranted: false,
        },
      });
    }));
    const coordinator = new NativeCommerceTransactionCoordinator(provider, {
      consume: jest.fn(async () => ({ state: 'deferred' as const })),
    });

    const startup = coordinator.start();
    await expect(coordinator.restorePurchasesFromUserAction()).resolves.toMatchObject({
      ok: false,
      code: 'commerce_operation_busy',
    });
    expect(provider.restorePurchases).not.toHaveBeenCalled();

    resolveStartup();
    await expect(startup).resolves.toMatchObject({ ok: true });
  });

  it('bounds restore pagination and returns a stable terminal failure', async () => {
    const provider = createProvider();
    provider.restorePurchases.mockImplementation(() => inbox([], true));
    provider.reconcileTransactions.mockImplementation(() => inbox([], true));
    const coordinator = new NativeCommerceTransactionCoordinator(provider, {
      consume: jest.fn(async () => ({ state: 'deferred' as const })),
    }, { maxPages: 2 });

    await expect(coordinator.restorePurchasesFromUserAction()).resolves.toMatchObject({
      ok: false,
      code: 'commerce_reconciliation_budget_exceeded',
    });
    expect(provider.restorePurchases).toHaveBeenCalledTimes(1);
    expect(provider.reconcileTransactions).toHaveBeenCalledTimes(1);
  });

  it('bounds total transactions independently of pagination', async () => {
    const provider = createProvider();
    provider.restorePurchases.mockImplementation(() => inbox([
      transaction('transaction-1'),
      transaction('transaction-2'),
    ]));
    const consumer: CommerceTransactionConsumer = {
      consume: jest.fn(async () => ({ state: 'deferred' as const })),
    };
    const coordinator = new NativeCommerceTransactionCoordinator(
      provider,
      consumer,
      { maxTransactions: 1 },
    );

    await expect(coordinator.restorePurchasesFromUserAction()).resolves.toMatchObject({
      ok: false,
      code: 'commerce_reconciliation_budget_exceeded',
    });
    expect(consumer.consume).not.toHaveBeenCalled();
  });

  it('cancels an active restore when its account/environment generation is invalidated', async () => {
    const provider = createProvider();
    provider.restorePurchases.mockImplementation(() => new Promise(() => undefined));
    const coordinator = new NativeCommerceTransactionCoordinator(provider, {
      consume: jest.fn(async () => ({ state: 'deferred' as const })),
    });
    const abortController = new AbortController();

    const restore = coordinator.restorePurchasesFromUserAction({
      signal: abortController.signal,
    });
    abortController.abort();

    await expect(restore).resolves.toMatchObject({
      ok: false,
      code: 'commerce_operation_cancelled',
    });
  });

  it('enforces one deadline across the entire restore operation', async () => {
    jest.useFakeTimers();
    try {
      const provider = createProvider();
      provider.restorePurchases.mockImplementation(() => new Promise(() => undefined));
      const coordinator = new NativeCommerceTransactionCoordinator(provider, {
        consume: jest.fn(async () => ({ state: 'deferred' as const })),
      }, { deadlineMs: 100 });

      const restore = coordinator.restorePurchasesFromUserAction();
      await jest.advanceTimersByTimeAsync(100);

      await expect(restore).resolves.toMatchObject({
        ok: false,
        code: 'commerce_reconciliation_timed_out',
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('keeps the single-flight lock until a timed-out native restore physically drains', async () => {
    jest.useFakeTimers();
    try {
      const provider = createProvider();
      let resolveNativeRestore!: (value: Awaited<ReturnType<typeof inbox>>) => void;
      provider.restorePurchases.mockImplementationOnce(() => new Promise((resolve) => {
        resolveNativeRestore = resolve;
      }));
      const consumer: CommerceTransactionConsumer = {
        consume: jest.fn(async () => ({ state: 'deferred' as const })),
      };
      const coordinator = new NativeCommerceTransactionCoordinator(
        provider,
        consumer,
        { deadlineMs: 100 },
      );

      const restore = coordinator.restorePurchasesFromUserAction();
      const draining = coordinator.whenIdle();
      await jest.advanceTimersByTimeAsync(100);

      await expect(restore).resolves.toMatchObject({
        ok: false,
        code: 'commerce_reconciliation_timed_out',
      });
      await expect(coordinator.start()).resolves.toMatchObject({
        ok: false,
        code: 'commerce_operation_busy',
      });
      expect(provider.reconcileTransactions).not.toHaveBeenCalled();

      resolveNativeRestore(await inbox([transaction('late-restore')]));
      await draining;

      expect(consumer.consume).not.toHaveBeenCalled();
      expect(provider.markServerVerified).not.toHaveBeenCalled();
      expect(provider.finishTransaction).not.toHaveBeenCalled();
      await expect(coordinator.start()).resolves.toMatchObject({ ok: true });
      expect(provider.reconcileTransactions).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('discards a late server-verification result without acknowledging or finishing it', async () => {
    jest.useFakeTimers();
    try {
      const provider = createProvider();
      provider.restorePurchases.mockImplementationOnce(() => inbox([transaction('late-verify')]));
      let resolveConsumption!: (value: CommerceTransactionConsumption) => void;
      const consumer: CommerceTransactionConsumer = {
        consume: jest.fn(() => new Promise((resolve) => {
          resolveConsumption = resolve;
        })),
      };
      const coordinator = new NativeCommerceTransactionCoordinator(
        provider,
        consumer,
        { deadlineMs: 100 },
      );

      const restore = coordinator.restorePurchasesFromUserAction();
      await Promise.resolve();
      const draining = coordinator.whenIdle();
      await jest.advanceTimersByTimeAsync(100);
      await expect(restore).resolves.toMatchObject({
        ok: false,
        code: 'commerce_reconciliation_timed_out',
      });

      resolveConsumption({
        state: 'server-verified',
        transactionReference: 'late-verify',
        signedTransaction: 'jws-late-verify',
      });
      await draining;

      expect(provider.markServerVerified).not.toHaveBeenCalled();
      expect(provider.finishTransaction).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
});
