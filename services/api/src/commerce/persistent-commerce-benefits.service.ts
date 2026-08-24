import { Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';

import { aiPointBatches, aiPointLedgerEntries } from '../database/schema';
import type { DatabaseService } from '../database/database.service';
import { CommerceFoundationModel, createCommerceDomainState } from './commerce-domain';

type CommerceTransaction = Parameters<Parameters<DatabaseService['db']['transaction']>[0]>[0];

@Injectable()
export class PersistentCommerceBenefitsService {
  private readonly model = new CommerceFoundationModel();

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
    const restoreOperationPrefix = `refund-cycle:${input.cycleKey}:restore:`;
    await transaction.execute(sql`
      insert into ai_point_ledger_entries (
        environment, account_id, batch_id, operation_id, entry_type, direction, points, created_at
      )
      select environment, account_id, id, ${restoreOperationPrefix} || id::text,
        'restore', 'credit', greatest(0, granted_points - consumed_points - reserved_points),
        ${restoredAt}::timestamptz
      from ai_point_batches
      where environment = ${input.environment}
        and account_id = ${input.accountId}::uuid
        and source_order_id = ${input.orderId}::uuid
        and status = 'revoked'
        and available_at <= ${restoredAt}::timestamptz
      on conflict do nothing
    `);
    await transaction.execute(sql`
      update ai_point_batches
      set status = case
          when available_at <= ${restoredAt}::timestamptz then 'available'
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
}
