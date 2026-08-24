import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

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
}
