import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import type {
  CommerceEntitlementSummary,
  CommerceProductCatalogResponse,
  VerifyAppleTransactionResponse,
} from '@icao/contracts';
import { and, asc, eq, lte, sql } from 'drizzle-orm';

import { API_CONFIG, type ApiConfig } from '../config';
import type { DatabaseService } from '../database/database.service';
import {
  accounts,
  aiPointBatches,
  aiPointLedgerEntries,
  appleTransactions,
  commerceOrders,
  membershipEntitlementSegments,
} from '../database/schema';
import {
  APPLE_STORE_VERIFIER,
  type AppleStoreVerifier,
} from './apple-store-verifier';
import type { VerifiedAppleTransaction } from './commerce-domain';
import {
  MEMBERSHIP_PRODUCTS,
  requireMembershipProductByAppleId,
  requireMembershipProductByKey,
  type CommerceEnvironment,
} from './product-catalog';

const DAY_MS = 24 * 60 * 60 * 1_000;
type CommerceTransaction = Parameters<Parameters<DatabaseService['db']['transaction']>[0]>[0];

function sameDate(left: Date, right: Date) {
  return left.getTime() === right.getTime();
}

function laterDate(left: Date, right: Date) {
  return left > right ? left : right;
}

@Injectable()
export class CommerceService {
  constructor(
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    private readonly database: DatabaseService,
    @Inject(APPLE_STORE_VERIFIER) private readonly appleVerifier: AppleStoreVerifier,
  ) {}

  catalog(): CommerceProductCatalogResponse {
    return {
      priceSource: 'storekit',
      products: MEMBERSHIP_PRODUCTS.map((product) => ({
        productKey: product.productKey,
        storeProductId: product.appleProductId,
        displayName: product.displayName,
        durationDays: product.durationDays,
        autoRenews: false,
        recommended: product.durationDays === 31,
      })),
    };
  }

  async verifyAppleTransaction(
    accountId: string,
    signedTransaction: string,
  ): Promise<VerifyAppleTransactionResponse> {
    const environment = this.config.appleCommerceEnvironment;
    const processedAt = new Date();
    let verified: VerifiedAppleTransaction;
    try {
      verified = await this.appleVerifier.verifyTransaction(signedTransaction, environment);
    } catch (error) {
      if (error instanceof Error && error.message === 'apple_commerce_not_configured') {
        throw new ServiceUnavailableException('apple_commerce_unavailable');
      }
      throw new BadRequestException('invalid_apple_transaction');
    }
    const product = this.validateVerifiedTransaction(verified, accountId, environment, processedAt);

    return this.database.db.transaction(async (transaction) => {
      await transaction.execute(sql`
        select pg_advisory_xact_lock(
          hashtextextended(${`apple-transaction:${environment}:${verified.transactionId}`}, 0)
        )
      `);
      await transaction.execute(sql`
        select pg_advisory_xact_lock(hashtextextended(${`account:${accountId}`}, 0))
      `);
      await this.assertAccountActive(transaction, accountId);

      const [existing] = await transaction.select()
        .from(appleTransactions)
        .where(and(
          eq(appleTransactions.environment, environment),
          eq(appleTransactions.transactionId, verified.transactionId),
        ))
        .limit(1);
      let created = false;
      if (existing) {
        this.assertIdempotentReplay(existing, verified, accountId);
        if (verified.signedDate > existing.signedDate) {
          await transaction.update(appleTransactions).set({
            signedDate: verified.signedDate,
            signedPayloadHash: verified.signedPayloadHash,
            decodedPayload: verified.decodedPayload,
            storefront: verified.storefront,
            currency: verified.currency,
            priceMilliunits: verified.priceMilliunits,
            updatedAt: processedAt,
          }).where(eq(appleTransactions.id, existing.id));
        }
      } else {
        created = true;
        const [order] = await transaction.insert(commerceOrders).values({
          environment,
          channel: 'apple_app_store',
          externalOrderId: verified.transactionId,
          accountId,
          originalAccountId: accountId,
          productKey: product.productKey,
          externalProductId: verified.productId,
          durationDays: product.durationDays,
          aiPointRuleVersion: product.aiPointRuleVersion,
          membershipGrantSource: 'purchase_discovery',
          membershipEffectiveAt: verified.purchaseDate,
          membershipContributionMs: product.durationDays * DAY_MS,
          status: 'verified',
          purchasedAt: verified.purchaseDate,
          createdAt: processedAt,
          updatedAt: processedAt,
        }).returning({ id: commerceOrders.id });
        if (!order) throw new Error('commerce_order_insert_failed');
        await transaction.insert(appleTransactions).values({
          environment,
          transactionId: verified.transactionId,
          originalTransactionId: verified.originalTransactionId,
          orderId: order.id,
          accountId,
          appAccountToken: accountId,
          productId: verified.productId,
          bundleId: verified.bundleId,
          storefront: verified.storefront,
          currency: verified.currency,
          priceMilliunits: verified.priceMilliunits,
          purchaseDate: verified.purchaseDate,
          signedDate: verified.signedDate,
          signedPayloadHash: verified.signedPayloadHash,
          decodedPayload: verified.decodedPayload,
          createdAt: processedAt,
          updatedAt: processedAt,
        });
        await this.rebuildMembership(transaction, accountId, environment, processedAt);
      }

      return {
        created,
        transactionId: verified.transactionId,
        entitlement: await this.entitlementInTransaction(
          transaction,
          accountId,
          environment,
          processedAt,
        ),
      };
    });
  }

  async currentEntitlement(accountId: string): Promise<CommerceEntitlementSummary> {
    const environment = this.config.appleCommerceEnvironment;
    const now = new Date();
    return this.database.db.transaction(async (transaction) => {
      await transaction.execute(sql`
        select pg_advisory_xact_lock(hashtextextended(${`account:${accountId}`}, 0))
      `);
      await this.assertAccountActive(transaction, accountId);
      return this.entitlementInTransaction(transaction, accountId, environment, now);
    });
  }

  private validateVerifiedTransaction(
    transaction: VerifiedAppleTransaction,
    accountId: string,
    expectedEnvironment: CommerceEnvironment,
    processedAt: Date,
  ) {
    if (transaction.environment !== expectedEnvironment) {
      throw new BadRequestException('apple_transaction_environment_mismatch');
    }
    if (transaction.bundleId !== this.config.appleIapBundleId) {
      throw new BadRequestException('apple_transaction_bundle_mismatch');
    }
    if (!transaction.appAccountToken || transaction.appAccountToken.toLowerCase() !== accountId.toLowerCase()) {
      throw new BadRequestException('apple_transaction_account_mismatch');
    }
    if (transaction.purchaseDate > processedAt) {
      throw new BadRequestException('apple_transaction_purchase_date_invalid');
    }
    if (transaction.revocationDate) {
      throw new BadRequestException('apple_transaction_revoked');
    }
    try {
      return requireMembershipProductByAppleId(transaction.productId);
    } catch {
      throw new BadRequestException('apple_transaction_product_unsupported');
    }
  }

  private async assertAccountActive(transaction: CommerceTransaction, accountId: string) {
    const [account] = await transaction.select({ status: accounts.status })
      .from(accounts)
      .where(eq(accounts.id, accountId))
      .limit(1);
    if (!account || account.status !== 'active') throw new ConflictException('account_not_active');
  }

  private assertIdempotentReplay(
    existing: typeof appleTransactions.$inferSelect,
    verified: VerifiedAppleTransaction,
    accountId: string,
  ) {
    if (
      existing.accountId.toLowerCase() !== accountId.toLowerCase()
      || existing.appAccountToken?.toLowerCase() !== accountId.toLowerCase()
      || existing.productId !== verified.productId
      || existing.originalTransactionId !== verified.originalTransactionId
      || existing.bundleId !== verified.bundleId
      || !sameDate(existing.purchaseDate, verified.purchaseDate)
    ) throw new ConflictException('apple_transaction_idempotency_conflict');
    if (verified.signedDate < existing.signedDate) {
      throw new ConflictException('apple_transaction_stale_version');
    }
    if (
      sameDate(existing.signedDate, verified.signedDate)
      && existing.signedPayloadHash !== verified.signedPayloadHash
    ) throw new ConflictException('apple_transaction_signed_version_conflict');
  }

  private async rebuildMembership(
    transaction: CommerceTransaction,
    accountId: string,
    environment: CommerceEnvironment,
    asOf: Date,
  ) {
    const priorSegments = await transaction.select()
      .from(membershipEntitlementSegments)
      .where(and(
        eq(membershipEntitlementSegments.environment, environment),
        eq(membershipEntitlementSegments.accountId, accountId),
      ));
    const activeByOrder = new Map(
      priorSegments
        .filter((segment) => segment.status === 'active')
        .map((segment) => [segment.orderId, segment]),
    );
    const maximumRevisionByOrder = new Map<string, number>();
    for (const segment of priorSegments) {
      maximumRevisionByOrder.set(
        segment.orderId,
        Math.max(maximumRevisionByOrder.get(segment.orderId) ?? 0, segment.revision),
      );
    }
    await transaction.update(membershipEntitlementSegments).set({
      status: 'superseded',
      supersededAt: asOf,
    }).where(and(
      eq(membershipEntitlementSegments.environment, environment),
      eq(membershipEntitlementSegments.accountId, accountId),
      eq(membershipEntitlementSegments.status, 'active'),
    ));

    const orders = await transaction.select()
      .from(commerceOrders)
      .where(and(
        eq(commerceOrders.environment, environment),
        eq(commerceOrders.accountId, accountId),
        eq(commerceOrders.status, 'verified'),
      ))
      .orderBy(
        asc(commerceOrders.membershipEffectiveAt),
        asc(commerceOrders.purchasedAt),
        asc(commerceOrders.id),
      );
    const existingBatches = await transaction.select()
      .from(aiPointBatches)
      .where(and(
        eq(aiPointBatches.environment, environment),
        eq(aiPointBatches.accountId, accountId),
        eq(aiPointBatches.sourceType, 'membership'),
      ));
    const batchByOrderOrdinal = new Map(
      existingBatches
        .filter((batch) => batch.sourceOrderId)
        .map((batch) => [`${batch.sourceOrderId}:${batch.ordinal}`, batch]),
    );

    let cursor: Date | undefined;
    for (const order of orders) {
      const startsAt = cursor
        ? laterDate(cursor, order.membershipEffectiveAt)
        : order.membershipEffectiveAt;
      const endsAt = new Date(startsAt.getTime() + order.membershipContributionMs);
      const [segment] = await transaction.insert(membershipEntitlementSegments).values({
        environment,
        accountId,
        orderId: order.id,
        revision: (maximumRevisionByOrder.get(order.id) ?? 0) + 1,
        startsAt,
        endsAt,
        status: 'active',
        createdAt: asOf,
      }).returning({ id: membershipEntitlementSegments.id });
      if (!segment) throw new Error('membership_segment_insert_failed');
      const product = requireMembershipProductByKey(order.productKey);
      const oldActiveSegment = activeByOrder.get(order.id);
      for (const [ordinal, batchDefinition] of product.aiPointBatches.entries()) {
        const scheduledAt = new Date(startsAt.getTime() + (batchDefinition.offsetDays * DAY_MS));
        if (scheduledAt >= endsAt) continue;
        const batchKey = `${order.id}:${ordinal}`;
        const existingBatch = batchByOrderOrdinal.get(batchKey);
        if (existingBatch) {
          if (existingBatch.status === 'revoked' || existingBatch.status === 'merged') continue;
          const shouldReschedule = (
            (!oldActiveSegment || oldActiveSegment.startsAt > asOf)
            && existingBatch.availableAt > asOf
          );
          const availableAt = shouldReschedule ? scheduledAt : existingBatch.availableAt;
          const status = availableAt <= asOf ? 'available' : 'scheduled';
          await transaction.update(aiPointBatches).set({
            entitlementSegmentId: segment.id,
            availableAt,
            status,
            expiresAt: null,
            updatedAt: asOf,
          }).where(eq(aiPointBatches.id, existingBatch.id));
          if (status === 'available') {
            await this.ensureGrantLedger(transaction, {
              id: existingBatch.id,
              environment,
              accountId,
              points: existingBatch.grantedPoints,
              availableAt,
            });
          }
          continue;
        }
        const status = scheduledAt <= asOf ? 'available' : 'scheduled';
        const [batch] = await transaction.insert(aiPointBatches).values({
          environment,
          accountId,
          originalAccountId: order.originalAccountId,
          sourceType: 'membership',
          sourceReference: `order:${order.id}`,
          sourceOrderId: order.id,
          entitlementSegmentId: segment.id,
          ruleVersion: product.aiPointRuleVersion,
          ordinal,
          grantedPoints: batchDefinition.points,
          availableAt: scheduledAt,
          status,
          createdAt: asOf,
          updatedAt: asOf,
        }).returning({ id: aiPointBatches.id });
        if (!batch) throw new Error('ai_point_batch_insert_failed');
        if (status === 'available') {
          await this.ensureGrantLedger(transaction, {
            id: batch.id,
            environment,
            accountId,
            points: batchDefinition.points,
            availableAt: scheduledAt,
          });
        }
      }
      cursor = endsAt;
    }
  }

  private async ensureGrantLedger(
    transaction: CommerceTransaction,
    batch: {
      id: string;
      environment: CommerceEnvironment;
      accountId: string;
      points: number;
      availableAt: Date;
    },
  ) {
    await transaction.insert(aiPointLedgerEntries).values({
      environment: batch.environment,
      accountId: batch.accountId,
      batchId: batch.id,
      operationId: `grant:${batch.id}`,
      entryType: 'grant',
      direction: 'credit',
      points: batch.points,
      createdAt: batch.availableAt,
    }).onConflictDoNothing();
  }

  private async entitlementInTransaction(
    transaction: CommerceTransaction,
    accountId: string,
    environment: CommerceEnvironment,
    now: Date,
  ): Promise<CommerceEntitlementSummary> {
    const due = await transaction.select()
      .from(aiPointBatches)
      .where(and(
        eq(aiPointBatches.environment, environment),
        eq(aiPointBatches.accountId, accountId),
        eq(aiPointBatches.status, 'scheduled'),
        lte(aiPointBatches.availableAt, now),
      ));
    for (const batch of due) {
      await transaction.update(aiPointBatches).set({
        status: 'available',
        updatedAt: now,
      }).where(and(eq(aiPointBatches.id, batch.id), eq(aiPointBatches.status, 'scheduled')));
      await this.ensureGrantLedger(transaction, {
        id: batch.id,
        environment,
        accountId,
        points: batch.grantedPoints,
        availableAt: batch.availableAt,
      });
    }

    const segments = await transaction.select({ endsAt: membershipEntitlementSegments.endsAt })
      .from(membershipEntitlementSegments)
      .where(and(
        eq(membershipEntitlementSegments.environment, environment),
        eq(membershipEntitlementSegments.accountId, accountId),
        eq(membershipEntitlementSegments.status, 'active'),
      ));
    const batches = await transaction.select()
      .from(aiPointBatches)
      .where(and(
        eq(aiPointBatches.environment, environment),
        eq(aiPointBatches.accountId, accountId),
      ));
    const membershipExpiresAt = segments.reduce<Date | undefined>(
      (latest, segment) => !latest || segment.endsAt > latest ? segment.endsAt : latest,
      undefined,
    );
    const available = batches
      .filter((batch) => batch.status === 'available' && batch.availableAt <= now)
      .reduce(
        (total, batch) => total + batch.grantedPoints - batch.consumedPoints - batch.reservedPoints,
        0,
      );
    const nextGrantAt = batches
      .filter((batch) => batch.status === 'scheduled' && batch.availableAt > now)
      .reduce<Date | undefined>(
        (earliest, batch) => !earliest || batch.availableAt < earliest ? batch.availableAt : earliest,
        undefined,
      );
    return {
      environment,
      serverTime: now.toISOString(),
      membership: {
        active: Boolean(membershipExpiresAt && membershipExpiresAt > now),
        expiresAt: membershipExpiresAt?.toISOString() ?? null,
      },
      aiPoints: {
        available,
        nextGrantAt: nextGrantAt?.toISOString() ?? null,
      },
    };
  }
}
