import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { AppleCommerceFoundationBoundary } from '../src/commerce/apple-commerce-ingestion';
import type { AppleStoreVerifier } from '../src/commerce/apple-store-verifier';
import {
  assertReservationAllocationTransaction,
  CommerceFoundationModel,
  createCommerceDomainState,
  replaySpendablePointLedger,
  type VerifiedAppleNotification,
  type VerifiedAppleTransaction,
} from '../src/commerce/commerce-domain';
import {
  COMMERCE_CHANNEL_PRODUCTS,
  MEMBERSHIP_PRODUCTS,
  type CommerceEnvironment,
} from '../src/commerce/product-catalog';

const DAY_MS = 24 * 60 * 60 * 1_000;
const ACCOUNT_A = '00000000-0000-4000-8000-000000000001';
const ACCOUNT_B = '00000000-0000-4000-8000-000000000002';
const ACCOUNT_C = '00000000-0000-4000-8000-000000000003';

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
  signedAt?: Date;
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
    signedDate: input.signedAt ?? purchasedAt,
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
      cadence: product.aiPointBatchIntervalDays,
      batches: product.aiPointBatches.map((batch) => [batch.offsetDays, batch.points]),
    }))).toEqual([
      {
        key: 'membership_7d_v1',
        apple: 'com.readyoufife.ios.membership.7d.v1',
        days: 7,
        fen: 6_800,
        cadence: 31,
        batches: [[0, 250]],
      },
      {
        key: 'membership_15d_v1',
        apple: 'com.readyoufife.ios.membership.15d.v1',
        days: 15,
        fen: 10_800,
        cadence: 31,
        batches: [[0, 500]],
      },
      {
        key: 'membership_31d_v1',
        apple: 'com.readyoufife.ios.membership.31d.v1',
        days: 31,
        fen: 16_800,
        cadence: 31,
        batches: [[0, 1_000]],
      },
      {
        key: 'membership_62d_v1',
        apple: 'com.readyoufife.ios.membership.62d.v1',
        days: 62,
        fen: 29_800,
        cadence: 31,
        batches: [[0, 1_000], [31, 1_000]],
      },
      {
        key: 'membership_93d_v1',
        apple: 'com.readyoufife.ios.membership.93d.v1',
        days: 93,
        fen: 39_800,
        cadence: 31,
        batches: [[0, 1_000], [31, 1_000], [62, 1_000]],
      },
    ]);
    expect(COMMERCE_CHANNEL_PRODUCTS).toEqual(MEMBERSHIP_PRODUCTS.map((product) => ({
      channel: 'apple_app_store',
      externalProductId: product.appleProductId,
      productKey: product.productKey,
    })));
  });
});

describe('CommerceFoundationModel', () => {
  it('makes Apple transactions idempotent and appends repeated purchases sequentially', () => {
    const state = createCommerceDomainState();
    const commerce = new CommerceFoundationModel({ idFactory: ids() });
    const first = appleTransaction({ transactionId: 'tx-1', purchasedAt: at(0) });

    expect(commerce.recordApplePurchase(state, first, at(0)).created).toBe(true);
    expect(commerce.recordApplePurchase(state, first, at(0)).created).toBe(false);
    expect(state.orders).toHaveLength(1);
    expect(commerce.membershipExpiresAt(state, ACCOUNT_A, 'production')).toEqual(at(7));

    commerce.recordApplePurchase(state, appleTransaction({
      transactionId: 'tx-2',
      productId: 'com.readyoufife.ios.membership.15d.v1',
      purchasedAt: at(1),
    }), at(1));
    expect(state.orders).toHaveLength(2);
    expect(commerce.membershipExpiresAt(state, ACCOUNT_A, 'production')).toEqual(at(22));
    expect(state.membershipSegments.filter((segment) => segment.status === 'active')).toHaveLength(2);
    expect(commerce.availableAiPoints(state, ACCOUNT_A, 'production', at(1))).toBe(250);
    expect(commerce.availableAiPoints(state, ACCOUNT_A, 'production', at(7))).toBe(750);
  });

  it('rejects conflicting reuse of an Apple transaction ID', () => {
    const state = createCommerceDomainState();
    const commerce = new CommerceFoundationModel({ idFactory: ids() });
    commerce.recordApplePurchase(state, appleTransaction({ transactionId: 'tx-conflict' }), at(0));
    expect(() => commerce.recordApplePurchase(state, appleTransaction({
      accountId: ACCOUNT_B,
      transactionId: 'tx-conflict',
    }), at(0))).toThrow('apple_transaction_idempotency_conflict');
    expect(() => commerce.recordApplePurchase(state, appleTransaction({
      transactionId: 'tx-conflict',
      payloadHash: 'different-jws-at-same-signed-time',
    }), at(0))).toThrow('apple_transaction_signed_version_conflict');
  });

  it('rebuilds from Apple purchase time when old transactions are discovered later', () => {
    const state = createCommerceDomainState();
    const commerce = new CommerceFoundationModel({ idFactory: ids() });
    commerce.recordApplePurchase(state, appleTransaction({
      transactionId: 'newer-first',
      productId: 'com.readyoufife.ios.membership.15d.v1',
      purchasedAt: at(10),
    }), at(10));
    expect(commerce.membershipExpiresAt(state, ACCOUNT_A, 'production')).toEqual(at(25));

    commerce.recordApplePurchase(state, appleTransaction({
      transactionId: 'late-expired-history',
      purchasedAt: at(0),
      signedAt: at(11),
    }), at(11));
    expect(commerce.membershipExpiresAt(state, ACCOUNT_A, 'production')).toEqual(at(25));
    const expiredOrder = state.orders.find((order) => order.externalOrderId === 'late-expired-history')!;
    expect(expiredOrder).toMatchObject({
      membershipGrantSource: 'purchase_discovery',
      membershipEffectiveAt: at(0),
      membershipContributionMs: 7 * DAY_MS,
    });
    expect(state.membershipSegments.some((segment) => (
      segment.orderId === expiredOrder.id && segment.status === 'active'
    ))).toBe(true);

    commerce.recordApplePurchase(state, appleTransaction({
      transactionId: 'late-partially-valid-history',
      purchasedAt: at(8),
      signedAt: at(11),
    }), at(11));
    expect(commerce.membershipExpiresAt(state, ACCOUNT_A, 'production')).toEqual(at(30));
    const currentSegments = state.membershipSegments.filter((segment) => segment.status === 'active');
    expect(currentSegments.map((segment) => [segment.startsAt, segment.endsAt])).toEqual([
      [at(0), at(7)],
      [at(8), at(15)],
      [at(15), at(30)],
    ]);
    expect(state.orders.find((order) => order.externalOrderId === 'late-partially-valid-history'))
      .toMatchObject({
        membershipGrantSource: 'purchase_discovery',
        membershipEffectiveAt: at(8),
        membershipContributionMs: 7 * DAY_MS,
      });

    commerce.recordApplePurchase(state, appleTransaction({
      transactionId: 'after-all-prior-membership-expired',
      purchasedAt: at(40),
      signedAt: at(40),
    }), at(40));
    expect(commerce.membershipExpiresAt(state, ACCOUNT_A, 'production')).toEqual(at(47));
    commerce.recordApplePurchase(state, appleTransaction({
      transactionId: 'does-not-refill-prior-discoveries',
      purchasedAt: at(41),
      signedAt: at(41),
    }), at(41));
    expect(commerce.membershipExpiresAt(state, ACCOUNT_A, 'production')).toEqual(at(54));
  });

  it('does not refill elapsed membership when historical purchases are refunded or restored', () => {
    const state = createCommerceDomainState();
    const commerce = new CommerceFoundationModel({ idFactory: ids() });
    commerce.recordApplePurchase(state, appleTransaction({
      transactionId: 'current-15d',
      productId: 'com.readyoufife.ios.membership.15d.v1',
      purchasedAt: at(10),
    }), at(10));
    commerce.recordApplePurchase(state, appleTransaction({
      transactionId: 'historical-first',
      purchasedAt: at(0),
      signedAt: at(11),
    }), at(11));

    expect(commerce.membershipExpiresAt(state, ACCOUNT_A, 'production')).toEqual(at(25));
    expect(commerce.refundAppleTransaction(
      state,
      'production',
      'historical-first',
      at(32),
      at(32),
    ).changed).toBe(true);
    expect(commerce.membershipExpiresAt(state, ACCOUNT_A, 'production')).toEqual(at(25));
    expect(commerce.refundAppleTransaction(
      state,
      'production',
      'historical-first',
      at(32),
      at(32),
    ).changed).toBe(false);
    expect(commerce.membershipExpiresAt(state, ACCOUNT_A, 'production')).toEqual(at(25));

    expect(commerce.restoreAppleTransaction(state, 'production', 'historical-first', at(33)).changed)
      .toBe(true);
    expect(commerce.membershipExpiresAt(state, ACCOUNT_A, 'production')).toEqual(at(25));
    const restored = state.orders.find((order) => order.externalOrderId === 'historical-first');
    expect(restored).toMatchObject({
      membershipEffectiveAt: at(0),
      membershipContributionMs: 7 * DAY_MS,
    });
  });

  it('replays multiple same-time discoveries in stable order after one historical refund', () => {
    const state = createCommerceDomainState();
    const commerce = new CommerceFoundationModel({ idFactory: ids() });
    commerce.recordApplePurchase(state, appleTransaction({
      transactionId: 'current-15d',
      productId: 'com.readyoufife.ios.membership.15d.v1',
      purchasedAt: at(10),
    }), at(10));
    commerce.recordApplePurchase(state, appleTransaction({
      transactionId: 'historical-first',
      purchasedAt: at(0),
      signedAt: at(11),
    }), at(11));
    commerce.recordApplePurchase(state, appleTransaction({
      transactionId: 'historical-second',
      purchasedAt: at(8),
      signedAt: at(11),
    }), at(11));
    expect(commerce.membershipExpiresAt(state, ACCOUNT_A, 'production')).toEqual(at(30));
    commerce.refundAppleTransaction(state, 'production', 'historical-first', at(32), at(32));
    expect(commerce.membershipExpiresAt(state, ACCOUNT_A, 'production')).toEqual(at(30));
    expect(state.membershipSegments.filter((segment) => segment.status === 'active')
      .map((segment) => [segment.orderId, segment.startsAt, segment.endsAt])).toEqual([
      [state.orders[2]!.id, at(8), at(15)],
      [state.orders[0]!.id, at(15), at(30)],
    ]);
    expect(commerce.refundAppleTransaction(state, 'production', 'historical-first', at(32), at(32)).changed)
      .toBe(false);
    expect(commerce.membershipExpiresAt(state, ACCOUNT_A, 'production')).toEqual(at(30));
  });

  it('accepts a newer verified JWS for the same transaction and advances revocation once', () => {
    const state = createCommerceDomainState();
    const commerce = new CommerceFoundationModel({ idFactory: ids() });
    commerce.recordApplePurchase(state, appleTransaction({ transactionId: 'tx-status-update' }), at(0));

    const result = commerce.recordApplePurchase(state, appleTransaction({
      transactionId: 'tx-status-update',
      signedAt: at(1),
      payloadHash: 'newer-refund-jws',
      revokedAt: at(1),
    }), at(1));
    expect(result).toMatchObject({ created: false, updated: true, statusUpdateAccepted: true });
    expect(state.orders).toHaveLength(1);
    expect(state.orders[0]).toMatchObject({ status: 'refunded', revokedAt: at(1) });
    expect(state.appleTransactions[0]).toMatchObject({
      signedPayloadHash: 'newer-refund-jws',
      revocationDate: at(1),
    });
    expect(commerce.membershipExpiresAt(state, ACCOUNT_A, 'production')).toBeUndefined();
  });

  it('recalculates only remaining valid membership and unused points after refund', () => {
    const state = createCommerceDomainState();
    const commerce = new CommerceFoundationModel({ idFactory: ids() });
    commerce.recordApplePurchase(
      state,
      appleTransaction({ transactionId: 'tx-refund-1', purchasedAt: at(0) }),
      at(0),
    );
    commerce.recordApplePurchase(state, appleTransaction({
      transactionId: 'tx-refund-2',
      productId: 'com.readyoufife.ios.membership.15d.v1',
      purchasedAt: at(1),
    }), at(1));
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

    expect(commerce.refundAppleTransaction(state, 'production', 'tx-refund-1', at(2), at(2)).changed).toBe(true);
    expect(commerce.refundAppleTransaction(state, 'production', 'tx-refund-1', at(2), at(2)).changed).toBe(false);
    expect(commerce.membershipExpiresAt(state, ACCOUNT_A, 'production')).toEqual(at(16));
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
    const commerce = new CommerceFoundationModel({ idFactory: ids() });
    commerce.grantFreeTrial(state, {
      accountId: ACCOUNT_A,
      environment: 'production',
      grantedAt: at(0),
      externalEligibilityClaimed: true,
    });
    commerce.recordApplePurchase(state, appleTransaction({
      transactionId: 'tx-points',
      productId: 'com.readyoufife.ios.membership.31d.v1',
      purchasedAt: at(0),
    }), at(0));

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

  it('requires the auth-owned lifetime eligibility claim before granting a free trial', () => {
    const state = createCommerceDomainState();
    const commerce = new CommerceFoundationModel({ idFactory: ids() });
    expect(() => commerce.grantFreeTrial(state, {
      accountId: ACCOUNT_A,
      environment: 'production',
      grantedAt: at(0),
      externalEligibilityClaimed: false,
    })).toThrow('free_trial_external_claim_required');
    expect(commerce.grantFreeTrial(state, {
      accountId: ACCOUNT_A,
      environment: 'production',
      grantedAt: at(0),
      externalEligibilityClaimed: true,
    }).created).toBe(true);
    expect(commerce.grantFreeTrial(state, {
      accountId: ACCOUNT_A,
      environment: 'production',
      grantedAt: at(1),
      externalEligibilityClaimed: true,
    }).created).toBe(false);
    expect(state.pointBatches).toHaveLength(1);
  });

  it('asserts allocation totals and account scope inside the reservation transaction boundary', () => {
    const state = createCommerceDomainState();
    const commerce = new CommerceFoundationModel({ idFactory: ids() });
    commerce.grantFreeTrial(state, {
      accountId: ACCOUNT_A,
      environment: 'production',
      grantedAt: at(0),
      externalEligibilityClaimed: true,
    });
    const { reservation } = commerce.reserveAiPoints(state, {
      accountId: ACCOUNT_A,
      environment: 'production',
      operationId: 'allocation-invariant',
      capability: 'transcription_opi',
      at: at(0),
    });
    expect(() => assertReservationAllocationTransaction(state, reservation)).not.toThrow();

    reservation.allocations[0]!.points -= 1;
    expect(() => assertReservationAllocationTransaction(state, reservation))
      .toThrow('ai_reservation_allocation_total_mismatch');
    reservation.allocations[0]!.points += 1;
    const batch = state.pointBatches[0]!;
    batch.accountId = ACCOUNT_B;
    expect(() => assertReservationAllocationTransaction(state, reservation))
      .toThrow('ai_reservation_allocation_scope_mismatch');
  });

  it('keeps the 31-day grant cadence while issued paid points remain usable after membership expiry', () => {
    const state = createCommerceDomainState();
    const commerce = new CommerceFoundationModel({ idFactory: ids() });
    commerce.recordApplePurchase(state, appleTransaction({
      transactionId: 'tx-62',
      productId: 'com.readyoufife.ios.membership.62d.v1',
      purchasedAt: at(0),
    }), at(0));
    expect(commerce.availableAiPoints(state, ACCOUNT_A, 'production', at(0))).toBe(1_000);
    expect(commerce.availableAiPoints(state, ACCOUNT_A, 'production', new Date(at(31).getTime() - 1))).toBe(1_000);

    commerce.recordApplePurchase(
      state,
      appleTransaction({ transactionId: 'tx-extend', purchasedAt: at(10) }),
      at(10),
    );
    expect(commerce.membershipExpiresAt(state, ACCOUNT_A, 'production')).toEqual(at(69));
    const secondBatch = state.pointBatches.find((batch) => (
      batch.sourceOrderId === state.orders[0]!.id && batch.ordinal === 1
    ));
    expect(secondBatch?.availableAt).toEqual(at(31));
    expect(commerce.availableAiPoints(state, ACCOUNT_A, 'production', at(31))).toBe(2_000);
    expect(commerce.availableAiPoints(state, ACCOUNT_A, 'production', at(62))).toBe(2_250);
    expect(commerce.availableAiPoints(state, ACCOUNT_A, 'production', at(100))).toBe(2_250);
    const memberBatches = state.pointBatches.filter((batch) => batch.sourceType === 'membership');
    expect(memberBatches.every((batch) => batch.expiresAt === undefined)).toBe(true);
  });

  it('keeps issued paid points after a membership lapse and refunds only the source order remainder', () => {
    const state = createCommerceDomainState();
    const commerce = new CommerceFoundationModel({ idFactory: ids() });
    commerce.recordApplePurchase(
      state,
      appleTransaction({ transactionId: 'tx-before-lapse', purchasedAt: at(0) }),
      at(0),
    );
    commerce.recordApplePurchase(
      state,
      appleTransaction({ transactionId: 'tx-after-lapse', purchasedAt: at(8) }),
      at(8),
    );

    expect(commerce.membershipExpiresAt(state, ACCOUNT_A, 'production')).toEqual(at(15));
    expect(commerce.availableAiPoints(state, ACCOUNT_A, 'production', at(8))).toBe(500);
    expect(state.pointBatches.filter((batch) => batch.status === 'expired')).toHaveLength(0);
    commerce.refundAppleTransaction(state, 'production', 'tx-before-lapse', at(9), at(9));
    expect(commerce.availableAiPoints(state, ACCOUNT_A, 'production', at(9))).toBe(250);
    expect(state.pointBatches.find((batch) => batch.sourceOrderId === state.orders[0]!.id)?.status)
      .toBe('revoked');
  });

  it('isolates identical Apple identifiers and balances between sandbox and production', () => {
    const state = createCommerceDomainState();
    const commerce = new CommerceFoundationModel({ idFactory: ids() });
    commerce.recordApplePurchase(
      state,
      appleTransaction({ transactionId: 'same-tx', environment: 'sandbox' }),
      at(0),
    );
    commerce.recordApplePurchase(
      state,
      appleTransaction({ transactionId: 'same-tx', environment: 'production' }),
      at(0),
    );
    commerce.recordAppleNotification(state, appleNotification({
      environment: 'sandbox',
      uuid: '00000000-0000-4000-8000-000000000010',
    }), at(0));
    commerce.recordAppleNotification(state, appleNotification({
      environment: 'production',
      uuid: '00000000-0000-4000-8000-000000000010',
    }), at(0));

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
    const commerce = new CommerceFoundationModel({ idFactory: ids() });
    for (const accountId of [ACCOUNT_A, ACCOUNT_B]) {
      commerce.grantFreeTrial(state, {
        accountId,
        environment: 'production',
        grantedAt: at(0),
        externalEligibilityClaimed: true,
      });
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
      }), at(0));
    }

    expect(commerce.mergeAccounts(state, ACCOUNT_B, ACCOUNT_A, at(2)).changed).toBe(true);
    expect(commerce.membershipExpiresAt(state, ACCOUNT_A, 'production')).toEqual(at(12));
    expect(commerce.availableAiPoints(state, ACCOUNT_A, 'production', at(2))).toBe(580);
    expect(state.orders.every((order) => order.accountId === ACCOUNT_A)).toBe(true);
    expect(state.orders.some((order) => order.originalAccountId === ACCOUNT_B)).toBe(true);
    expect(() => commerce.availableAiPoints(state, ACCOUNT_B, 'production', at(2))).toThrow('account_merged');
  });

  it('keeps three-account trial merges directional, replayable, and idempotent', () => {
    const state = createCommerceDomainState();
    const commerce = new CommerceFoundationModel({ idFactory: ids() });
    for (const accountId of [ACCOUNT_A, ACCOUNT_B, ACCOUNT_C]) {
      commerce.grantFreeTrial(state, {
        accountId,
        environment: 'production',
        grantedAt: at(0),
        externalEligibilityClaimed: true,
      });
      commerce.reserveAiPoints(state, {
        accountId,
        environment: 'production',
        operationId: `trial-use-${accountId}`,
        capability: 'transcription_opi',
        at: at(0),
      });
      commerce.settleAiPoints(state, accountId, 'production', `trial-use-${accountId}`, at(0));
    }

    expect(commerce.mergeAccounts(state, ACCOUNT_B, ACCOUNT_A, at(1)).changed).toBe(true);
    expect(commerce.availableAiPoints(state, ACCOUNT_A, 'production', at(1))).toBe(80);
    expect(commerce.mergeAccounts(state, ACCOUNT_C, ACCOUNT_A, at(2)).changed).toBe(true);
    expect(commerce.availableAiPoints(state, ACCOUNT_A, 'production', at(2))).toBe(70);
    const activeTrials = state.pointBatches.filter((batch) => (
      batch.accountId === ACCOUNT_A
      && batch.environment === 'production'
      && batch.sourceType === 'trial'
      && batch.status === 'available'
    ));
    expect(activeTrials).toHaveLength(1);
    expect(state.pointBatches.filter((batch) => batch.status === 'merged')).toHaveLength(4);
    const accountLedger = state.pointLedger.filter((entry) => (
      entry.accountId === ACCOUNT_A && entry.environment === 'production'
    ));
    expect(replaySpendablePointLedger(accountLedger)).toBe(70);
    const beforeReplay = state.pointLedger.length;
    expect(commerce.mergeAccounts(state, ACCOUNT_C, ACCOUNT_A, at(3)).changed).toBe(false);
    expect(state.pointLedger).toHaveLength(beforeReplay);
  });

  it('makes notifications idempotent and routes verified refund facts through the order ledger', () => {
    const state = createCommerceDomainState();
    const commerce = new CommerceFoundationModel({ idFactory: ids() });
    const transaction = appleTransaction({ transactionId: 'notification-tx' });
    const purchase = appleNotification({
      uuid: '00000000-0000-4000-8000-000000000011',
      transaction,
    });
    expect(commerce.recordAppleNotification(state, purchase, at(0)).created).toBe(true);
    expect(commerce.recordAppleNotification(state, purchase, at(0)).created).toBe(false);
    expect(() => commerce.recordAppleNotification(state, {
      ...purchase,
      signedPayloadHash: 'different-payload-for-same-uuid',
    }, at(0))).toThrow('apple_notification_idempotency_conflict');

    const refund = appleNotification({
      uuid: '00000000-0000-4000-8000-000000000012',
      type: 'REFUND',
      signedAt: at(1),
      transaction: {
        ...transaction,
        signedDate: at(1),
        signedPayloadHash: 'refund-transaction-hash',
        revocationDate: at(1),
      },
    });
    commerce.recordAppleNotification(state, refund, at(1));
    expect(state.orders).toHaveLength(1);
    expect(state.orders[0]?.status).toBe('refunded');
    expect(state.appleNotifications).toHaveLength(2);
    expect(commerce.membershipExpiresAt(state, ACCOUNT_A, 'production')).toBeUndefined();
  });

  it('restores a refunded transaction from REFUND_REVERSED without replay inflation or stale regression', () => {
    const state = createCommerceDomainState();
    const commerce = new CommerceFoundationModel({ idFactory: ids() });
    const purchaseTransaction = appleTransaction({ transactionId: 'refund-reversed-tx' });
    commerce.recordAppleNotification(state, appleNotification({
      uuid: '00000000-0000-4000-8000-000000000021',
      transaction: purchaseTransaction,
    }), at(0));
    commerce.recordAppleNotification(state, appleNotification({
      uuid: '00000000-0000-4000-8000-000000000022',
      type: 'REFUND',
      signedAt: at(1),
      transaction: appleTransaction({
        transactionId: 'refund-reversed-tx',
        signedAt: at(1),
        revokedAt: at(1),
        payloadHash: 'refund-jws',
      }),
    }), at(1));
    expect(state.orders[0]?.status).toBe('refunded');

    const reversal = appleNotification({
      uuid: '00000000-0000-4000-8000-000000000023',
      type: 'REFUND_REVERSED',
      signedAt: at(10),
      transaction: appleTransaction({
        transactionId: 'refund-reversed-tx',
        signedAt: at(10),
        payloadHash: 'reversal-jws',
      }),
    });
    expect(commerce.recordAppleNotification(state, reversal, at(10)).created).toBe(true);
    expect(state.orders[0]?.status).toBe('verified');
    expect(state.orders[0]).toMatchObject({
      membershipGrantSource: 'refund_restore',
      membershipContributionMs: 7 * DAY_MS,
    });
    expect(commerce.membershipExpiresAt(state, ACCOUNT_A, 'production')).toEqual(at(7));
    expect(commerce.availableAiPoints(state, ACCOUNT_A, 'production', at(10))).toBe(250);
    const ledgerLength = state.pointLedger.length;
    expect(commerce.recordAppleNotification(state, reversal, at(10)).created).toBe(false);
    expect(state.pointLedger).toHaveLength(ledgerLength);

    commerce.recordAppleNotification(state, appleNotification({
      uuid: '00000000-0000-4000-8000-000000000024',
      type: 'REFUND',
      signedAt: at(1),
      transaction: appleTransaction({
        transactionId: 'refund-reversed-tx',
        signedAt: at(1),
        revokedAt: at(1),
        payloadHash: 'stale-refund-jws',
      }),
    }), at(11));
    expect(state.orders[0]?.status).toBe('verified');
    expect(commerce.membershipExpiresAt(state, ACCOUNT_A, 'production')).toEqual(at(7));
    expect(commerce.availableAiPoints(state, ACCOUNT_A, 'production', at(11))).toBe(250);
    expect(state.appleNotifications).toHaveLength(4);
  });

  it('keeps repeated refund and reversal cycles symmetric and replayable', () => {
    const state = createCommerceDomainState();
    const commerce = new CommerceFoundationModel({ idFactory: ids() });
    commerce.recordAppleNotification(state, appleNotification({
      uuid: '00000000-0000-4000-8000-000000000031',
      transaction: appleTransaction({ transactionId: 'repeated-refund-tx' }),
    }), at(0));

    const refund = (cycle: number) => appleNotification({
      uuid: `00000000-0000-4000-8000-00000000003${cycle * 2}`,
      type: 'REFUND',
      signedAt: at((cycle * 2) - 1),
      transaction: appleTransaction({
        transactionId: 'repeated-refund-tx',
        signedAt: at((cycle * 2) - 1),
        revokedAt: at((cycle * 2) - 1),
        payloadHash: `refund-cycle-${cycle}`,
      }),
    });
    const reversal = (cycle: number) => appleNotification({
      uuid: `00000000-0000-4000-8000-00000000003${(cycle * 2) + 1}`,
      type: 'REFUND_REVERSED',
      signedAt: at(cycle * 2),
      transaction: appleTransaction({
        transactionId: 'repeated-refund-tx',
        signedAt: at(cycle * 2),
        payloadHash: `reversal-cycle-${cycle}`,
      }),
    });

    for (const cycle of [1, 2]) {
      commerce.recordAppleNotification(state, refund(cycle), at((cycle * 2) - 1));
      expect(commerce.availableAiPoints(state, ACCOUNT_A, 'production', at((cycle * 2) - 1))).toBe(0);
      const reverseNotification = reversal(cycle);
      commerce.recordAppleNotification(state, reverseNotification, at(cycle * 2));
      expect(commerce.availableAiPoints(state, ACCOUNT_A, 'production', at(cycle * 2))).toBe(250);
      const beforeReplay = state.pointLedger.length;
      expect(commerce.recordAppleNotification(state, reverseNotification, at(cycle * 2)).created).toBe(false);
      expect(state.pointLedger).toHaveLength(beforeReplay);
    }

    const accountLedger = state.pointLedger.filter((entry) => (
      entry.accountId === ACCOUNT_A && entry.environment === 'production'
    ));
    expect(replaySpendablePointLedger(accountLedger)).toBe(250);
    expect(accountLedger.filter((entry) => entry.entryType === 'revoke')).toHaveLength(2);
    expect(accountLedger.filter((entry) => entry.entryType === 'restore')).toHaveLength(2);
    expect(new Set(accountLedger.filter((entry) => (
      entry.entryType === 'revoke' || entry.entryType === 'restore'
    )).map((entry) => entry.operationId)).size).toBe(4);
  });
});

describe('AppleCommerceFoundationBoundary', () => {
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
    const commerce = new CommerceFoundationModel({ idFactory: ids() });
    const ingestion = new AppleCommerceFoundationBoundary(verifier, commerce, () => at(0));

    await ingestion.ingestTransaction(state, 'signed-jws', 'production');
    expect(seen).toEqual(['transaction:signed-jws:production']);
    expect(state.orders).toHaveLength(1);
  });
});

describe('commercial migration contract', () => {
  it('seeds the same frozen catalog into migration 0015', () => {
    const migration = readFileSync(join(process.cwd(), 'drizzle/0015_commerce_domain.sql'), 'utf8');
    for (const product of MEMBERSHIP_PRODUCTS) {
      const pointsPerBatch = product.aiPointBatches[0]!.points;
      expect(product.aiPointBatches.every((batch) => batch.points === pointsPerBatch)).toBe(true);
      expect(product.aiPointBatches.every((batch, ordinal) => (
        batch.offsetDays === ordinal * product.aiPointBatchIntervalDays
      ))).toBe(true);
      expect(migration).toContain(
        `('${product.productKey}', '${product.displayName}', ${product.durationDays}, `
        + `${product.basePriceCnyFen}, '${product.aiPointRuleVersion}', `
        + `${product.aiPointBatches.length}, ${product.aiPointBatchIntervalDays}, ${pointsPerBatch})`,
      );
      expect(migration).toContain(
        `('apple_app_store', '${product.appleProductId}', '${product.productKey}')`,
      );
    }
  });

  it('keeps fixed point month duration independent from calendar months', () => {
    expect(at(31).getTime() - at(0).getTime()).toBe(31 * DAY_MS);
  });

  it('keeps batch expiry nullable so issued App Store credits are not tied to membership expiry', () => {
    const migration = readFileSync(join(process.cwd(), 'drizzle/0015_commerce_domain.sql'), 'utf8');
    expect(migration).toContain('"expires_at" timestamp with time zone,');
    expect(migration).not.toContain('"expires_at" timestamp with time zone NOT NULL');
  });
});
