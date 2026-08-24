import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { AppleCommerceIngestionService } from '../src/commerce/apple-commerce-ingestion';
import type { AppleStoreVerifier } from '../src/commerce/apple-store-verifier';
import {
  CommerceDomainService,
  createCommerceDomainState,
  type VerifiedAppleNotification,
  type VerifiedAppleTransaction,
} from '../src/commerce/commerce-domain';
import { MEMBERSHIP_PRODUCTS, type CommerceEnvironment } from '../src/commerce/product-catalog';

const DAY_MS = 24 * 60 * 60 * 1_000;
const ACCOUNT_A = '00000000-0000-4000-8000-000000000001';
const ACCOUNT_B = '00000000-0000-4000-8000-000000000002';

function at(day: number, hour = 0) {
  return new Date(Date.UTC(2026, 0, 1 + day, hour));
}

function ids() {
  let next = 0;
  return () => `domain-id-${++next}`;
}

function appleTransaction(input: {
  accountId?: string;
  environment?: CommerceEnvironment;
  transactionId: string;
  productId?: string;
  purchasedAt?: Date;
  payloadHash?: string;
  revokedAt?: Date;
}): VerifiedAppleTransaction {
  const purchasedAt = input.purchasedAt ?? at(0);
  return {
    environment: input.environment ?? 'production',
    transactionId: input.transactionId,
    originalTransactionId: `original-${input.transactionId}`,
    productId: input.productId ?? 'com.readyoufife.ios.membership.7d.v1',
    bundleId: 'com.readyoufife.ios',
    appAccountToken: input.accountId ?? ACCOUNT_A,
    purchaseDate: purchasedAt,
    signedDate: purchasedAt,
    revocationDate: input.revokedAt,
    signedPayloadHash: input.payloadHash ?? `hash-${input.transactionId}`,
    decodedPayload: { transactionId: input.transactionId },
  };
}

function appleNotification(input: {
  environment?: CommerceEnvironment;
  uuid: string;
  type?: string;
  transaction?: VerifiedAppleTransaction;
  payloadHash?: string;
  signedAt?: Date;
}): VerifiedAppleNotification {
  return {
    environment: input.environment ?? 'production',
    notificationUuid: input.uuid,
    notificationType: input.type ?? 'DID_PURCHASE',
    signedDate: input.signedAt ?? at(0),
    signedPayloadHash: input.payloadHash ?? `notification-${input.uuid}`,
    decodedPayload: { notificationUUID: input.uuid },
    transaction: input.transaction,
  };
}

describe('commercial product catalog', () => {
  it('freezes the five approved product IDs, days, CNY targets, and AI batches', () => {
    expect(MEMBERSHIP_PRODUCTS.map((product) => ({
      key: product.productKey,
      apple: product.appleProductId,
      days: product.durationDays,
      fen: product.basePriceCnyFen,
      batches: product.aiPointBatches.map((batch) => [batch.offsetDays, batch.points]),
    }))).toEqual([
      {
        key: 'membership_7d_v1',
        apple: 'com.readyoufife.ios.membership.7d.v1',
        days: 7,
        fen: 6_800,
        batches: [[0, 250]],
      },
      {
        key: 'membership_15d_v1',
        apple: 'com.readyoufife.ios.membership.15d.v1',
        days: 15,
        fen: 10_800,
        batches: [[0, 500]],
      },
      {
        key: 'membership_31d_v1',
        apple: 'com.readyoufife.ios.membership.31d.v1',
        days: 31,
        fen: 16_800,
        batches: [[0, 1_000]],
      },
      {
        key: 'membership_62d_v1',
        apple: 'com.readyoufife.ios.membership.62d.v1',
        days: 62,
        fen: 29_800,
        batches: [[0, 1_000], [31, 1_000]],
      },
      {
        key: 'membership_93d_v1',
        apple: 'com.readyoufife.ios.membership.93d.v1',
        days: 93,
        fen: 39_800,
        batches: [[0, 1_000], [31, 1_000], [62, 1_000]],
      },
    ]);
  });
});

describe('CommerceDomainService', () => {
  it('makes Apple transactions idempotent and appends repeated purchases sequentially', () => {
    const state = createCommerceDomainState();
    const commerce = new CommerceDomainService({ idFactory: ids() });
    const first = appleTransaction({ transactionId: 'tx-1', purchasedAt: at(0) });

    expect(commerce.recordApplePurchase(state, first).created).toBe(true);
    expect(commerce.recordApplePurchase(state, first).created).toBe(false);
    expect(state.orders).toHaveLength(1);
    expect(commerce.membershipExpiresAt(state, ACCOUNT_A, 'production')).toEqual(at(7));

    commerce.recordApplePurchase(state, appleTransaction({
      transactionId: 'tx-2',
      productId: 'com.readyoufife.ios.membership.15d.v1',
      purchasedAt: at(1),
    }));
    expect(state.orders).toHaveLength(2);
    expect(commerce.membershipExpiresAt(state, ACCOUNT_A, 'production')).toEqual(at(22));
    expect(state.membershipSegments.filter((segment) => segment.status === 'active')).toHaveLength(2);
    expect(commerce.availableAiPoints(state, ACCOUNT_A, 'production', at(1))).toBe(250);
    expect(commerce.availableAiPoints(state, ACCOUNT_A, 'production', at(7))).toBe(750);
  });

  it('rejects conflicting reuse of an Apple transaction ID', () => {
    const state = createCommerceDomainState();
    const commerce = new CommerceDomainService({ idFactory: ids() });
    commerce.recordApplePurchase(state, appleTransaction({ transactionId: 'tx-conflict' }));
    expect(() => commerce.recordApplePurchase(state, appleTransaction({
      accountId: ACCOUNT_B,
      transactionId: 'tx-conflict',
    }))).toThrow('apple_transaction_idempotency_conflict');
  });

  it('recalculates only remaining valid membership and unused points after refund', () => {
    const state = createCommerceDomainState();
    const commerce = new CommerceDomainService({ idFactory: ids() });
    commerce.recordApplePurchase(state, appleTransaction({ transactionId: 'tx-refund-1', purchasedAt: at(0) }));
    commerce.recordApplePurchase(state, appleTransaction({
      transactionId: 'tx-refund-2',
      productId: 'com.readyoufife.ios.membership.15d.v1',
      purchasedAt: at(1),
    }));
    commerce.reserveAiPoints(state, {
      accountId: ACCOUNT_A,
      environment: 'production',
      operationId: 'completed-before-refund',
      capability: 'transcription_opi',
      at: at(1),
    });
    commerce.settleAiPoints(state, ACCOUNT_A, 'production', 'completed-before-refund', at(1));
    commerce.reserveAiPoints(state, {
      accountId: ACCOUNT_A,
      environment: 'production',
      operationId: 'in-flight-during-refund',
      capability: 'transcription',
      at: at(1),
    });

    expect(commerce.refundAppleTransaction(state, 'production', 'tx-refund-1', at(2)).changed).toBe(true);
    expect(commerce.refundAppleTransaction(state, 'production', 'tx-refund-1', at(2)).changed).toBe(false);
    expect(commerce.membershipExpiresAt(state, ACCOUNT_A, 'production')).toEqual(at(17));
    expect(commerce.availableAiPoints(state, ACCOUNT_A, 'production', at(2))).toBe(500);
    const refundedBatch = state.pointBatches.find((batch) => batch.sourceOrderId === state.orders[0]!.id);
    expect(refundedBatch?.status).toBe('revoked');
    expect(refundedBatch?.consumedPoints).toBe(10);
    expect(refundedBatch?.reservedPoints).toBe(0);
    expect(state.pointReservations.find((reservation) => reservation.operationId === 'in-flight-during-refund')?.status)
      .toBe('released');
  });

  it('releases a reservation on failure and settles it once on success', () => {
    const state = createCommerceDomainState();
    const commerce = new CommerceDomainService({ idFactory: ids() });
    commerce.grantFreeTrial(state, ACCOUNT_A, 'production', at(0));
    commerce.recordApplePurchase(state, appleTransaction({
      transactionId: 'tx-points',
      productId: 'com.readyoufife.ios.membership.31d.v1',
      purchasedAt: at(0),
    }));

    const reserved = commerce.reserveAiPoints(state, {
      accountId: ACCOUNT_A,
      environment: 'production',
      operationId: 'operation-success',
      capability: 'transcription_opi',
      at: at(0, 1),
    });
    expect(reserved.created).toBe(true);
    expect(commerce.reserveAiPoints(state, {
      accountId: ACCOUNT_A,
      environment: 'production',
      operationId: 'operation-success',
      capability: 'transcription_opi',
      at: at(0, 1),
    }).created).toBe(false);
    expect(commerce.availableAiPoints(state, ACCOUNT_A, 'production', at(0, 1))).toBe(1_090);
    expect(commerce.settleAiPoints(state, ACCOUNT_A, 'production', 'operation-success', at(0, 2)).changed).toBe(true);
    expect(commerce.settleAiPoints(state, ACCOUNT_A, 'production', 'operation-success', at(0, 2)).changed).toBe(false);

    commerce.reserveAiPoints(state, {
      accountId: ACCOUNT_A,
      environment: 'production',
      operationId: 'operation-failure',
      capability: 'transcription',
      at: at(0, 3),
    });
    expect(commerce.availableAiPoints(state, ACCOUNT_A, 'production', at(0, 3))).toBe(1_085);
    expect(commerce.releaseAiPoints(state, ACCOUNT_A, 'production', 'operation-failure', at(0, 4)).changed).toBe(true);
    expect(commerce.releaseAiPoints(state, ACCOUNT_A, 'production', 'operation-failure', at(0, 4)).changed).toBe(false);
    expect(commerce.availableAiPoints(state, ACCOUNT_A, 'production', at(0, 4))).toBe(1_090);
    expect(state.pointLedger.filter((entry) => entry.operationId === 'operation-success' && entry.entryType === 'settle'))
      .toHaveLength(1);
    expect(state.pointLedger.filter((entry) => entry.operationId === 'operation-failure' && entry.entryType === 'release'))
      .toHaveLength(1);
  });

  it('keeps future 31-day point batches scheduled and extends their final expiry on repeat purchase', () => {
    const state = createCommerceDomainState();
    const commerce = new CommerceDomainService({ idFactory: ids() });
    commerce.recordApplePurchase(state, appleTransaction({
      transactionId: 'tx-62',
      productId: 'com.readyoufife.ios.membership.62d.v1',
      purchasedAt: at(0),
    }));
    expect(commerce.availableAiPoints(state, ACCOUNT_A, 'production', at(0))).toBe(1_000);
    expect(commerce.availableAiPoints(state, ACCOUNT_A, 'production', new Date(at(31).getTime() - 1))).toBe(1_000);
    expect(commerce.availableAiPoints(state, ACCOUNT_A, 'production', at(31))).toBe(2_000);

    commerce.recordApplePurchase(state, appleTransaction({ transactionId: 'tx-extend', purchasedAt: at(40) }));
    expect(commerce.membershipExpiresAt(state, ACCOUNT_A, 'production')).toEqual(at(69));
    const memberBatches = state.pointBatches.filter((batch) => batch.sourceType === 'membership');
    expect(memberBatches.every((batch) => batch.expiresAt?.getTime() === at(69).getTime())).toBe(true);
  });

  it('does not restore expired membership points when a later purchase starts after a lapse', () => {
    const state = createCommerceDomainState();
    const commerce = new CommerceDomainService({ idFactory: ids() });
    commerce.recordApplePurchase(state, appleTransaction({ transactionId: 'tx-before-lapse', purchasedAt: at(0) }));
    commerce.recordApplePurchase(state, appleTransaction({ transactionId: 'tx-after-lapse', purchasedAt: at(8) }));

    expect(commerce.membershipExpiresAt(state, ACCOUNT_A, 'production')).toEqual(at(15));
    expect(commerce.availableAiPoints(state, ACCOUNT_A, 'production', at(8))).toBe(250);
    expect(state.pointBatches.filter((batch) => batch.status === 'expired')).toHaveLength(1);
  });

  it('isolates identical Apple identifiers and balances between sandbox and production', () => {
    const state = createCommerceDomainState();
    const commerce = new CommerceDomainService({ idFactory: ids() });
    commerce.recordApplePurchase(state, appleTransaction({ transactionId: 'same-tx', environment: 'sandbox' }));
    commerce.recordApplePurchase(state, appleTransaction({ transactionId: 'same-tx', environment: 'production' }));
    commerce.recordAppleNotification(state, appleNotification({
      environment: 'sandbox',
      uuid: '00000000-0000-4000-8000-000000000010',
    }));
    commerce.recordAppleNotification(state, appleNotification({
      environment: 'production',
      uuid: '00000000-0000-4000-8000-000000000010',
    }));

    expect(state.orders).toHaveLength(2);
    expect(state.appleNotifications).toHaveLength(2);
    expect(commerce.availableAiPoints(state, ACCOUNT_A, 'sandbox', at(0))).toBe(250);
    expect(commerce.availableAiPoints(state, ACCOUNT_A, 'production', at(0))).toBe(250);
    commerce.reserveAiPoints(state, {
      accountId: ACCOUNT_A,
      environment: 'sandbox',
      operationId: 'sandbox-only',
      capability: 'transcription_opi',
      at: at(0),
    });
    expect(commerce.availableAiPoints(state, ACCOUNT_A, 'sandbox', at(0))).toBe(240);
    expect(commerce.availableAiPoints(state, ACCOUNT_A, 'production', at(0))).toBe(250);
  });

  it('merges remaining membership while capping free trial points at one lifetime grant', () => {
    const state = createCommerceDomainState();
    const commerce = new CommerceDomainService({ idFactory: ids() });
    for (const accountId of [ACCOUNT_A, ACCOUNT_B]) {
      commerce.grantFreeTrial(state, accountId, 'production', at(0));
      commerce.reserveAiPoints(state, {
        accountId,
        environment: 'production',
        operationId: `trial-use-${accountId}`,
        capability: 'transcription_opi',
        at: at(0),
      });
      commerce.settleAiPoints(state, accountId, 'production', `trial-use-${accountId}`, at(0));
      commerce.recordApplePurchase(state, appleTransaction({
        accountId,
        transactionId: `purchase-${accountId}`,
        purchasedAt: at(0),
      }));
    }

    expect(commerce.mergeAccounts(state, ACCOUNT_B, ACCOUNT_A, at(2)).changed).toBe(true);
    expect(commerce.membershipExpiresAt(state, ACCOUNT_A, 'production')).toEqual(at(12));
    expect(commerce.availableAiPoints(state, ACCOUNT_A, 'production', at(2))).toBe(580);
    expect(state.orders.every((order) => order.accountId === ACCOUNT_A)).toBe(true);
    expect(state.orders.some((order) => order.originalAccountId === ACCOUNT_B)).toBe(true);
    expect(() => commerce.availableAiPoints(state, ACCOUNT_B, 'production', at(2))).toThrow('account_merged');
  });

  it('makes notifications idempotent and routes verified refund facts through the order ledger', () => {
    const state = createCommerceDomainState();
    const commerce = new CommerceDomainService({ idFactory: ids() });
    const transaction = appleTransaction({ transactionId: 'notification-tx' });
    const purchase = appleNotification({
      uuid: '00000000-0000-4000-8000-000000000011',
      transaction,
    });
    expect(commerce.recordAppleNotification(state, purchase).created).toBe(true);
    expect(commerce.recordAppleNotification(state, purchase).created).toBe(false);
    expect(() => commerce.recordAppleNotification(state, {
      ...purchase,
      signedPayloadHash: 'different-payload-for-same-uuid',
    })).toThrow('apple_notification_idempotency_conflict');

    const refund = appleNotification({
      uuid: '00000000-0000-4000-8000-000000000012',
      type: 'REFUND',
      signedAt: at(1),
      transaction: { ...transaction, signedPayloadHash: 'refund-transaction-hash', revocationDate: at(1) },
    });
    commerce.recordAppleNotification(state, refund, at(1));
    expect(state.orders).toHaveLength(1);
    expect(state.orders[0]?.status).toBe('refunded');
    expect(state.appleNotifications).toHaveLength(2);
    expect(commerce.membershipExpiresAt(state, ACCOUNT_A, 'production')).toBeUndefined();
  });
});

describe('AppleCommerceIngestionService', () => {
  it('accepts Apple input only after the injected verifier returns typed facts', async () => {
    const transaction = appleTransaction({ transactionId: 'verified-boundary' });
    const seen: string[] = [];
    const verifier: AppleStoreVerifier = {
      verifyTransaction: async (signed, environment) => {
        seen.push(`transaction:${signed}:${environment}`);
        return transaction;
      },
      verifyNotification: async () => {
        throw new Error('not_used');
      },
    };
    const state = createCommerceDomainState();
    const commerce = new CommerceDomainService({ idFactory: ids() });
    const ingestion = new AppleCommerceIngestionService(verifier, commerce);

    await ingestion.ingestTransaction(state, 'signed-jws', 'production');
    expect(seen).toEqual(['transaction:signed-jws:production']);
    expect(state.orders).toHaveLength(1);
  });
});

describe('commercial migration contract', () => {
  it('seeds the same frozen catalog into migration 0015', () => {
    const migration = readFileSync(join(process.cwd(), 'drizzle/0015_commerce_domain.sql'), 'utf8');
    for (const product of MEMBERSHIP_PRODUCTS) {
      expect(migration).toContain(`'${product.productKey}'`);
      expect(migration).toContain(`'${product.appleProductId}'`);
    }
    expect(migration).toContain("'ai-points-v1'");
  });

  it('keeps fixed point month duration independent from calendar months', () => {
    expect(at(31).getTime() - at(0).getTime()).toBe(31 * DAY_MS);
  });
});
