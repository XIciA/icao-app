import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import type {
  CommerceEntitlementSummary,
  CommerceEntitlementsResponse,
  CommerceProductCatalogResponse,
  VerifyAppleTransactionResponse,
} from '@icao/contracts';
import { and, asc, eq, sql } from 'drizzle-orm';
import { createHmac } from 'node:crypto';

import { API_CONFIG, type ApiConfig } from '../config';
import { DatabaseService } from '../database/database.service';
import {
  accounts,
  aiPointBatches,
  aiPointLedgerEntries,
  appleNotificationEvents,
  appleTransactions,
  commerceOrders,
  contentEnvironmentSessionGrants,
  membershipEntitlementSegments,
  opsEntitlementAdjustments,
} from '../database/schema';
import {
  APPLE_STORE_VERIFIER,
  isRetryableAppleVerificationError,
  type AppleStoreVerifier,
} from './apple-store-verifier';
import type { VerifiedAppleTransaction } from './commerce-domain';
import type { VerifiedAppleNotification } from './commerce-domain';
import { PersistentCommerceBenefitsService } from './persistent-commerce-benefits.service';
import {
  ACTIVE_MEMBERSHIP_PRODUCTS,
  requireMembershipProductByAppleId,
  requireMembershipProductByKey,
  type CommerceEnvironment,
} from './product-catalog';
import { AiUsageRulesService } from './ai-usage-rules.service';
import { AiAllowanceService } from './ai-allowance.service';

const DAY_MS = 24 * 60 * 60 * 1_000;
const APPLE_NOTIFICATION_RETRY_MS = 60_000;
const APPLE_NOTIFICATION_RETENTION_MS = 7 * DAY_MS;
type CommerceTransaction = Parameters<Parameters<DatabaseService['db']['transaction']>[0]>[0];
type CommerceServiceConfig = Partial<Pick<
  ApiConfig,
  'appleIapBundleId' | 'contentCredentialSigningSecret'
>>;

export type AppleCommerceReconciliationReport = Readonly<{
  accountId: string;
  action:
    | 'blocked_account_closed'
    | 'create'
    | 'local_newer'
    | 'none'
    | 'record_refund'
    | 'refresh'
    | 'refund'
    | 'restore';
  appleStatus: 'refunded' | 'verified';
  applied: boolean;
  environment: CommerceEnvironment;
  localStatus: 'missing' | 'refunded' | 'revoked' | 'verified';
  mismatch: boolean;
  productKey: string;
  transactionId: string;
}>;

function sameDate(left: Date, right: Date) {
  return left.getTime() === right.getTime();
}

function laterDate(left: Date, right: Date) {
  return left > right ? left : right;
}

function normalizeAppleOrderStatus(value: string | undefined) {
  if (value === undefined) return 'missing' as const;
  if (value === 'verified' || value === 'refunded' || value === 'revoked') return value;
  throw new Error('apple_order_status_invalid');
}

@Injectable()
export class CommerceService {
  private readonly rules = new AiUsageRulesService();
  private readonly allowance = new AiAllowanceService(this.rules);
  constructor(
    @Inject(API_CONFIG) private readonly config: CommerceServiceConfig,
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(APPLE_STORE_VERIFIER) private readonly appleVerifier: AppleStoreVerifier,
    private readonly benefits: PersistentCommerceBenefitsService = new PersistentCommerceBenefitsService(),
  ) {}

  catalog(): CommerceProductCatalogResponse {
    return {
      priceSource: 'storekit',
      products: ACTIVE_MEMBERSHIP_PRODUCTS.map((product) => ({
        productKey: product.productKey,
        storeProductId: product.appleProductId,
        displayName: product.displayName,
        durationDays: product.durationDays,
        autoRenews: false,
        recommended: false,
      })),
    };
  }

  async allowanceForAdmin(accountId: string, environment: CommerceEnvironment) {
    return this.database.db.transaction((tx) => this.allowance.summary(tx, accountId, environment));
  }

  async applyAuditedEntitlementAdjustmentInTransaction(
    transaction: CommerceTransaction,
    input: {
      accountId: string;
      aiPoints: number;
      aiMode?: "gift" | "refill";
      environment: CommerceEnvironment;
      expectedBefore: CommerceEntitlementSummary;
      membershipDays: number;
      previewId: string;
      reason: string;
      staffId: string;
      appliedAt: Date;
    },
  ) {
    await transaction.execute(sql`
      select pg_advisory_xact_lock(hashtextextended(${`account:${input.accountId}`}, 0))
    `);
    await this.assertAccountActive(transaction, input.accountId);
    const before = await this.entitlementInTransaction(
      transaction,
      input.accountId,
      input.environment,
      input.appliedAt,
    );
    if (
      before.membership.active !== input.expectedBefore.membership.active
      || before.membership.expiresAt !== input.expectedBefore.membership.expiresAt
      || before.aiPoints.available !== input.expectedBefore.aiPoints.available
      || before.aiPoints.nextGrantAt !== input.expectedBefore.aiPoints.nextGrantAt
    ) throw new ConflictException('ops_entitlement_preview_stale');
    const [adjustment] = await transaction.insert(opsEntitlementAdjustments).values({
      previewId: input.previewId,
      staffId: input.staffId,
      accountId: input.accountId,
      environment: input.environment,
      reason: input.reason,
      membershipDays: input.membershipDays,
      aiPoints: input.aiPoints,
      appliedAt: input.appliedAt,
      createdAt: input.appliedAt,
    }).returning({ id: opsEntitlementAdjustments.id });
    if (!adjustment) throw new Error('ops_entitlement_adjustment_insert_failed');
    if (input.membershipDays > 0) {
      await this.rebuildMembership(transaction, input.accountId, input.environment, input.appliedAt);
    }
    if (input.aiMode === 'refill') {
      const context = await this.allowance.prepare(transaction, input.accountId, input.environment, input.appliedAt);
      if (context.total - context.available !== input.aiPoints) throw new ConflictException('ops_entitlement_preview_stale');
      await this.benefits.refillAllowance(transaction, context.batchIds, input.appliedAt, adjustment.id);
    } else await this.benefits.grantCompensation(transaction, {
      accountId: input.accountId,
      adjustmentId: adjustment.id,
      environment: input.environment,
      grantedAt: input.appliedAt,
      points: input.aiPoints,
    });
    return {
      adjustmentId: adjustment.id,
      before,
      entitlement: await this.entitlementInTransaction(
        transaction,
        input.accountId,
        input.environment,
        input.appliedAt,
      ),
    };
  }

  async verifyAppleTransaction(
    accountId: string,
    signedTransaction: string,
    sessionId?: string,
  ): Promise<VerifyAppleTransactionResponse> {
    const processedAt = new Date();
    let verified: VerifiedAppleTransaction;
    try {
      verified = await this.appleVerifier.verifyTransaction(signedTransaction);
    } catch (error) {
      if (
        isRetryableAppleVerificationError(error)
        || (error instanceof Error && error.message === 'apple_commerce_not_configured')
      ) {
        throw new ServiceUnavailableException('apple_commerce_unavailable');
      }
      throw new BadRequestException('invalid_apple_transaction');
    }
    const environment = verified.environment;
    const product = this.validateVerifiedTransaction(verified, accountId, processedAt);

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
          ...await this.rules.purchaseTerms(transaction, product.productKey, verified.purchaseDate),
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

      const entitlement = await this.entitlementInTransaction(
        transaction,
        accountId,
        environment,
        processedAt,
      );
      if (
        environment === 'sandbox'
        && sessionId
        && entitlement.membership.active
        && entitlement.membership.expiresAt
        && this.config.contentCredentialSigningSecret
      ) {
        const expiresAt = new Date(entitlement.membership.expiresAt);
        const sessionDigest = createHmac('sha256', this.config.contentCredentialSigningSecret)
          .update(`content-session-v1\0${sessionId}`)
          .digest('hex');
        await transaction.insert(contentEnvironmentSessionGrants).values({
          environment,
          accountId,
          sessionDigest,
          verifiedTransactionId: verified.transactionId,
          expiresAt,
          retentionAt: new Date(expiresAt.getTime() + 180 * DAY_MS),
          createdAt: processedAt,
          updatedAt: processedAt,
        }).onConflictDoUpdate({
          target: [
            contentEnvironmentSessionGrants.environment,
            contentEnvironmentSessionGrants.sessionDigest,
          ],
          set: {
            accountId,
            verifiedTransactionId: verified.transactionId,
            expiresAt,
            retentionAt: new Date(expiresAt.getTime() + 180 * DAY_MS),
            updatedAt: processedAt,
          },
        });
      }

      return {
        created,
        transactionId: verified.transactionId,
        entitlement,
      };
    });
  }

  async reconcileAppleServerTransaction(
    signedTransaction: string,
    expectedEnvironment: CommerceEnvironment,
    apply: boolean,
    processedAt = new Date(),
  ): Promise<AppleCommerceReconciliationReport> {
    let verified: VerifiedAppleTransaction;
    try {
      verified = await this.appleVerifier.verifyTransaction(signedTransaction);
    } catch (error) {
      if (
        isRetryableAppleVerificationError(error)
        || (error instanceof Error && error.message === 'apple_commerce_not_configured')
      ) throw new ServiceUnavailableException('apple_commerce_unavailable');
      throw new BadRequestException('invalid_apple_transaction');
    }
    if (verified.environment !== expectedEnvironment) {
      throw new BadRequestException('apple_transaction_environment_mismatch');
    }
    const accountId = verified.appAccountToken?.toLowerCase();
    if (!accountId) throw new BadRequestException('apple_transaction_account_mismatch');
    const product = this.validateAppleServerTransaction(verified, accountId, processedAt);
    const appleStatus = verified.revocationDate ? 'refunded' as const : 'verified' as const;

    return this.database.db.transaction(async (transaction) => {
      await transaction.execute(sql`
        select pg_advisory_xact_lock(
          hashtextextended(${`apple-transaction:${expectedEnvironment}:${verified.transactionId}`}, 0)
        )
      `);
      await transaction.execute(sql`
        select pg_advisory_xact_lock(hashtextextended(${`account:${accountId}`}, 0))
      `);
      const [existingTransaction] = await transaction.select()
        .from(appleTransactions)
        .where(and(
          eq(appleTransactions.environment, expectedEnvironment),
          eq(appleTransactions.transactionId, verified.transactionId),
        ))
        .limit(1);
      const [existingOrder] = existingTransaction
        ? await transaction.select().from(commerceOrders)
          .where(eq(commerceOrders.id, existingTransaction.orderId)).limit(1)
        : [];
      if (existingTransaction && !existingOrder) throw new Error('commerce_order_not_found');
      if (existingTransaction) {
        this.assertNotificationTransactionIdentity(
          existingTransaction,
          verified,
          accountId,
        );
        if (
          sameDate(existingTransaction.signedDate, verified.signedDate)
          && existingTransaction.signedPayloadHash !== verified.signedPayloadHash
        ) throw new ConflictException('apple_transaction_signed_version_conflict');
      }

      const localStatus = normalizeAppleOrderStatus(existingOrder?.status);
      const accountIsActive = await this.isAccountActive(transaction, accountId);
      let action: AppleCommerceReconciliationReport['action'];
      if (!existingTransaction && !accountIsActive) {
        action = 'blocked_account_closed';
      } else if (!existingTransaction) {
        action = appleStatus === 'refunded' ? 'record_refund' : 'create';
      } else if (verified.signedDate < existingTransaction.signedDate) {
        action = 'local_newer';
      } else if (appleStatus === 'refunded' && localStatus === 'verified') {
        action = 'refund';
      } else if (
        appleStatus === 'verified'
        && (localStatus === 'refunded' || localStatus === 'revoked')
      ) {
        action = accountIsActive ? 'restore' : 'blocked_account_closed';
      } else if (verified.signedDate > existingTransaction.signedDate) {
        action = 'refresh';
      } else {
        action = 'none';
      }

      const baseReport = {
        accountId,
        action,
        appleStatus,
        applied: false,
        environment: expectedEnvironment,
        localStatus,
        mismatch: action !== 'none',
        productKey: product.productKey,
        transactionId: verified.transactionId,
      } satisfies AppleCommerceReconciliationReport;
      if (!apply || ['blocked_account_closed', 'local_newer', 'none'].includes(action)) {
        return baseReport;
      }

      if (!existingTransaction) {
        const cycleKey = appleStatus === 'refunded'
          ? `reconciliation:${expectedEnvironment}:${verified.transactionId}:${verified.signedDate.getTime()}`
          : null;
        const [order] = await transaction.insert(commerceOrders).values({
          environment: expectedEnvironment,
          channel: 'apple_app_store',
          externalOrderId: verified.transactionId,
          accountId,
          originalAccountId: accountId,
          productKey: product.productKey,
          externalProductId: verified.productId,
          durationDays: product.durationDays,
          ...await this.rules.purchaseTerms(transaction, product.productKey, verified.purchaseDate),
          membershipGrantSource: 'purchase_discovery',
          membershipEffectiveAt: verified.purchaseDate,
          membershipContributionMs: product.durationDays * DAY_MS,
          status: appleStatus,
          purchasedAt: verified.purchaseDate,
          revokedAt: verified.revocationDate,
          revocationCycleKey: cycleKey,
          createdAt: processedAt,
          updatedAt: processedAt,
        }).returning({ id: commerceOrders.id });
        if (!order) throw new Error('commerce_order_insert_failed');
        await transaction.insert(appleTransactions).values({
          environment: expectedEnvironment,
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
          revocationDate: verified.revocationDate,
          revocationReason: verified.revocationReason,
          signedPayloadHash: verified.signedPayloadHash,
          decodedPayload: verified.decodedPayload,
          createdAt: processedAt,
          updatedAt: processedAt,
        });
        if (appleStatus === 'verified') {
          await this.rebuildMembership(transaction, accountId, expectedEnvironment, processedAt);
        }
        return { ...baseReport, applied: true };
      }

      if (verified.signedDate > existingTransaction.signedDate) {
        await transaction.update(appleTransactions).set({
          signedDate: verified.signedDate,
          signedPayloadHash: verified.signedPayloadHash,
          decodedPayload: verified.decodedPayload,
          storefront: verified.storefront,
          currency: verified.currency,
          priceMilliunits: verified.priceMilliunits,
          revocationDate: verified.revocationDate ?? null,
          revocationReason: verified.revocationReason ?? null,
          updatedAt: processedAt,
        }).where(eq(appleTransactions.id, existingTransaction.id));
      }
      if (action === 'refund') {
        await this.revokeAppleOrder(transaction, {
          accountId,
          cycleKey: `reconciliation:${expectedEnvironment}:${verified.transactionId}:${verified.signedDate.getTime()}`,
          environment: expectedEnvironment,
          orderId: existingTransaction.orderId,
          processedAt,
          revocationReason: verified.revocationReason,
          revokedAt: verified.revocationDate ?? verified.signedDate,
          targetStatus: 'refunded',
          transactionId: verified.transactionId,
        });
      } else if (action === 'restore') {
        await this.restoreAppleOrder(transaction, {
          accountId,
          environment: expectedEnvironment,
          orderId: existingTransaction.orderId,
          processedAt,
          transactionId: verified.transactionId,
        });
      } else if (action === 'refresh' && appleStatus === 'refunded') {
        await transaction.update(commerceOrders).set({
          revokedAt: verified.revocationDate,
          updatedAt: processedAt,
        }).where(eq(commerceOrders.id, existingTransaction.orderId));
      }
      return { ...baseReport, applied: true };
    });
  }

  async currentEntitlement(accountId: string): Promise<CommerceEntitlementsResponse> {
    const now = new Date();
    return this.database.db.transaction(async (transaction) => {
      await transaction.execute(sql`
        select pg_advisory_xact_lock(hashtextextended(${`account:${accountId}`}, 0))
      `);
      await this.assertAccountActive(transaction, accountId);
      return {
        production: await this.entitlementInTransaction(
          transaction,
          accountId,
          'production',
          now,
        ),
        sandbox: await this.entitlementInTransaction(
          transaction,
          accountId,
          'sandbox',
          now,
        ),
      };
    });
  }

  async processAppleNotification(signedPayload: string, processedAt = new Date()) {
    let notification: VerifiedAppleNotification;
    try {
      notification = await this.appleVerifier.verifyNotification(signedPayload);
    } catch (error) {
      if (
        isRetryableAppleVerificationError(error)
        || (error instanceof Error && error.message === 'apple_commerce_not_configured')
      ) {
        throw new ServiceUnavailableException('apple_commerce_unavailable');
      }
      throw new BadRequestException('invalid_apple_notification');
    }
    if (notification.transaction) {
      this.validateNotificationTransaction(notification, processedAt);
    }

    const result = await this.database.db.transaction(async (transaction) => {
      const eventKey = `${notification.environment}:${notification.notificationUuid}`;
      await transaction.execute(sql`
        select pg_advisory_xact_lock(hashtextextended(${`apple-notification:${eventKey}`}, 0))
      `);
      const [existingEvent] = await transaction.select()
        .from(appleNotificationEvents)
        .where(and(
          eq(appleNotificationEvents.environment, notification.environment),
          eq(appleNotificationEvents.notificationUuid, notification.notificationUuid),
        ))
        .limit(1);
      if (existingEvent?.signedPayloadHash !== undefined
        && existingEvent.signedPayloadHash !== notification.signedPayloadHash) {
        throw new ConflictException('apple_notification_idempotency_conflict');
      }
      if (existingEvent?.status === 'processed' || existingEvent?.status === 'expired') {
        await transaction.update(appleNotificationEvents).set({
          decodedPayload: notification.decodedPayload,
          signedPayload: null,
          nextAttemptAt: null,
          lockedAt: null,
          leaseOwner: null,
          leaseUntil: null,
          retentionAt: null,
        }).where(eq(appleNotificationEvents.id, existingEvent.id));
        return { duplicate: true, processed: true };
      }
      if (existingEvent?.status === 'failed') {
        // Compatibility for a candidate deployment that persisted the hash
        // before raw-payload retention existed. The JWS has just been fully
        // verified and its digest matches the existing UUID row. Rewriting
        // decodedPayload also removes nested Apple JWS retained by that build.
        await transaction.update(appleNotificationEvents).set({
          decodedPayload: notification.decodedPayload,
          signedPayload: existingEvent.signedPayload ?? signedPayload,
          nextAttemptAt: existingEvent.nextAttemptAt
            ?? new Date(processedAt.getTime() + APPLE_NOTIFICATION_RETRY_MS),
          retentionAt: existingEvent.retentionAt
            ?? new Date(processedAt.getTime() + APPLE_NOTIFICATION_RETENTION_MS),
        }).where(eq(appleNotificationEvents.id, existingEvent.id));
      }
      if (!existingEvent) {
        await transaction.insert(appleNotificationEvents).values({
          environment: notification.environment,
          notificationUuid: notification.notificationUuid,
          notificationType: notification.notificationType,
          subtype: notification.subtype,
          status: 'received',
          signedPayload,
          signedPayloadHash: notification.signedPayloadHash,
          decodedPayload: notification.decodedPayload,
          signedAt: notification.signedDate,
          receivedAt: processedAt,
        });
      }

      if (!notification.transaction) {
        await this.markAppleNotificationProcessed(transaction, notification, processedAt);
        return { duplicate: false, processed: true };
      }

      const verified = notification.transaction;
      const environment = notification.environment;
      await transaction.execute(sql`
        select pg_advisory_xact_lock(
          hashtextextended(${`apple-transaction:${environment}:${verified.transactionId}`}, 0)
        )
      `);
      const [existingTransaction] = await transaction.select()
        .from(appleTransactions)
        .where(and(
          eq(appleTransactions.environment, environment),
          eq(appleTransactions.transactionId, verified.transactionId),
        ))
        .limit(1);

      let accountId = existingTransaction?.accountId ?? verified.appAccountToken;
      if (!accountId) {
        await transaction.update(appleNotificationEvents).set({
          status: 'failed',
          signedPayload,
          errorCode: 'apple_notification_transaction_unresolved',
          nextAttemptAt: new Date(processedAt.getTime() + APPLE_NOTIFICATION_RETRY_MS),
          retentionAt: existingEvent?.retentionAt
            ?? new Date(processedAt.getTime() + APPLE_NOTIFICATION_RETENTION_MS),
          processedAt,
        }).where(and(
          eq(appleNotificationEvents.environment, environment),
          eq(appleNotificationEvents.notificationUuid, notification.notificationUuid),
        ));
        return { duplicate: Boolean(existingEvent), processed: false };
      }
      accountId = accountId.toLowerCase();
      await transaction.execute(sql`
        select pg_advisory_xact_lock(hashtextextended(${`account:${accountId}`}, 0))
      `);
      // The status check must happen after the same account lock used by
      // account deletion. Otherwise a refund reversal can race deletion and
      // recreate benefits after the deletion barrier has started.
      const accountIsActive = await this.isAccountActive(transaction, accountId);
      if (!existingTransaction && !accountIsActive) {
        await this.markAppleNotificationIgnored(
          transaction,
          notification,
          processedAt,
          'apple_notification_account_closed',
        );
        return { duplicate: Boolean(existingEvent), processed: true };
      }

      let orderId: string;
      let statusUpdateAccepted = true;
      if (existingTransaction) {
        this.assertNotificationTransactionIdentity(existingTransaction, verified, accountId);
        orderId = existingTransaction.orderId;
        if (verified.signedDate < existingTransaction.signedDate) {
          statusUpdateAccepted = false;
        } else if (
          sameDate(verified.signedDate, existingTransaction.signedDate)
          && verified.signedPayloadHash !== existingTransaction.signedPayloadHash
        ) {
          throw new ConflictException('apple_transaction_signed_version_conflict');
        } else if (verified.signedDate > existingTransaction.signedDate) {
          const clearRevocation = notification.notificationType === 'REFUND_REVERSED'
            && accountIsActive;
          await transaction.update(appleTransactions).set({
            signedDate: verified.signedDate,
            signedPayloadHash: verified.signedPayloadHash,
            decodedPayload: verified.decodedPayload,
            storefront: verified.storefront,
            currency: verified.currency,
            priceMilliunits: verified.priceMilliunits,
            revocationDate: clearRevocation
              ? null
              : verified.revocationDate ?? existingTransaction.revocationDate,
            revocationReason: clearRevocation
              ? null
              : verified.revocationReason ?? existingTransaction.revocationReason,
            updatedAt: processedAt,
          }).where(eq(appleTransactions.id, existingTransaction.id));
        }
      } else {
        const product = requireMembershipProductByAppleId(verified.productId);
        const [order] = await transaction.insert(commerceOrders).values({
          environment,
          channel: 'apple_app_store',
          externalOrderId: verified.transactionId,
          accountId,
          originalAccountId: accountId,
          productKey: product.productKey,
          externalProductId: verified.productId,
          durationDays: product.durationDays,
          ...await this.rules.purchaseTerms(transaction, product.productKey, verified.purchaseDate),
          membershipGrantSource: 'purchase_discovery',
          membershipEffectiveAt: verified.purchaseDate,
          membershipContributionMs: product.durationDays * DAY_MS,
          status: 'verified',
          purchasedAt: verified.purchaseDate,
          createdAt: processedAt,
          updatedAt: processedAt,
        }).returning({ id: commerceOrders.id });
        if (!order) throw new Error('commerce_order_insert_failed');
        orderId = order.id;
        await transaction.insert(appleTransactions).values({
          environment,
          transactionId: verified.transactionId,
          originalTransactionId: verified.originalTransactionId,
          orderId,
          accountId,
          appAccountToken: verified.appAccountToken,
          productId: verified.productId,
          bundleId: verified.bundleId,
          storefront: verified.storefront,
          currency: verified.currency,
          priceMilliunits: verified.priceMilliunits,
          purchaseDate: verified.purchaseDate,
          signedDate: verified.signedDate,
          revocationDate: verified.revocationDate,
          revocationReason: verified.revocationReason,
          signedPayloadHash: verified.signedPayloadHash,
          decodedPayload: verified.decodedPayload,
          createdAt: processedAt,
          updatedAt: processedAt,
        });
        await this.rebuildMembership(transaction, accountId, environment, processedAt);
      }

      if (statusUpdateAccepted) {
        if (notification.notificationType === 'REFUND_REVERSED') {
          if (accountIsActive) {
            await this.restoreAppleOrder(transaction, {
              accountId,
              environment,
              orderId,
              processedAt,
              transactionId: verified.transactionId,
            });
          } else {
            await this.markAppleNotificationIgnored(
              transaction,
              notification,
              processedAt,
              'apple_notification_account_closed',
            );
            return { duplicate: Boolean(existingEvent), processed: true };
          }
        } else if (
          verified.revocationDate
          || notification.notificationType === 'REFUND'
          || notification.notificationType === 'REVOKE'
        ) {
          await this.revokeAppleOrder(transaction, {
            accountId,
            cycleKey: `notification:${notification.notificationUuid}`,
            environment,
            orderId,
            processedAt,
            revocationReason: notification.transaction?.revocationReason,
            revokedAt: notification.transaction?.revocationDate ?? notification.signedDate,
            targetStatus: notification.notificationType === 'REVOKE' ? 'revoked' : 'refunded',
            transactionId: verified.transactionId,
          });
        }
      }

      await this.markAppleNotificationProcessed(transaction, notification, processedAt);
      return { duplicate: Boolean(existingEvent), processed: true };
    });

    if (!result.processed) {
      // Persist the unresolved event before asking Apple to retry. A later
      // client verification or history reconciliation can establish ownership.
      throw new ServiceUnavailableException('apple_notification_reconciliation_pending');
    }
    return {
      ...result,
      environment: notification.environment,
      notificationUuid: notification.notificationUuid,
    };
  }

  private validateVerifiedTransaction(
    transaction: VerifiedAppleTransaction,
    accountId: string,
    processedAt: Date,
  ) {
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
    if (transaction.productType !== 'non_renewing_subscription') {
      throw new BadRequestException('apple_transaction_type_invalid');
    }
    if (transaction.quantity !== 1) {
      throw new BadRequestException('apple_transaction_quantity_invalid');
    }
    try {
      return requireMembershipProductByAppleId(transaction.productId);
    } catch {
      throw new BadRequestException('apple_transaction_product_unsupported');
    }
  }

  private validateAppleServerTransaction(
    transaction: VerifiedAppleTransaction,
    accountId: string,
    processedAt: Date,
  ) {
    if (transaction.bundleId !== this.config.appleIapBundleId) {
      throw new BadRequestException('apple_transaction_bundle_mismatch');
    }
    if (!transaction.appAccountToken || transaction.appAccountToken.toLowerCase() !== accountId) {
      throw new BadRequestException('apple_transaction_account_mismatch');
    }
    if (transaction.purchaseDate > processedAt) {
      throw new BadRequestException('apple_transaction_purchase_date_invalid');
    }
    if (transaction.productType !== 'non_renewing_subscription') {
      throw new BadRequestException('apple_transaction_type_invalid');
    }
    if (transaction.quantity !== 1) {
      throw new BadRequestException('apple_transaction_quantity_invalid');
    }
    try {
      return requireMembershipProductByAppleId(transaction.productId);
    } catch {
      throw new BadRequestException('apple_transaction_product_unsupported');
    }
  }

  private validateNotificationTransaction(
    notification: VerifiedAppleNotification,
    processedAt: Date,
  ) {
    const transaction = notification.transaction!;
    if (transaction.environment !== notification.environment) {
      throw new BadRequestException('apple_notification_environment_mismatch');
    }
    if (transaction.bundleId !== this.config.appleIapBundleId) {
      throw new BadRequestException('apple_transaction_bundle_mismatch');
    }
    if (transaction.purchaseDate > processedAt) {
      throw new BadRequestException('apple_transaction_purchase_date_invalid');
    }
    if (transaction.productType !== 'non_renewing_subscription') {
      throw new BadRequestException('apple_transaction_type_invalid');
    }
    if (transaction.quantity !== 1) {
      throw new BadRequestException('apple_transaction_quantity_invalid');
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

  private async isAccountActive(transaction: CommerceTransaction, accountId: string) {
    const [account] = await transaction.select({ status: accounts.status })
      .from(accounts)
      .where(eq(accounts.id, accountId))
      .limit(1);
    return account?.status === 'active';
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

  private assertNotificationTransactionIdentity(
    existing: typeof appleTransactions.$inferSelect,
    verified: VerifiedAppleTransaction,
    accountId: string,
  ) {
    if (
      existing.accountId.toLowerCase() !== accountId.toLowerCase()
      || (verified.appAccountToken
        && verified.appAccountToken.toLowerCase() !== accountId.toLowerCase())
      || existing.productId !== verified.productId
      || existing.originalTransactionId !== verified.originalTransactionId
      || existing.bundleId !== verified.bundleId
      || !sameDate(existing.purchaseDate, verified.purchaseDate)
    ) throw new ConflictException('apple_transaction_idempotency_conflict');
  }

  private async markAppleNotificationProcessed(
    transaction: CommerceTransaction,
    notification: VerifiedAppleNotification,
    processedAt: Date,
  ) {
    await transaction.update(appleNotificationEvents).set({
      status: 'processed',
      signedPayload: null,
      errorCode: null,
      nextAttemptAt: null,
      lockedAt: null,
      leaseOwner: null,
      leaseUntil: null,
      retentionAt: null,
      processedAt,
    }).where(and(
      eq(appleNotificationEvents.environment, notification.environment),
      eq(appleNotificationEvents.notificationUuid, notification.notificationUuid),
    ));
  }

  private async markAppleNotificationIgnored(
    transaction: CommerceTransaction,
    notification: VerifiedAppleNotification,
    processedAt: Date,
    reason: string,
  ) {
    await transaction.update(appleNotificationEvents).set({
      status: 'processed',
      signedPayload: null,
      errorCode: reason,
      nextAttemptAt: null,
      lockedAt: null,
      leaseOwner: null,
      leaseUntil: null,
      retentionAt: null,
      processedAt,
    }).where(and(
      eq(appleNotificationEvents.environment, notification.environment),
      eq(appleNotificationEvents.notificationUuid, notification.notificationUuid),
    ));
  }

  /** Verified WeChat transport joins the same order owner and membership rebuild as StoreKit. */
  async fulfillWechatPayment(transaction: CommerceTransaction, input: {
    accountId: string; transactionId: string; productKey: string; durationDays: number;
    ruleVersionId: string; paidAt: Date;
  }) {
    await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`account:${input.accountId}`}, 0))`);
    const active = await this.isAccountActive(transaction, input.accountId);
    const [existing] = await transaction.select().from(commerceOrders).where(and(
      eq(commerceOrders.environment, 'production'), eq(commerceOrders.channel, 'wechat_pay'),
      eq(commerceOrders.externalOrderId, input.transactionId),
    )).limit(1);
    if (existing && (existing.accountId !== input.accountId || existing.productKey !== input.productKey)) {
      throw new ConflictException('wechat_pay_order_owner_mismatch');
    }
    if (!existing) {
      await transaction.insert(commerceOrders).values({
        environment: 'production', channel: 'wechat_pay', externalOrderId: input.transactionId,
        status: active ? 'verified' : 'revoked', revokedAt: active ? null : new Date(),
        accountId: input.accountId, originalAccountId: input.accountId, productKey: input.productKey,
        externalProductId: input.productKey, durationDays: input.durationDays,
        aiPointRuleVersion: 'ai-weekly-v1', aiUsageRuleVersionId: input.ruleVersionId,
        membershipGrantSource: 'purchase_discovery', membershipEffectiveAt: input.paidAt,
        membershipContributionMs: input.durationDays * DAY_MS, purchasedAt: input.paidAt,
      });
      if (active) await this.rebuildMembership(transaction, input.accountId, 'production', new Date());
    }
  }

  async refundWechatPayment(transaction: CommerceTransaction, input: {
    accountId: string; transactionId: string; refundId: string; refundedAt: Date;
  }) {
    await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`account:${input.accountId}`}, 0))`);
    const [order] = await transaction.select().from(commerceOrders).where(and(
      eq(commerceOrders.environment, 'production'), eq(commerceOrders.channel, 'wechat_pay'),
      eq(commerceOrders.externalOrderId, input.transactionId), eq(commerceOrders.accountId, input.accountId),
    )).limit(1);
    if (!order) throw new ConflictException('wechat_pay_order_not_found');
    if (order.status !== 'verified') return;
    const now = new Date();
    const cycleKey = `wechat-refund:${input.refundId}`;
    await transaction.update(commerceOrders).set({ status: 'refunded', revokedAt: input.refundedAt,
      revocationCycleKey: cycleKey, updatedAt: now }).where(eq(commerceOrders.id, order.id));
    await this.benefits.revokeOrderBenefits(transaction, { accountId: input.accountId, cycleKey,
      environment: 'production', orderId: order.id, revokedAt: now });
    // Deleted accounts retain financial records but never regain entitlement from a late callback.
    if (await this.isAccountActive(transaction, input.accountId)) await this.rebuildMembership(transaction, input.accountId, 'production', now);
  }

  private async revokeAppleOrder(
    transaction: CommerceTransaction,
    input: {
      accountId: string;
      cycleKey: string;
      environment: CommerceEnvironment;
      orderId: string;
      processedAt: Date;
      revocationReason?: number;
      revokedAt: Date;
      targetStatus: 'refunded' | 'revoked';
      transactionId: string;
    },
  ) {
    const [order] = await transaction.select()
      .from(commerceOrders)
      .where(eq(commerceOrders.id, input.orderId))
      .limit(1);
    if (!order) throw new Error('commerce_order_not_found');
    if (order.status === 'verified') {
      await transaction.update(commerceOrders).set({
        status: input.targetStatus,
        revokedAt: input.revokedAt,
        revocationCycleKey: input.cycleKey,
        updatedAt: input.processedAt,
      }).where(eq(commerceOrders.id, input.orderId));
      await transaction.update(appleTransactions).set({
        revocationDate: input.revokedAt,
        revocationReason: input.revocationReason,
        updatedAt: input.processedAt,
      }).where(and(
        eq(appleTransactions.environment, input.environment),
        eq(appleTransactions.transactionId, input.transactionId),
      ));
      await this.benefits.revokeOrderBenefits(transaction, {
        accountId: input.accountId,
        cycleKey: input.cycleKey,
        environment: input.environment,
        orderId: input.orderId,
        // The Apple revocation can predate receipt. Local reservation and
        // ledger transitions must use processing time so they never precede
        // rows that were created while the notification was in flight.
        revokedAt: input.processedAt,
      });
      await this.rebuildMembership(
        transaction,
        input.accountId,
        input.environment,
        input.processedAt,
      );
    } else if (input.targetStatus === 'revoked' && order.status !== 'revoked') {
      await transaction.update(commerceOrders).set({
        status: 'revoked',
        updatedAt: input.processedAt,
      }).where(eq(commerceOrders.id, input.orderId));
    }
  }

  private async restoreAppleOrder(
    transaction: CommerceTransaction,
    input: {
      accountId: string;
      environment: CommerceEnvironment;
      orderId: string;
      processedAt: Date;
      transactionId: string;
    },
  ) {
    const [order] = await transaction.select()
      .from(commerceOrders)
      .where(eq(commerceOrders.id, input.orderId))
      .limit(1);
    if (!order) throw new Error('commerce_order_not_found');
    if (order.status === 'verified') return;
    if (!order.revocationCycleKey) throw new Error('apple_refund_cycle_missing');
    const cycleKey = order.revocationCycleKey;
    await transaction.update(commerceOrders).set({
      status: 'verified',
      revokedAt: null,
      revocationCycleKey: null,
      membershipGrantSource: 'refund_restore',
      updatedAt: input.processedAt,
    }).where(eq(commerceOrders.id, input.orderId));
    await transaction.update(appleTransactions).set({
      revocationDate: null,
      revocationReason: null,
      updatedAt: input.processedAt,
    }).where(and(
      eq(appleTransactions.environment, input.environment),
      eq(appleTransactions.transactionId, input.transactionId),
    ));
    await this.benefits.prepareOrderPointBatchesForRestore(transaction, {
      accountId: input.accountId,
      environment: input.environment,
      orderId: input.orderId,
      restoredAt: input.processedAt,
    });
    await this.rebuildMembership(
      transaction,
      input.accountId,
      input.environment,
      input.processedAt,
    );
    await this.benefits.restoreOrderPointBatches(transaction, {
      accountId: input.accountId,
      cycleKey,
      environment: input.environment,
      orderId: input.orderId,
      restoredAt: input.processedAt,
    });
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
    const maximumRevisionBySource = new Map<string, number>();
    for (const segment of priorSegments) {
      const sourceKey = segment.orderId
        ? `order:${segment.orderId}`
        : `adjustment:${segment.opsAdjustmentId}`;
      maximumRevisionBySource.set(
        sourceKey,
        Math.max(maximumRevisionBySource.get(sourceKey) ?? 0, segment.revision),
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
    const adjustments = await transaction.select()
      .from(opsEntitlementAdjustments)
      .where(and(
        eq(opsEntitlementAdjustments.environment, environment),
        eq(opsEntitlementAdjustments.accountId, accountId),
        sql`${opsEntitlementAdjustments.membershipDays} > 0`,
      ));
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

    const sources = [
      ...orders.map((order) => ({
        type: 'order' as const,
        id: order.id,
        effectiveAt: order.membershipEffectiveAt,
        createdAt: order.purchasedAt,
        contributionMs: order.membershipContributionMs,
        order,
      })),
      ...adjustments.map((adjustment) => ({
        type: 'adjustment' as const,
        id: adjustment.id,
        effectiveAt: adjustment.appliedAt,
        createdAt: adjustment.createdAt,
        contributionMs: adjustment.membershipDays * DAY_MS,
        adjustment,
      })),
    ].sort((left, right) => (
      left.effectiveAt.getTime() - right.effectiveAt.getTime()
      || left.createdAt.getTime() - right.createdAt.getTime()
      || left.id.localeCompare(right.id)
    ));

    let cursor: Date | undefined;
    for (const source of sources) {
      const startsAt = cursor
        ? laterDate(cursor, source.effectiveAt)
        : source.effectiveAt;
      const endsAt = new Date(startsAt.getTime() + source.contributionMs);
      const [segment] = await transaction.insert(membershipEntitlementSegments).values({
        environment,
        accountId,
        orderId: source.type === 'order' ? source.id : null,
        opsAdjustmentId: source.type === 'adjustment' ? source.id : null,
        revision: (maximumRevisionBySource.get(`${source.type}:${source.id}`) ?? 0) + 1,
        startsAt,
        endsAt,
        status: 'active',
        createdAt: asOf,
      }).returning({ id: membershipEntitlementSegments.id });
      if (!segment) throw new Error('membership_segment_insert_failed');
      if (source.type === 'adjustment') {
        cursor = endsAt;
        continue;
      }
      const order = source.order;
      if (order.aiUsageRuleVersionId) {
        cursor = endsAt;
        continue;
      }
      const product = requireMembershipProductByKey(order.productKey);
      for (const [ordinal, batchDefinition] of product.aiPointBatches.entries()) {
        const scheduledAt = new Date(startsAt.getTime() + (batchDefinition.offsetDays * DAY_MS));
        if (scheduledAt >= endsAt) continue;
        const batchKey = `${order.id}:${ordinal}`;
        const existingBatch = batchByOrderOrdinal.get(batchKey);
        if (existingBatch) {
          if (existingBatch.status === 'revoked' || existingBatch.status === 'merged') continue;
          // An issued batch is a durable credit, but every still-scheduled
          // batch follows the rebuilt membership segment. This also covers a
          // later order that already started before an earlier order was
          // refunded or restored.
          const availableAt = existingBatch.status === 'scheduled'
            ? scheduledAt
            : existingBatch.availableAt;
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
    const context = await this.allowance.summary(transaction, accountId, environment, now);
    const membershipExpiresAt = context.summary.membershipExpiresAt;
    return {
      environment,
      serverTime: now.toISOString(),
      membership: {
        active: context.summary.mode === 'weekly',
        expiresAt: membershipExpiresAt,
      },
      aiPoints: {
        available: context.available + context.bonusAvailable,
        nextGrantAt: context.summary.resetAt,
      },
    };
  }
}
