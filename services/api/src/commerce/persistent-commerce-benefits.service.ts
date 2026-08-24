import { Injectable } from '@nestjs/common';
import type { AiPointOperationSummary } from '@icao/contracts';
import { and, asc, eq, lte, sql } from 'drizzle-orm';

import {
  aiPointBatches,
  aiPointLedgerEntries,
  aiPointReservationAllocations,
  aiPointReservations,
} from '../database/schema';
import type { DatabaseService } from '../database/database.service';
import {
  AI_POINT_COSTS,
  CommerceFoundationModel,
  createCommerceDomainState,
  type BillableAiCapability,
} from './commerce-domain';
import { AI_POINT_RULE_VERSION, type CommerceEnvironment } from './product-catalog';

type CommerceTransaction = Parameters<Parameters<DatabaseService['db']['transaction']>[0]>[0];
const AI_OPERATION_LEASE_MS = 2 * 60 * 1_000;

export type PersistentAiPointReservation<T> =
  | { state: 'execute'; operationId: string; points: number }
  | { state: 'replay'; data: T }
  | { state: 'wait'; retryAfterMs: number };

@Injectable()
export class PersistentCommerceBenefitsService {
  private readonly model = new CommerceFoundationModel();

  private async activateDuePointBatches(
    transaction: CommerceTransaction,
    accountId: string,
    environment: CommerceEnvironment,
    at: Date,
  ) {
    const due = await transaction.select()
      .from(aiPointBatches)
      .where(and(
        eq(aiPointBatches.environment, environment),
        eq(aiPointBatches.accountId, accountId),
        eq(aiPointBatches.status, 'scheduled'),
        lte(aiPointBatches.availableAt, at),
      ));
    for (const batch of due) {
      await transaction.update(aiPointBatches).set({ status: 'available', updatedAt: at })
        .where(and(eq(aiPointBatches.id, batch.id), eq(aiPointBatches.status, 'scheduled')));
      await transaction.insert(aiPointLedgerEntries).values({
        environment,
        accountId,
        batchId: batch.id,
        operationId: `grant:${batch.id}`,
        entryType: 'grant',
        direction: 'credit',
        points: batch.grantedPoints,
        createdAt: batch.availableAt,
      }).onConflictDoNothing();
    }
  }

  private async releaseExpiredAiPointReservations(
    transaction: CommerceTransaction,
    accountId: string,
    environment: CommerceEnvironment,
    at: Date,
  ) {
    const releasedAt = at.toISOString();
    await transaction.execute(sql`
      insert into ai_point_ledger_entries (
        environment, account_id, batch_id, reservation_id, operation_id,
        entry_type, direction, points, created_at
      )
      select allocation.environment, allocation.account_id, allocation.batch_id,
        allocation.reservation_id, reservation.operation_id,
        'release', 'credit', allocation.points, ${releasedAt}::timestamptz
      from ai_point_reservation_allocations allocation
      join ai_point_reservations reservation on reservation.id = allocation.reservation_id
      where reservation.environment = ${environment}
        and reservation.account_id = ${accountId}::uuid
        and reservation.status = 'reserved'
        and reservation.lease_until <= ${releasedAt}::timestamptz
      on conflict do nothing
    `);
    await transaction.execute(sql`
      with released as (
        select allocation.batch_id, sum(allocation.points)::integer as points
        from ai_point_reservation_allocations allocation
        join ai_point_reservations reservation on reservation.id = allocation.reservation_id
        where reservation.environment = ${environment}
          and reservation.account_id = ${accountId}::uuid
          and reservation.status = 'reserved'
          and reservation.lease_until <= ${releasedAt}::timestamptz
        group by allocation.batch_id
      )
      update ai_point_batches batch
      set reserved_points = batch.reserved_points - released.points,
        updated_at = ${releasedAt}::timestamptz
      from released where batch.id = released.batch_id
    `);
    await transaction.update(aiPointReservations).set({
      status: 'released',
      releasedAt: at,
      leaseUntil: null,
      failureCode: 'ai_operation_lease_expired',
    }).where(and(
      eq(aiPointReservations.environment, environment),
      eq(aiPointReservations.accountId, accountId),
      eq(aiPointReservations.status, 'reserved'),
      lte(aiPointReservations.leaseUntil, at),
    ));
  }

  private async availableAiPoints(
    transaction: CommerceTransaction,
    accountId: string,
    environment: CommerceEnvironment,
    at: Date,
  ) {
    const [balance] = await transaction.select({
      available: sql<number>`coalesce(sum(
        ${aiPointBatches.grantedPoints}
        - ${aiPointBatches.consumedPoints}
        - ${aiPointBatches.reservedPoints}
      ), 0)::integer`,
    }).from(aiPointBatches).where(and(
      eq(aiPointBatches.environment, environment),
      eq(aiPointBatches.accountId, accountId),
      eq(aiPointBatches.status, 'available'),
      lte(aiPointBatches.availableAt, at),
    ));
    return Number(balance?.available ?? 0);
  }

  async reserveAiPoints<T>(
    transaction: CommerceTransaction,
    input: {
      accountId: string;
      capability: BillableAiCapability;
      environment: CommerceEnvironment;
      operationId: string;
      requestDigest: string;
      reservedAt: Date;
    },
  ): Promise<PersistentAiPointReservation<T>> {
    const points = AI_POINT_COSTS[input.capability];
    if (!points) throw new Error('ai_capability_not_billable');
    await transaction.execute(sql`
      select pg_advisory_xact_lock(hashtextextended(${`account:${input.accountId}`}, 0))
    `);
    await this.activateDuePointBatches(transaction, input.accountId, input.environment, input.reservedAt);
    await this.releaseExpiredAiPointReservations(transaction, input.accountId, input.environment, input.reservedAt);

    const [existing] = await transaction.select().from(aiPointReservations).where(and(
      eq(aiPointReservations.environment, input.environment),
      eq(aiPointReservations.accountId, input.accountId),
      eq(aiPointReservations.operationId, input.operationId),
    )).limit(1);
    if (existing) {
      if (
        existing.capability !== input.capability
        || existing.points !== points
        || existing.requestDigest !== input.requestDigest
      ) {
        throw new Error('ai_operation_idempotency_conflict');
      }
      if (existing.status === 'settled') {
        if (!existing.resultPayload) throw new Error('ai_operation_result_missing');
        return { state: 'replay', data: existing.resultPayload as T };
      }
      if (existing.status === 'released') throw new Error('ai_operation_released');
      return { state: 'wait', retryAfterMs: 250 };
    }

    const [active] = await transaction.select({ leaseUntil: aiPointReservations.leaseUntil })
      .from(aiPointReservations)
      .where(and(
        eq(aiPointReservations.environment, input.environment),
        eq(aiPointReservations.accountId, input.accountId),
        eq(aiPointReservations.status, 'reserved'),
      ))
      .limit(1);
    if (active) return { state: 'wait', retryAfterMs: 250 };

    const batches = await transaction.select().from(aiPointBatches).where(and(
      eq(aiPointBatches.environment, input.environment),
      eq(aiPointBatches.accountId, input.accountId),
      eq(aiPointBatches.status, 'available'),
      lte(aiPointBatches.availableAt, input.reservedAt),
    )).orderBy(
      sql`case when ${aiPointBatches.sourceType} = 'trial' then 1 else 0 end`,
      asc(aiPointBatches.availableAt),
      asc(aiPointBatches.id),
    );
    const available = batches.reduce(
      (sum, batch) => sum + batch.grantedPoints - batch.consumedPoints - batch.reservedPoints,
      0,
    );
    if (available < points) throw new Error('insufficient_ai_points');

    const [reservation] = await transaction.insert(aiPointReservations).values({
      environment: input.environment,
      accountId: input.accountId,
      operationId: input.operationId,
      capability: input.capability,
      requestDigest: input.requestDigest,
      ruleVersion: AI_POINT_RULE_VERSION,
      points,
      status: 'reserved',
      leaseUntil: new Date(input.reservedAt.getTime() + AI_OPERATION_LEASE_MS),
      createdAt: input.reservedAt,
    }).returning({ id: aiPointReservations.id });
    if (!reservation) throw new Error('ai_point_reservation_insert_failed');

    let remaining = points;
    for (const batch of batches) {
      const batchAvailable = batch.grantedPoints - batch.consumedPoints - batch.reservedPoints;
      const allocated = Math.min(remaining, batchAvailable);
      if (allocated <= 0) continue;
      await transaction.update(aiPointBatches).set({
        reservedPoints: batch.reservedPoints + allocated,
        updatedAt: input.reservedAt,
      }).where(eq(aiPointBatches.id, batch.id));
      await transaction.insert(aiPointReservationAllocations).values({
        environment: input.environment,
        accountId: input.accountId,
        reservationId: reservation.id,
        batchId: batch.id,
        points: allocated,
      });
      await transaction.insert(aiPointLedgerEntries).values({
        environment: input.environment,
        accountId: input.accountId,
        batchId: batch.id,
        reservationId: reservation.id,
        operationId: input.operationId,
        entryType: 'reserve',
        direction: 'debit',
        points: allocated,
        createdAt: input.reservedAt,
      });
      remaining -= allocated;
      if (remaining === 0) break;
    }
    if (remaining !== 0) throw new Error('ai_reservation_allocation_total_mismatch');
    return { state: 'execute', operationId: input.operationId, points };
  }

  async settleAiPoints<T extends Record<string, unknown>>(
    transaction: CommerceTransaction,
    input: {
      accountId: string;
      environment: CommerceEnvironment;
      operationId: string;
      result: T;
      settledAt: Date;
    },
  ): Promise<T & { aiPoints: AiPointOperationSummary }> {
    await transaction.execute(sql`
      select pg_advisory_xact_lock(hashtextextended(${`account:${input.accountId}`}, 0))
    `);
    const [reservation] = await transaction.select().from(aiPointReservations).where(and(
      eq(aiPointReservations.environment, input.environment),
      eq(aiPointReservations.accountId, input.accountId),
      eq(aiPointReservations.operationId, input.operationId),
    )).limit(1);
    if (!reservation) throw new Error('ai_point_reservation_not_found');
    if (reservation.status === 'settled') {
      if (!reservation.resultPayload) throw new Error('ai_operation_result_missing');
      return reservation.resultPayload as T & { aiPoints: AiPointOperationSummary };
    }
    if (reservation.status !== 'reserved') throw new Error('ai_reservation_already_released');

    const allocations = await transaction.select().from(aiPointReservationAllocations)
      .where(and(
        eq(aiPointReservationAllocations.environment, input.environment),
        eq(aiPointReservationAllocations.accountId, input.accountId),
        eq(aiPointReservationAllocations.reservationId, reservation.id),
      ));
    if (allocations.reduce((sum, allocation) => sum + allocation.points, 0) !== reservation.points) {
      throw new Error('ai_reservation_allocation_total_mismatch');
    }
    for (const allocation of allocations) {
      await transaction.update(aiPointBatches).set({
        reservedPoints: sql`${aiPointBatches.reservedPoints} - ${allocation.points}`,
        consumedPoints: sql`${aiPointBatches.consumedPoints} + ${allocation.points}`,
        updatedAt: input.settledAt,
      }).where(and(
        eq(aiPointBatches.id, allocation.batchId),
        eq(aiPointBatches.environment, input.environment),
        eq(aiPointBatches.accountId, input.accountId),
      ));
      await transaction.insert(aiPointLedgerEntries).values({
        environment: input.environment,
        accountId: input.accountId,
        batchId: allocation.batchId,
        reservationId: reservation.id,
        operationId: input.operationId,
        entryType: 'settle',
        direction: 'neutral',
        points: allocation.points,
        createdAt: input.settledAt,
      }).onConflictDoNothing();
    }
    const remaining = await this.availableAiPoints(
      transaction,
      input.accountId,
      input.environment,
      input.settledAt,
    );
    const data = {
      ...input.result,
      aiPoints: {
        operationId: input.operationId,
        ruleVersion: AI_POINT_RULE_VERSION,
        estimated: reservation.points,
        charged: reservation.points,
        remaining,
      },
    } satisfies T & { aiPoints: AiPointOperationSummary };
    await transaction.update(aiPointReservations).set({
      status: 'settled',
      settledAt: input.settledAt,
      leaseUntil: null,
      resultPayload: data,
      failureCode: null,
    }).where(eq(aiPointReservations.id, reservation.id));
    return data;
  }

  async releaseAiPoints(
    transaction: CommerceTransaction,
    input: {
      accountId: string;
      environment: CommerceEnvironment;
      failureCode: string;
      operationId: string;
      releasedAt: Date;
    },
  ) {
    await transaction.execute(sql`
      select pg_advisory_xact_lock(hashtextextended(${`account:${input.accountId}`}, 0))
    `);
    const [reservation] = await transaction.select().from(aiPointReservations).where(and(
      eq(aiPointReservations.environment, input.environment),
      eq(aiPointReservations.accountId, input.accountId),
      eq(aiPointReservations.operationId, input.operationId),
    )).limit(1);
    if (!reservation || reservation.status === 'released') return { changed: false as const };
    if (reservation.status === 'settled') return { changed: false as const };
    const allocations = await transaction.select().from(aiPointReservationAllocations)
      .where(eq(aiPointReservationAllocations.reservationId, reservation.id));
    for (const allocation of allocations) {
      await transaction.update(aiPointBatches).set({
        reservedPoints: sql`${aiPointBatches.reservedPoints} - ${allocation.points}`,
        updatedAt: input.releasedAt,
      }).where(and(
        eq(aiPointBatches.id, allocation.batchId),
        eq(aiPointBatches.environment, input.environment),
        eq(aiPointBatches.accountId, input.accountId),
      ));
      await transaction.insert(aiPointLedgerEntries).values({
        environment: input.environment,
        accountId: input.accountId,
        batchId: allocation.batchId,
        reservationId: reservation.id,
        operationId: input.operationId,
        entryType: 'release',
        direction: 'credit',
        points: allocation.points,
        createdAt: input.releasedAt,
      }).onConflictDoNothing();
    }
    await transaction.update(aiPointReservations).set({
      status: 'released',
      releasedAt: input.releasedAt,
      leaseUntil: null,
      failureCode: input.failureCode,
    }).where(eq(aiPointReservations.id, reservation.id));
    return { changed: true as const };
  }

  async grantFreeTrial(
    transaction: CommerceTransaction,
    input: { accountId: string; externalEligibilityClaimed: true; grantedAt: Date },
  ) {
    const [existing] = await transaction.select({ id: aiPointBatches.id })
      .from(aiPointBatches)
      .where(and(
        eq(aiPointBatches.environment, 'production'),
        eq(aiPointBatches.accountId, input.accountId),
        eq(aiPointBatches.sourceType, 'trial'),
      ))
      .limit(1);
    if (existing) return { created: false as const, batchId: existing.id };

    const state = createCommerceDomainState();
    const result = this.model.grantFreeTrial(state, {
      accountId: input.accountId,
      environment: 'production',
      externalEligibilityClaimed: input.externalEligibilityClaimed,
      grantedAt: input.grantedAt,
    });
    const batch = result.batch;
    const [ledger] = state.pointLedger;
    if (!result.created || !ledger) throw new Error('free_trial_persistence_model_invalid');

    await transaction.insert(aiPointBatches).values({
      id: batch.id,
      environment: batch.environment,
      accountId: batch.accountId,
      originalAccountId: batch.originalAccountId,
      sourceType: batch.sourceType,
      sourceReference: batch.sourceReference,
      ruleVersion: batch.ruleVersion,
      ordinal: batch.ordinal,
      grantedPoints: batch.grantedPoints,
      consumedPoints: batch.consumedPoints,
      reservedPoints: batch.reservedPoints,
      availableAt: batch.availableAt,
      status: batch.status,
      createdAt: batch.createdAt,
      updatedAt: batch.createdAt,
    });
    await transaction.insert(aiPointLedgerEntries).values({
      environment: ledger.environment,
      accountId: ledger.accountId,
      batchId: ledger.batchId,
      operationId: ledger.operationId,
      entryType: ledger.entryType,
      direction: ledger.direction,
      points: ledger.points,
      createdAt: ledger.createdAt,
    });
    return { batchId: batch.id, created: true as const };
  }

  async revokeAccountBenefits(
    transaction: CommerceTransaction,
    input: { accountId: string; deletionJobId: string; revokedAt: Date },
  ) {
    const revokedAt = input.revokedAt.toISOString();
    await transaction.execute(sql`
      insert into ai_point_ledger_entries (
        environment, account_id, batch_id, reservation_id, operation_id,
        entry_type, direction, points, created_at
      )
      select allocation.environment, allocation.account_id, allocation.batch_id,
        allocation.reservation_id,
        ${`account-delete:${input.deletionJobId}:release:`} || allocation.reservation_id::text,
        'release', 'credit', allocation.points, ${revokedAt}::timestamptz
      from ai_point_reservation_allocations allocation
      join ai_point_reservations reservation on reservation.id = allocation.reservation_id
      where reservation.account_id = ${input.accountId}::uuid and reservation.status = 'reserved'
      on conflict do nothing
    `);
    await transaction.execute(sql`
      with released as (
        select allocation.batch_id, sum(allocation.points)::integer as points
        from ai_point_reservation_allocations allocation
        join ai_point_reservations reservation on reservation.id = allocation.reservation_id
        where reservation.account_id = ${input.accountId}::uuid and reservation.status = 'reserved'
        group by allocation.batch_id
      )
      update ai_point_batches batch
      set reserved_points = batch.reserved_points - released.points,
        updated_at = ${revokedAt}::timestamptz
      from released where batch.id = released.batch_id
    `);
    await transaction.execute(sql`
      update ai_point_reservations
      set status = 'released', released_at = ${revokedAt}::timestamptz
      where account_id = ${input.accountId}::uuid and status = 'reserved'
    `);
    await transaction.execute(sql`
      insert into ai_point_ledger_entries (
        environment, account_id, batch_id, operation_id, entry_type, direction, points, created_at
      )
      select environment, account_id, id, ${`account-delete:${input.deletionJobId}:revoke`},
        'revoke', 'debit', granted_points - consumed_points - reserved_points,
        ${revokedAt}::timestamptz
      from ai_point_batches
      where account_id = ${input.accountId}::uuid and status in ('scheduled', 'available')
      on conflict do nothing
    `);
    await transaction.execute(sql`
      update ai_point_batches
      set status = 'revoked', revoked_at = ${revokedAt}::timestamptz,
        updated_at = ${revokedAt}::timestamptz
      where account_id = ${input.accountId}::uuid and status in ('scheduled', 'available')
    `);
    await transaction.execute(sql`
      update membership_entitlement_segments
      set status = 'revoked', revoked_at = ${revokedAt}::timestamptz
      where account_id = ${input.accountId}::uuid and status = 'active'
    `);
  }

  async revokeOrderBenefits(
    transaction: CommerceTransaction,
    input: {
      accountId: string;
      cycleKey: string;
      environment: 'sandbox' | 'production';
      orderId: string;
      revokedAt: Date;
    },
  ) {
    const revokedAt = input.revokedAt.toISOString();
    const releaseOperationPrefix = `refund-cycle:${input.cycleKey}:release:`;
    const revokeOperationPrefix = `refund-cycle:${input.cycleKey}:revoke:`;

    // A reservation can span multiple purchase batches. If any allocation
    // belongs to the refunded order, release the complete reservation so its
    // immutable allocations and the per-batch reserved totals stay coherent.
    await transaction.execute(sql`
      with affected_reservations as (
        select distinct reservation.id
        from ai_point_reservations reservation
        join ai_point_reservation_allocations allocation
          on allocation.reservation_id = reservation.id
        join ai_point_batches source_batch on source_batch.id = allocation.batch_id
        where reservation.environment = ${input.environment}
          and reservation.account_id = ${input.accountId}::uuid
          and reservation.status = 'reserved'
          and source_batch.source_order_id = ${input.orderId}::uuid
      )
      insert into ai_point_ledger_entries (
        environment, account_id, batch_id, reservation_id, operation_id,
        entry_type, direction, points, created_at
      )
      select allocation.environment, allocation.account_id, allocation.batch_id,
        allocation.reservation_id,
        ${releaseOperationPrefix} || allocation.reservation_id::text,
        'release', 'credit', allocation.points, ${revokedAt}::timestamptz
      from ai_point_reservation_allocations allocation
      join affected_reservations affected on affected.id = allocation.reservation_id
      on conflict do nothing
    `);
    await transaction.execute(sql`
      with affected_reservations as (
        select distinct reservation.id
        from ai_point_reservations reservation
        join ai_point_reservation_allocations allocation
          on allocation.reservation_id = reservation.id
        join ai_point_batches source_batch on source_batch.id = allocation.batch_id
        where reservation.environment = ${input.environment}
          and reservation.account_id = ${input.accountId}::uuid
          and reservation.status = 'reserved'
          and source_batch.source_order_id = ${input.orderId}::uuid
      ), released as (
        select allocation.batch_id, sum(allocation.points)::integer as points
        from ai_point_reservation_allocations allocation
        join affected_reservations affected on affected.id = allocation.reservation_id
        group by allocation.batch_id
      )
      update ai_point_batches batch
      set reserved_points = batch.reserved_points - released.points,
        updated_at = ${revokedAt}::timestamptz
      from released where batch.id = released.batch_id
    `);
    await transaction.execute(sql`
      with affected_reservations as (
        select distinct reservation.id
        from ai_point_reservations reservation
        join ai_point_reservation_allocations allocation
          on allocation.reservation_id = reservation.id
        join ai_point_batches source_batch on source_batch.id = allocation.batch_id
        where reservation.environment = ${input.environment}
          and reservation.account_id = ${input.accountId}::uuid
          and reservation.status = 'reserved'
          and source_batch.source_order_id = ${input.orderId}::uuid
      )
      update ai_point_reservations reservation
      set status = 'released', released_at = ${revokedAt}::timestamptz
      from affected_reservations affected
      where reservation.id = affected.id
    `);
    await transaction.execute(sql`
      insert into ai_point_ledger_entries (
        environment, account_id, batch_id, operation_id, entry_type, direction, points, created_at
      )
      select environment, account_id, id, ${revokeOperationPrefix} || id::text,
        'revoke', 'debit',
        case when status = 'available'
          then greatest(0, granted_points - consumed_points - reserved_points)
          else 0
        end,
        ${revokedAt}::timestamptz
      from ai_point_batches
      where environment = ${input.environment}
        and account_id = ${input.accountId}::uuid
        and source_order_id = ${input.orderId}::uuid
        and status in ('scheduled', 'available')
      on conflict do nothing
    `);
    await transaction.execute(sql`
      update ai_point_batches
      set status = 'revoked', revoked_at = ${revokedAt}::timestamptz,
        updated_at = ${revokedAt}::timestamptz
      where environment = ${input.environment}
        and account_id = ${input.accountId}::uuid
        and source_order_id = ${input.orderId}::uuid
        and status in ('scheduled', 'available')
    `);
    await transaction.execute(sql`
      update membership_entitlement_segments
      set status = 'revoked', revoked_at = ${revokedAt}::timestamptz
      where environment = ${input.environment}
        and account_id = ${input.accountId}::uuid
        and order_id = ${input.orderId}::uuid
        and status = 'active'
    `);
  }

  async prepareOrderPointBatchesForRestore(
    transaction: CommerceTransaction,
    input: {
      accountId: string;
      environment: 'sandbox' | 'production';
      orderId: string;
      restoredAt: Date;
    },
  ) {
    const restoredAt = input.restoredAt.toISOString();
    await transaction.execute(sql`
      update ai_point_batches
      set status = case
          when exists (
            select 1 from ai_point_ledger_entries entry
            where entry.batch_id = ai_point_batches.id and entry.entry_type = 'grant'
          ) then 'available'
          else 'scheduled'
        end,
        revoked_at = null,
        expires_at = null,
        updated_at = ${restoredAt}::timestamptz
      where environment = ${input.environment}
        and account_id = ${input.accountId}::uuid
        and source_order_id = ${input.orderId}::uuid
        and status = 'revoked'
    `);
  }

  async restoreOrderPointBatches(
    transaction: CommerceTransaction,
    input: {
      accountId: string;
      cycleKey: string;
      environment: 'sandbox' | 'production';
      orderId: string;
      restoredAt: Date;
    },
  ) {
    const restoredAt = input.restoredAt.toISOString();
    const revokeOperationPrefix = `refund-cycle:${input.cycleKey}:revoke:`;
    const restoreOperationPrefix = `refund-cycle:${input.cycleKey}:restore:`;
    // Restore exactly the amount debited by this refund cycle. A batch that
    // was still scheduled at refund time has a zero-point revoke and is
    // credited only by its first grant if rebuilding makes it due.
    await transaction.execute(sql`
      insert into ai_point_ledger_entries (
        environment, account_id, batch_id, operation_id, entry_type, direction, points, created_at
      )
      select batch.environment, batch.account_id, batch.id,
        ${restoreOperationPrefix} || batch.id::text,
        'restore', 'credit', revoke.points, ${restoredAt}::timestamptz
      from ai_point_batches batch
      join ai_point_ledger_entries revoke
        on revoke.batch_id = batch.id
        and revoke.entry_type = 'revoke'
        and revoke.operation_id = ${revokeOperationPrefix} || batch.id::text
      where batch.environment = ${input.environment}
        and batch.account_id = ${input.accountId}::uuid
        and batch.source_order_id = ${input.orderId}::uuid
        and revoke.points > 0
      on conflict do nothing
    `);
  }
}
