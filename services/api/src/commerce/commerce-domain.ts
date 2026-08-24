import { randomUUID } from 'node:crypto';

import {
  AI_POINT_RULE_VERSION,
  type CommerceEnvironment,
  requireMembershipProductByKey,
  requireMembershipProductForChannel,
} from './product-catalog';

const DAY_MS = 24 * 60 * 60 * 1_000;
const FREE_TRIAL_POINTS = 100;

export const AI_POINT_COSTS = {
  local_dictionary_lookup: 0,
  transcription: 5,
  grammar_correction: 3,
  opi_refinement: 5,
  transcription_grammar: 8,
  transcription_opi: 10,
} as const;

export type AiCapability = keyof typeof AI_POINT_COSTS;
export type BillableAiCapability = Exclude<AiCapability, 'local_dictionary_lookup'>;

export type VerifiedAppleTransaction = Readonly<{
  environment: CommerceEnvironment;
  transactionId: string;
  originalTransactionId: string;
  productId: string;
  bundleId: string;
  appAccountToken?: string;
  purchaseDate: Date;
  signedDate: Date;
  revocationDate?: Date;
  revocationReason?: number;
  storefront?: string;
  currency?: string;
  priceMilliunits?: number;
  productType: 'non_renewing_subscription';
  quantity: 1;
  signedPayloadHash: string;
  decodedPayload: Readonly<Record<string, unknown>>;
}>;

export type VerifiedAppleNotification = Readonly<{
  environment: CommerceEnvironment;
  notificationUuid: string;
  notificationType: string;
  subtype?: string;
  signedDate: Date;
  signedPayloadHash: string;
  decodedPayload: Readonly<Record<string, unknown>>;
  transaction?: VerifiedAppleTransaction;
}>;

export type CommerceOrder = {
  id: string;
  environment: CommerceEnvironment;
  accountId: string;
  originalAccountId: string;
  externalOrderId: string;
  productKey: string;
  externalProductId: string;
  durationDays: number;
  aiPointRuleVersion: string;
  membershipGrantSource: 'purchase_discovery' | 'refund_restore';
  membershipEffectiveAt: Date;
  membershipContributionMs: number;
  status: 'verified' | 'refunded' | 'revoked';
  purchasedAt: Date;
  revokedAt?: Date;
  revocationCycleKey?: string;
};

type Mutable<T> = { -readonly [Key in keyof T]: T[Key] };

export type AppleTransactionRecord = Mutable<VerifiedAppleTransaction> & {
  orderId: string;
  accountId: string;
};

export type AppleNotificationRecord = VerifiedAppleNotification & {
  status: 'processed';
  processedAt: Date;
};

export type MembershipEntitlementSegment = {
  id: string;
  environment: CommerceEnvironment;
  accountId: string;
  orderId: string;
  revision: number;
  startsAt: Date;
  endsAt: Date;
  status: 'active' | 'superseded' | 'revoked';
  supersededAt?: Date;
  revokedAt?: Date;
};

export type AiPointBatch = {
  id: string;
  environment: CommerceEnvironment;
  accountId: string;
  originalAccountId: string;
  sourceType: 'trial' | 'membership' | 'compensation';
  sourceReference: string;
  sourceOrderId?: string;
  entitlementSegmentId?: string;
  ruleVersion: string;
  ordinal: number;
  grantedPoints: number;
  consumedPoints: number;
  reservedPoints: number;
  availableAt: Date;
  expiresAt?: Date;
  status: 'scheduled' | 'available' | 'expired' | 'revoked' | 'merged';
  revokedAt?: Date;
  createdAt: Date;
};

export type AiPointReservation = {
  id: string;
  environment: CommerceEnvironment;
  accountId: string;
  operationId: string;
  capability: BillableAiCapability;
  ruleVersion: string;
  points: number;
  status: 'reserved' | 'settled' | 'released';
  allocations: Array<{ batchId: string; points: number }>;
  createdAt: Date;
  settledAt?: Date;
  releasedAt?: Date;
};

export type AiPointLedgerEntry = {
  id: string;
  environment: CommerceEnvironment;
  accountId: string;
  batchId: string;
  reservationId?: string;
  operationId: string;
  entryType:
    | 'grant'
    | 'reserve'
    | 'settle'
    | 'release'
    | 'revoke'
    | 'expire'
    | 'restore'
    | 'merge_debit'
    | 'merge_credit';
  direction: 'credit' | 'debit' | 'neutral';
  points: number;
  createdAt: Date;
};

export type CommerceDomainState = {
  orders: CommerceOrder[];
  appleTransactions: AppleTransactionRecord[];
  appleNotifications: AppleNotificationRecord[];
  membershipSegments: MembershipEntitlementSegment[];
  pointBatches: AiPointBatch[];
  pointReservations: AiPointReservation[];
  pointLedger: AiPointLedgerEntry[];
  mergedAccounts: Map<string, string>;
};

export type CommerceDomainOptions = {
  idFactory?: () => string;
};

export function createCommerceDomainState(): CommerceDomainState {
  return {
    orders: [],
    appleTransactions: [],
    appleNotifications: [],
    membershipSegments: [],
    pointBatches: [],
    pointReservations: [],
    pointLedger: [],
    mergedAccounts: new Map(),
  };
}

function sameTime(left?: Date, right?: Date) {
  return left?.getTime() === right?.getTime();
}

function addDays(value: Date, days: number) {
  return new Date(value.getTime() + (days * DAY_MS));
}

function assertEnvironment(environment: string): asserts environment is CommerceEnvironment {
  if (environment !== 'sandbox' && environment !== 'production') {
    throw new Error('invalid_commerce_environment');
  }
}

function resolveMergedAccount(state: CommerceDomainState, accountId: string) {
  let current = accountId;
  const visited = new Set<string>();
  while (state.mergedAccounts.has(current)) {
    if (visited.has(current)) throw new Error('account_merge_cycle');
    visited.add(current);
    current = state.mergedAccounts.get(current)!;
  }
  return current;
}

function assertAccountCanUseAi(state: CommerceDomainState, accountId: string) {
  if (state.mergedAccounts.has(accountId)) throw new Error('account_merged');
}

function ledgerEntryExists(
  state: CommerceDomainState,
  input: Pick<AiPointLedgerEntry, 'environment' | 'accountId' | 'operationId' | 'entryType' | 'batchId'>,
) {
  return state.pointLedger.some((entry) => (
    entry.environment === input.environment
    && entry.accountId === input.accountId
    && entry.operationId === input.operationId
    && entry.entryType === input.entryType
    && entry.batchId === input.batchId
  ));
}

/**
 * Cross-row allocation totals cannot be expressed as a PostgreSQL CHECK. The
 * 0015 migration therefore enforces them with deferred constraint triggers at
 * commit; this assertion provides the same fail-fast rule in the pure model.
 */
export function assertReservationAllocationTransaction(
  state: CommerceDomainState,
  reservation: AiPointReservation,
) {
  const uniqueBatchIds = new Set<string>();
  let allocatedPoints = 0;
  for (const allocation of reservation.allocations) {
    if (uniqueBatchIds.has(allocation.batchId)) throw new Error('duplicate_ai_reservation_batch');
    uniqueBatchIds.add(allocation.batchId);
    const batch = state.pointBatches.find((candidate) => candidate.id === allocation.batchId);
    if (!batch) throw new Error('ai_point_batch_not_found');
    if (
      batch.environment !== reservation.environment
      || batch.accountId !== reservation.accountId
    ) throw new Error('ai_reservation_allocation_scope_mismatch');
    if (!Number.isInteger(allocation.points) || allocation.points <= 0) {
      throw new Error('invalid_ai_reservation_allocation');
    }
    allocatedPoints += allocation.points;
  }
  if (allocatedPoints !== reservation.points) throw new Error('ai_reservation_allocation_total_mismatch');
}

export function replaySpendablePointLedger(entries: readonly AiPointLedgerEntry[]) {
  return entries.reduce((balance, entry) => {
    if (entry.direction === 'credit') return balance + entry.points;
    if (entry.direction === 'debit') return balance - entry.points;
    return balance;
  }, 0);
}

/**
 * Pure, in-memory reference model for commerce invariants.
 *
 * This is deliberately not a Nest provider and must not be registered in AppModule.
 * A later integration phase must load/persist the state in one locked database
 * transaction. The database remains authoritative through deferred constraint
 * triggers, with the exported assertion used for earlier application feedback.
 */
export class CommerceFoundationModel {
  private readonly idFactory: () => string;

  constructor(options: CommerceDomainOptions = {}) {
    this.idFactory = options.idFactory ?? randomUUID;
  }

  recordApplePurchase(
    state: CommerceDomainState,
    transaction: VerifiedAppleTransaction,
    processedAt: Date,
  ) {
    assertEnvironment(transaction.environment);
    if (transaction.purchaseDate > processedAt) throw new Error('apple_purchase_after_processing_time');
    const product = requireMembershipProductForChannel('apple_app_store', transaction.productId);
    if (!transaction.appAccountToken) throw new Error('apple_app_account_token_required');
    const accountId = resolveMergedAccount(state, transaction.appAccountToken);
    const existing = state.appleTransactions.find((candidate) => (
      candidate.environment === transaction.environment
      && candidate.transactionId === transaction.transactionId
    ));
    if (existing) {
      if (
        existing.accountId !== accountId
        || existing.productId !== transaction.productId
        || existing.originalTransactionId !== transaction.originalTransactionId
        || existing.bundleId !== transaction.bundleId
        || !sameTime(existing.purchaseDate, transaction.purchaseDate)
      ) throw new Error('apple_transaction_idempotency_conflict');
      const order = this.requireOrder(state, existing.orderId);
      let updated = false;
      const signedDateComparison = transaction.signedDate.getTime() - existing.signedDate.getTime();
      const exactReplay = signedDateComparison === 0
        && transaction.signedPayloadHash === existing.signedPayloadHash;
      if (signedDateComparison === 0 && !exactReplay) {
        throw new Error('apple_transaction_signed_version_conflict');
      }
      const statusUpdateAccepted = signedDateComparison > 0 || exactReplay;
      if (signedDateComparison > 0) {
        existing.signedDate = new Date(transaction.signedDate);
        existing.signedPayloadHash = transaction.signedPayloadHash;
        existing.decodedPayload = transaction.decodedPayload;
        existing.storefront = transaction.storefront;
        existing.currency = transaction.currency;
        existing.priceMilliunits = transaction.priceMilliunits;
        updated = true;
      }
      if (transaction.revocationDate && statusUpdateAccepted) {
        existing.revocationDate = new Date(transaction.revocationDate);
        existing.revocationReason = transaction.revocationReason;
        const result = this.refundAppleTransaction(
          state,
          transaction.environment,
          transaction.transactionId,
          transaction.revocationDate,
          processedAt,
        );
        updated = updated || result.changed;
      }
      return { created: false, updated, statusUpdateAccepted, order };
    }

    const order: CommerceOrder = {
      id: this.idFactory(),
      environment: transaction.environment,
      accountId,
      originalAccountId: transaction.appAccountToken,
      externalOrderId: transaction.transactionId,
      productKey: product.productKey,
      externalProductId: transaction.productId,
      durationDays: product.durationDays,
      aiPointRuleVersion: product.aiPointRuleVersion,
      membershipGrantSource: 'purchase_discovery',
      membershipEffectiveAt: new Date(transaction.purchaseDate),
      membershipContributionMs: product.durationDays * DAY_MS,
      status: 'verified',
      purchasedAt: new Date(transaction.purchaseDate),
    };
    state.orders.push(order);
    state.appleTransactions.push({
      ...transaction,
      orderId: order.id,
      accountId,
    });

    this.rebuildMembership(
      state,
      accountId,
      transaction.environment,
      processedAt,
    );
    if (transaction.revocationDate) {
      this.refundAppleTransaction(
        state,
        transaction.environment,
        transaction.transactionId,
        transaction.revocationDate,
        processedAt,
      );
    }
    return { created: true, updated: false, statusUpdateAccepted: true, order };
  }

  recordAppleNotification(
    state: CommerceDomainState,
    notification: VerifiedAppleNotification,
    processedAt: Date,
  ) {
    assertEnvironment(notification.environment);
    if (notification.transaction && notification.transaction.environment !== notification.environment) {
      throw new Error('apple_notification_environment_mismatch');
    }
    const existing = state.appleNotifications.find((candidate) => (
      candidate.environment === notification.environment
      && candidate.notificationUuid === notification.notificationUuid
    ));
    if (existing) {
      if (existing.signedPayloadHash !== notification.signedPayloadHash) {
        throw new Error('apple_notification_idempotency_conflict');
      }
      return { created: false, notification: existing };
    }

    if (notification.transaction) {
      const knownTransaction = state.appleTransactions.find((candidate) => (
        candidate.environment === notification.environment
        && candidate.transactionId === notification.transaction!.transactionId
      ));
      const transaction = notification.transaction.appAccountToken || !knownTransaction
        ? notification.transaction
        : { ...notification.transaction, appAccountToken: knownTransaction.accountId };
      const transactionResult = this.recordApplePurchase(state, transaction, processedAt);
      if (
        transactionResult.statusUpdateAccepted
        && notification.notificationType === 'REFUND_REVERSED'
      ) {
        this.restoreAppleTransaction(
          state,
          notification.environment,
          transaction.transactionId,
          processedAt,
        );
      } else if (transactionResult.statusUpdateAccepted && (
        transaction.revocationDate
        || notification.notificationType === 'REFUND'
        || notification.notificationType === 'REVOKE'
      )) {
        this.refundAppleTransaction(
          state,
          notification.environment,
          transaction.transactionId,
          transaction.revocationDate ?? processedAt,
          processedAt,
          transaction.revocationDate
            ? undefined
            : `notification:${notification.notificationUuid}`,
        );
      }
    }

    const record: AppleNotificationRecord = {
      ...notification,
      status: 'processed',
      processedAt: new Date(processedAt),
    };
    state.appleNotifications.push(record);
    return { created: true, notification: record };
  }

  refundAppleTransaction(
    state: CommerceDomainState,
    environment: CommerceEnvironment,
    transactionId: string,
    revokedAt: Date,
    processedAt: Date,
    cycleKey?: string,
  ) {
    assertEnvironment(environment);
    const transaction = state.appleTransactions.find((candidate) => (
      candidate.environment === environment && candidate.transactionId === transactionId
    ));
    if (!transaction) throw new Error('apple_transaction_not_found');
    const order = this.requireOrder(state, transaction.orderId);
    if (order.status === 'refunded' || order.status === 'revoked') {
      return { changed: false, order };
    }
    const stableCycleKey = cycleKey
      ?? `transaction:${environment}:${transactionId}:${transaction.signedPayloadHash}:${revokedAt.toISOString()}`;
    order.status = 'refunded';
    order.revokedAt = new Date(revokedAt);
    order.revocationCycleKey = stableCycleKey;
    transaction.revocationDate = new Date(revokedAt);
    this.revokeOrderBenefits(state, order, revokedAt, stableCycleKey);
    this.rebuildMembership(state, order.accountId, environment, processedAt);
    return { changed: true, order };
  }

  restoreAppleTransaction(
    state: CommerceDomainState,
    environment: CommerceEnvironment,
    transactionId: string,
    processedAt: Date,
  ) {
    assertEnvironment(environment);
    const transaction = state.appleTransactions.find((candidate) => (
      candidate.environment === environment && candidate.transactionId === transactionId
    ));
    if (!transaction) throw new Error('apple_transaction_not_found');
    const order = this.requireOrder(state, transaction.orderId);
    if (order.status === 'verified') return { changed: false, order };
    const revocationCycleKey = order.revocationCycleKey;
    if (!revocationCycleKey) throw new Error('apple_refund_cycle_missing');
    order.status = 'verified';
    order.revokedAt = undefined;
    order.membershipGrantSource = 'refund_restore';
    transaction.revocationDate = undefined;
    transaction.revocationReason = undefined;
    this.rebuildMembership(state, order.accountId, environment, processedAt);
    this.restoreOrderPointBatches(
      state,
      order,
      revocationCycleKey,
      processedAt,
    );
    order.revocationCycleKey = undefined;
    return { changed: true, order };
  }

  /**
   * The auth-owned lifetime identity claim must already be atomically occupied.
   * This model intentionally does not create a competing identity-claim table.
   */
  grantFreeTrial(
    state: CommerceDomainState,
    input: Readonly<{
      accountId: string;
      environment: CommerceEnvironment;
      grantedAt: Date;
      externalEligibilityClaimed: boolean;
    }>,
  ) {
    const { accountId, environment, grantedAt } = input;
    assertEnvironment(environment);
    assertAccountCanUseAi(state, accountId);
    if (!input.externalEligibilityClaimed) throw new Error('free_trial_external_claim_required');
    const existing = state.pointBatches.find((batch) => (
      batch.environment === environment
      && batch.accountId === accountId
      && batch.sourceType === 'trial'
    ));
    if (existing) return { created: false, batch: existing };
    const batch = this.createPointBatch({
      state,
      environment,
      accountId,
      originalAccountId: accountId,
      sourceType: 'trial',
      sourceReference: `trial:${accountId}`,
      ruleVersion: AI_POINT_RULE_VERSION,
      ordinal: 0,
      points: FREE_TRIAL_POINTS,
      availableAt: grantedAt,
      createdAt: grantedAt,
    });
    return { created: true, batch };
  }

  reserveAiPoints(
    state: CommerceDomainState,
    input: Readonly<{
      accountId: string;
      environment: CommerceEnvironment;
      operationId: string;
      capability: BillableAiCapability;
      at: Date;
    }>,
  ) {
    assertEnvironment(input.environment);
    assertAccountCanUseAi(state, input.accountId);
    const points = AI_POINT_COSTS[input.capability];
    if (!points) throw new Error('ai_capability_not_billable');
    const existing = state.pointReservations.find((reservation) => (
      reservation.environment === input.environment
      && reservation.accountId === input.accountId
      && reservation.operationId === input.operationId
    ));
    if (existing) {
      if (existing.capability !== input.capability || existing.points !== points) {
        throw new Error('ai_operation_idempotency_conflict');
      }
      return { created: false, reservation: existing };
    }

    this.expirePointBatches(state, input.accountId, input.environment, input.at);
    const batches = this.availableBatches(state, input.accountId, input.environment, input.at);
    const totalAvailable = batches.reduce(
      (sum, batch) => sum + batch.grantedPoints - batch.consumedPoints - batch.reservedPoints,
      0,
    );
    if (totalAvailable < points) throw new Error('insufficient_ai_points');

    let remaining = points;
    const allocations: AiPointReservation['allocations'] = [];
    for (const batch of batches) {
      const available = batch.grantedPoints - batch.consumedPoints - batch.reservedPoints;
      const allocated = Math.min(remaining, available);
      if (allocated <= 0) continue;
      batch.reservedPoints += allocated;
      allocations.push({ batchId: batch.id, points: allocated });
      remaining -= allocated;
      if (remaining === 0) break;
    }
    const reservation: AiPointReservation = {
      id: this.idFactory(),
      environment: input.environment,
      accountId: input.accountId,
      operationId: input.operationId,
      capability: input.capability,
      ruleVersion: AI_POINT_RULE_VERSION,
      points,
      status: 'reserved',
      allocations,
      createdAt: new Date(input.at),
    };
    assertReservationAllocationTransaction(state, reservation);
    state.pointReservations.push(reservation);
    for (const allocation of allocations) {
      this.appendLedger(state, {
        environment: input.environment,
        accountId: input.accountId,
        batchId: allocation.batchId,
        reservationId: reservation.id,
        operationId: input.operationId,
        entryType: 'reserve',
        direction: 'debit',
        points: allocation.points,
        createdAt: input.at,
      });
    }
    return { created: true, reservation };
  }

  settleAiPoints(
    state: CommerceDomainState,
    accountId: string,
    environment: CommerceEnvironment,
    operationId: string,
    settledAt: Date,
  ) {
    assertEnvironment(environment);
    assertAccountCanUseAi(state, accountId);
    const reservation = this.requireReservation(state, accountId, environment, operationId);
    if (reservation.status === 'settled') return { changed: false, reservation };
    if (reservation.status === 'released') throw new Error('ai_reservation_already_released');
    for (const allocation of reservation.allocations) {
      const batch = this.requireBatch(state, allocation.batchId);
      batch.reservedPoints -= allocation.points;
      batch.consumedPoints += allocation.points;
      this.appendLedger(state, {
        environment,
        accountId,
        batchId: batch.id,
        reservationId: reservation.id,
        operationId,
        entryType: 'settle',
        direction: 'neutral',
        points: allocation.points,
        createdAt: settledAt,
      });
    }
    reservation.status = 'settled';
    reservation.settledAt = new Date(settledAt);
    return { changed: true, reservation };
  }

  releaseAiPoints(
    state: CommerceDomainState,
    accountId: string,
    environment: CommerceEnvironment,
    operationId: string,
    releasedAt: Date,
  ) {
    assertEnvironment(environment);
    assertAccountCanUseAi(state, accountId);
    const reservation = this.requireReservation(state, accountId, environment, operationId);
    if (reservation.status === 'released') return { changed: false, reservation };
    if (reservation.status === 'settled') throw new Error('ai_reservation_already_settled');
    this.releaseReservation(state, reservation, releasedAt);
    return { changed: true, reservation };
  }

  mergeAccounts(
    state: CommerceDomainState,
    sourceAccountId: string,
    targetAccountId: string,
    mergedAt: Date,
  ) {
    if (sourceAccountId === targetAccountId) return { changed: false, targetAccountId };
    if (state.mergedAccounts.has(sourceAccountId)) {
      const resolvedSource = resolveMergedAccount(state, sourceAccountId);
      const resolvedTarget = resolveMergedAccount(state, targetAccountId);
      if (resolvedSource === resolvedTarget) return { changed: false, targetAccountId: resolvedTarget };
      throw new Error('account_merge_state_changed');
    }
    assertAccountCanUseAi(state, sourceAccountId);
    assertAccountCanUseAi(state, targetAccountId);

    for (const reservation of state.pointReservations.filter((candidate) => (
      candidate.accountId === sourceAccountId && candidate.status === 'reserved'
    ))) {
      this.releaseReservation(state, reservation, mergedAt);
    }

    const operationIds = new Set(
      state.pointReservations
        .filter((reservation) => reservation.accountId === targetAccountId)
        .map((reservation) => `${reservation.environment}:${reservation.operationId}`),
    );
    for (const reservation of state.pointReservations.filter((candidate) => candidate.accountId === sourceAccountId)) {
      const oldOperationId = reservation.operationId;
      if (operationIds.has(`${reservation.environment}:${reservation.operationId}`)) {
        reservation.operationId = `merged:${sourceAccountId}:${reservation.operationId}`;
        for (const entry of state.pointLedger.filter((candidate) => (
          candidate.reservationId === reservation.id && candidate.operationId === oldOperationId
        ))) entry.operationId = reservation.operationId;
      }
      operationIds.add(`${reservation.environment}:${reservation.operationId}`);
      reservation.accountId = targetAccountId;
    }

    for (const environment of ['sandbox', 'production'] as const) {
      this.rebaseMembershipContributionsForMerge(
        state,
        sourceAccountId,
        targetAccountId,
        environment,
        mergedAt,
      );
    }

    for (const order of state.orders.filter((candidate) => candidate.accountId === sourceAccountId)) {
      order.accountId = targetAccountId;
    }
    for (const transaction of state.appleTransactions.filter((candidate) => candidate.accountId === sourceAccountId)) {
      transaction.accountId = targetAccountId;
    }
    for (const segment of state.membershipSegments.filter((candidate) => candidate.accountId === sourceAccountId)) {
      segment.accountId = targetAccountId;
    }
    for (const batch of state.pointBatches.filter((candidate) => candidate.accountId === sourceAccountId)) {
      batch.accountId = targetAccountId;
    }
    for (const entry of state.pointLedger.filter((candidate) => candidate.accountId === sourceAccountId)) {
      entry.accountId = targetAccountId;
    }

    state.mergedAccounts.set(sourceAccountId, targetAccountId);
    for (const environment of ['sandbox', 'production'] as const) {
      this.rebuildMembership(state, targetAccountId, environment, mergedAt);
      this.rebuildMergedTrial(state, sourceAccountId, targetAccountId, environment, mergedAt);
    }
    return { changed: true, targetAccountId };
  }

  private rebaseMembershipContributionsForMerge(
    state: CommerceDomainState,
    sourceAccountId: string,
    targetAccountId: string,
    environment: CommerceEnvironment,
    mergedAt: Date,
  ) {
    for (const order of state.orders.filter((candidate) => (
      candidate.environment === environment
      && candidate.status === 'verified'
      && (candidate.accountId === sourceAccountId || candidate.accountId === targetAccountId)
    ))) {
      const segment = state.membershipSegments.find((candidate) => (
        candidate.environment === environment
        && candidate.orderId === order.id
        && candidate.status === 'active'
      ));
      if (!segment || segment.endsAt <= mergedAt) {
        order.membershipEffectiveAt = new Date(mergedAt);
        order.membershipContributionMs = 0;
        continue;
      }
      const effectiveAt = segment.startsAt > mergedAt ? segment.startsAt : mergedAt;
      order.membershipEffectiveAt = new Date(effectiveAt);
      order.membershipContributionMs = segment.endsAt.getTime() - effectiveAt.getTime();
    }
  }

  availableAiPoints(
    state: CommerceDomainState,
    accountId: string,
    environment: CommerceEnvironment,
    at: Date,
  ) {
    assertEnvironment(environment);
    assertAccountCanUseAi(state, accountId);
    this.expirePointBatches(state, accountId, environment, at);
    return this.availableBatches(state, accountId, environment, at).reduce(
      (sum, batch) => sum + batch.grantedPoints - batch.consumedPoints - batch.reservedPoints,
      0,
    );
  }

  membershipExpiresAt(
    state: CommerceDomainState,
    accountId: string,
    environment: CommerceEnvironment,
  ) {
    const active = state.membershipSegments.filter((segment) => (
      segment.accountId === accountId
      && segment.environment === environment
      && segment.status === 'active'
    ));
    return active.reduce<Date | undefined>((latest, segment) => (
      !latest || segment.endsAt > latest ? segment.endsAt : latest
    ), undefined);
  }

  private rebuildMembership(
    state: CommerceDomainState,
    accountId: string,
    environment: CommerceEnvironment,
    asOf: Date,
  ) {
    this.expirePointBatches(state, accountId, environment, asOf);
    const activeSegments = state.membershipSegments.filter((segment) => (
      segment.accountId === accountId
      && segment.environment === environment
      && segment.status === 'active'
    ));
    const activeByOrder = new Map(activeSegments.map((segment) => [segment.orderId, segment]));
    const validOrders = state.orders
      .filter((order) => (
        order.accountId === accountId
        && order.environment === environment
        && order.status === 'verified'
        && order.membershipContributionMs > 0
      ))
      .sort((left, right) => (
        left.membershipEffectiveAt.getTime() - right.membershipEffectiveAt.getTime()
        || left.purchasedAt.getTime() - right.purchasedAt.getTime()
        || left.id.localeCompare(right.id)
      ));

    // Rebuild the complete entitlement timeline from persisted per-order
    // contributions. The Apple purchase time is the earliest possible start; an
    // already queued contribution starts after prior contributions. Removing
    // one order therefore removes exactly what it appended. Discovering old
    // history later never restarts already elapsed membership from discovery time.

    for (const segment of activeSegments) {
      segment.status = 'superseded';
      segment.supersededAt = new Date(asOf);
    }

    let cursor: Date | undefined;
    const nextSegments: Array<{
      segment: MembershipEntitlementSegment;
      rescheduleFutureBatches: boolean;
    }> = [];
    for (const order of validOrders) {
      const current = activeByOrder.get(order.id);
      const revision = state.membershipSegments
        .filter((segment) => segment.orderId === order.id && segment.environment === environment)
        .reduce((maximum, segment) => Math.max(maximum, segment.revision), 0) + 1;
      const startsAt = cursor && cursor > order.membershipEffectiveAt
        ? cursor
        : order.membershipEffectiveAt;
      const endsAt = new Date(startsAt.getTime() + order.membershipContributionMs);
      const segment: MembershipEntitlementSegment = {
        id: this.idFactory(),
        environment,
        accountId,
        orderId: order.id,
        revision,
        startsAt: new Date(startsAt),
        endsAt: new Date(endsAt),
        status: 'active',
      };
      state.membershipSegments.push(segment);
      nextSegments.push({
        segment,
        rescheduleFutureBatches: !current || current.startsAt > asOf,
      });
      cursor = segment.endsAt;
    }

    for (const { segment, rescheduleFutureBatches } of nextSegments) {
      this.ensureMembershipPointBatches(
        state,
        segment,
        asOf,
        rescheduleFutureBatches,
      );
    }
  }

  private ensureMembershipPointBatches(
    state: CommerceDomainState,
    segment: MembershipEntitlementSegment,
    asOf: Date,
    rescheduleFutureBatches: boolean,
  ) {
    const order = this.requireOrder(state, segment.orderId);
    const product = requireMembershipProductByKey(order.productKey);
    for (const [ordinal, definition] of product.aiPointBatches.entries()) {
      const existing = state.pointBatches.find((batch) => (
        batch.environment === order.environment
        && batch.sourceOrderId === order.id
        && batch.ordinal === ordinal
      ));
      const availableAt = addDays(segment.startsAt, definition.offsetDays);
      if (existing) {
        existing.accountId = order.accountId;
        existing.entitlementSegmentId = segment.id;
        if (rescheduleFutureBatches && existing.availableAt > asOf) existing.availableAt = availableAt;
        if (existing.status !== 'revoked' && existing.status !== 'merged') {
          existing.status = existing.availableAt <= asOf ? 'available' : 'scheduled';
          existing.expiresAt = undefined;
          if (existing.status === 'available') {
            this.appendGrantEntry(state, existing, existing.availableAt);
          }
        }
        continue;
      }
      if (availableAt >= segment.endsAt) continue;
      this.createPointBatch({
        state,
        environment: order.environment,
        accountId: order.accountId,
        originalAccountId: order.originalAccountId,
        sourceType: 'membership',
        sourceReference: `order:${order.id}`,
        sourceOrderId: order.id,
        entitlementSegmentId: segment.id,
        ruleVersion: product.aiPointRuleVersion,
        ordinal,
        points: definition.points,
        availableAt,
        createdAt: asOf,
      });
    }
  }

  private createPointBatch(input: {
    state: CommerceDomainState;
    environment: CommerceEnvironment;
    accountId: string;
    originalAccountId: string;
    sourceType: AiPointBatch['sourceType'];
    sourceReference: string;
    sourceOrderId?: string;
    entitlementSegmentId?: string;
    ruleVersion: string;
    ordinal: number;
    points: number;
    availableAt: Date;
    expiresAt?: Date;
    createdAt: Date;
  }) {
    const duplicate = input.state.pointBatches.find((batch) => (
      batch.environment === input.environment
      && batch.sourceType === input.sourceType
      && batch.sourceReference === input.sourceReference
      && batch.ordinal === input.ordinal
    ));
    if (duplicate) return duplicate;
    const batch: AiPointBatch = {
      id: this.idFactory(),
      environment: input.environment,
      accountId: input.accountId,
      originalAccountId: input.originalAccountId,
      sourceType: input.sourceType,
      sourceReference: input.sourceReference,
      sourceOrderId: input.sourceOrderId,
      entitlementSegmentId: input.entitlementSegmentId,
      ruleVersion: input.ruleVersion,
      ordinal: input.ordinal,
      grantedPoints: input.points,
      consumedPoints: 0,
      reservedPoints: 0,
      availableAt: new Date(input.availableAt),
      expiresAt: input.expiresAt && new Date(input.expiresAt),
      status: input.availableAt <= input.createdAt ? 'available' : 'scheduled',
      createdAt: new Date(input.createdAt),
    };
    input.state.pointBatches.push(batch);
    if (batch.status === 'available') this.appendGrantEntry(input.state, batch, input.availableAt);
    return batch;
  }

  private revokeOrderBenefits(
    state: CommerceDomainState,
    order: CommerceOrder,
    revokedAt: Date,
    cycleKey: string,
  ) {
    for (const segment of state.membershipSegments.filter((candidate) => (
      candidate.orderId === order.id && candidate.environment === order.environment && candidate.status === 'active'
    ))) {
      segment.status = 'revoked';
      segment.revokedAt = new Date(revokedAt);
    }
    const orderBatchIds = new Set(
      state.pointBatches
        .filter((batch) => batch.sourceOrderId === order.id && batch.environment === order.environment)
        .map((batch) => batch.id),
    );
    for (const reservation of state.pointReservations.filter((candidate) => (
      candidate.environment === order.environment
      && candidate.status === 'reserved'
      && candidate.allocations.some((allocation) => orderBatchIds.has(allocation.batchId))
    ))) {
      this.releaseReservation(state, reservation, revokedAt);
    }
    for (const batch of state.pointBatches.filter((candidate) => (
      candidate.sourceOrderId === order.id && candidate.environment === order.environment
    ))) this.revokeBatch(
      state,
      batch,
      revokedAt,
      'revoke',
      `refund-cycle:${cycleKey}:revoke:${batch.id}`,
    );
  }

  private restoreOrderPointBatches(
    state: CommerceDomainState,
    order: CommerceOrder,
    cycleKey: string,
    restoredAt: Date,
  ) {
    for (const batch of state.pointBatches.filter((candidate) => (
      candidate.sourceOrderId === order.id
      && candidate.environment === order.environment
      && candidate.status === 'revoked'
    ))) {
      batch.status = batch.availableAt <= restoredAt ? 'available' : 'scheduled';
      batch.revokedAt = undefined;
      batch.expiresAt = undefined;
      if (batch.status === 'available') {
        this.appendLedger(state, {
          environment: batch.environment,
          accountId: batch.accountId,
          batchId: batch.id,
          operationId: `refund-cycle:${cycleKey}:restore:${batch.id}`,
          entryType: 'restore',
          direction: 'credit',
          points: Math.max(
            0,
            batch.grantedPoints - batch.consumedPoints - batch.reservedPoints,
          ),
          createdAt: restoredAt,
        });
      }
    }
  }

  private revokeBatch(
    state: CommerceDomainState,
    batch: AiPointBatch,
    revokedAt: Date,
    entryType: 'revoke' | 'expire',
    operationId = `${entryType}:${batch.id}`,
  ) {
    if (batch.status === 'revoked' || batch.status === 'merged' || batch.status === 'expired') return;
    const unused = batch.status === 'available'
      ? Math.max(0, batch.grantedPoints - batch.consumedPoints - batch.reservedPoints)
      : 0;
    batch.status = entryType === 'expire' ? 'expired' : 'revoked';
    batch.revokedAt = new Date(revokedAt);
    this.appendLedger(state, {
      environment: batch.environment,
      accountId: batch.accountId,
      batchId: batch.id,
      operationId,
      entryType,
      direction: 'debit',
      points: unused,
      createdAt: revokedAt,
    });
  }

  private expirePointBatches(
    state: CommerceDomainState,
    accountId: string,
    environment: CommerceEnvironment,
    at: Date,
  ) {
    for (const batch of state.pointBatches.filter((candidate) => (
      candidate.accountId === accountId
      && candidate.environment === environment
      && (candidate.status === 'available' || candidate.status === 'scheduled')
      && candidate.expiresAt
      && candidate.expiresAt <= at
    ))) this.revokeBatch(state, batch, at, 'expire');
  }

  private availableBatches(
    state: CommerceDomainState,
    accountId: string,
    environment: CommerceEnvironment,
    at: Date,
  ) {
    for (const batch of state.pointBatches.filter((candidate) => (
      candidate.accountId === accountId
      && candidate.environment === environment
      && candidate.status === 'scheduled'
      && candidate.availableAt <= at
      && (!candidate.expiresAt || candidate.expiresAt > at)
    ))) {
      batch.status = 'available';
      // App Store credits become a durable asset once issued and must not
      // inherit membership expiry. Other sources also default to no expiry
      // unless an explicit source rule provided one.
      batch.expiresAt = undefined;
      this.appendGrantEntry(state, batch, batch.availableAt);
    }
    return state.pointBatches
      .filter((batch) => (
        batch.accountId === accountId
        && batch.environment === environment
        && (batch.status === 'available' || batch.status === 'scheduled')
        && batch.availableAt <= at
        && (!batch.expiresAt || batch.expiresAt > at)
        && batch.grantedPoints > batch.consumedPoints + batch.reservedPoints
      ))
      .sort((left, right) => {
        const leftMember = left.sourceType === 'membership';
        const rightMember = right.sourceType === 'membership';
        if (leftMember !== rightMember) return leftMember ? -1 : 1;
        const leftExpiry = left.expiresAt?.getTime() ?? Number.POSITIVE_INFINITY;
        const rightExpiry = right.expiresAt?.getTime() ?? Number.POSITIVE_INFINITY;
        return leftExpiry - rightExpiry
          || left.availableAt.getTime() - right.availableAt.getTime()
          || left.createdAt.getTime() - right.createdAt.getTime()
          || left.id.localeCompare(right.id);
      });
  }

  private releaseReservation(state: CommerceDomainState, reservation: AiPointReservation, releasedAt: Date) {
    if (reservation.status !== 'reserved') return;
    for (const allocation of reservation.allocations) {
      const batch = this.requireBatch(state, allocation.batchId);
      batch.reservedPoints -= allocation.points;
      this.appendLedger(state, {
        environment: reservation.environment,
        accountId: reservation.accountId,
        batchId: batch.id,
        reservationId: reservation.id,
        operationId: reservation.operationId,
        entryType: 'release',
        direction: 'credit',
        points: allocation.points,
        createdAt: releasedAt,
      });
    }
    reservation.status = 'released';
    reservation.releasedAt = new Date(releasedAt);
  }

  private rebuildMergedTrial(
    state: CommerceDomainState,
    sourceAccountId: string,
    targetAccountId: string,
    environment: CommerceEnvironment,
    mergedAt: Date,
  ) {
    const trialBatches = state.pointBatches.filter((batch) => (
      batch.accountId === targetAccountId
      && batch.environment === environment
      && batch.sourceType === 'trial'
      && batch.status !== 'merged'
      && batch.status !== 'revoked'
      && batch.status !== 'expired'
    ));
    if (trialBatches.length < 2) return;
    const trialBatchIds = new Set(trialBatches.map((batch) => batch.id));
    for (const reservation of state.pointReservations.filter((candidate) => (
      candidate.environment === environment
      && candidate.accountId === targetAccountId
      && candidate.status === 'reserved'
      && candidate.allocations.some((allocation) => trialBatchIds.has(allocation.batchId))
    ))) this.releaseReservation(state, reservation, mergedAt);
    const consumed = Math.min(
      FREE_TRIAL_POINTS,
      trialBatches.reduce((sum, batch) => sum + batch.consumedPoints, 0),
    );
    const mergeOperationId = `trial-merge:${targetAccountId}:${sourceAccountId}`;
    for (const batch of trialBatches) {
      const unused = Math.max(0, batch.grantedPoints - batch.consumedPoints - batch.reservedPoints);
      this.appendLedger(state, {
        environment,
        accountId: targetAccountId,
        batchId: batch.id,
        operationId: mergeOperationId,
        entryType: 'merge_debit',
        direction: 'debit',
        points: unused,
        createdAt: mergedAt,
      });
      batch.status = 'merged';
      batch.revokedAt = new Date(mergedAt);
      batch.reservedPoints = 0;
    }
    const remaining = Math.max(0, FREE_TRIAL_POINTS - consumed);
    const batch: AiPointBatch = {
      id: this.idFactory(),
      environment,
      accountId: targetAccountId,
      originalAccountId: targetAccountId,
      sourceType: 'trial',
      sourceReference: `merge:${targetAccountId}:${sourceAccountId}`,
      ruleVersion: AI_POINT_RULE_VERSION,
      ordinal: 0,
      grantedPoints: FREE_TRIAL_POINTS,
      consumedPoints: consumed,
      reservedPoints: 0,
      availableAt: new Date(mergedAt),
      status: 'available',
      createdAt: mergedAt,
    };
    state.pointBatches.push(batch);
    this.appendLedger(state, {
      environment,
      accountId: targetAccountId,
      batchId: batch.id,
      operationId: mergeOperationId,
      entryType: 'merge_credit',
      direction: 'credit',
      points: remaining,
      createdAt: mergedAt,
    });
  }

  private appendLedger(state: CommerceDomainState, entry: Omit<AiPointLedgerEntry, 'id'>) {
    if (ledgerEntryExists(state, entry)) return;
    state.pointLedger.push({ id: this.idFactory(), ...entry, createdAt: new Date(entry.createdAt) });
  }

  private appendGrantEntry(state: CommerceDomainState, batch: AiPointBatch, grantedAt: Date) {
    this.appendLedger(state, {
      environment: batch.environment,
      accountId: batch.accountId,
      batchId: batch.id,
      operationId: `grant:${batch.id}`,
      entryType: 'grant',
      direction: 'credit',
      points: batch.grantedPoints,
      createdAt: grantedAt,
    });
  }

  private requireOrder(state: CommerceDomainState, orderId: string) {
    const order = state.orders.find((candidate) => candidate.id === orderId);
    if (!order) throw new Error('commerce_order_not_found');
    return order;
  }

  private requireBatch(state: CommerceDomainState, batchId: string) {
    const batch = state.pointBatches.find((candidate) => candidate.id === batchId);
    if (!batch) throw new Error('ai_point_batch_not_found');
    return batch;
  }

  private requireReservation(
    state: CommerceDomainState,
    accountId: string,
    environment: CommerceEnvironment,
    operationId: string,
  ) {
    const reservation = state.pointReservations.find((candidate) => (
      candidate.environment === environment
      && candidate.accountId === accountId
      && candidate.operationId === operationId
    ));
    if (!reservation) throw new Error('ai_reservation_not_found');
    return reservation;
  }
}
