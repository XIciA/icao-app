import { Inject, Injectable } from '@nestjs/common';
import type {
  OpsAccountCommerceSummary,
  OpsFeedbackQueueItem,
  OpsHealthSummary,
  OpsPrivacyRequestQueueItem,
} from '@icao/contracts';
import { maskChinaMobile, normalizeChinaMobile } from '@icao/contracts';
import type { NativeOpsUserSummary as OpsUserSummary } from '@icao/contracts/native-auth';
import { count, desc, eq, inArray, or } from 'drizzle-orm';

import { AccountIdentityService } from '../account/account-identity.service';
import { CommerceService } from '../commerce/commerce.service';
import { OPS_API_CONFIG, type OpsApiConfig } from '../config';
import {
  accountDeletionJobs,
  accountIdentities,
  accounts,
  aiPointLedgerEntries,
  commerceOrders,
  feedbackTickets,
  opsAuditEvents,
} from '../database/schema';
import { DatabaseService } from '../database/database.service';
import { AdminAuditService } from './admin-audit.service';
import type { OpsAuthenticatedStaff } from './admin.types';

function maskedReference(value: string) {
  if (value.length <= 8) return `${value.slice(0, 2)}••••${value.slice(-2)}`;
  return `${value.slice(0, 4)}••••••${value.slice(-4)}`;
}

function feedbackSummary(value: string) {
  const compact = value.replace(/\s+/gu, ' ').trim();
  return compact.length > 120 ? `${compact.slice(0, 117)}…` : compact;
}

@Injectable()
export class AdminDataService {
  constructor(
    @Inject(OPS_API_CONFIG) private readonly config: OpsApiConfig,
    private readonly database: DatabaseService,
    private readonly identities: AccountIdentityService,
    private readonly commerce: CommerceService,
    private readonly audit: AdminAuditService,
  ) {}

  async health(staff: OpsAuthenticatedStaff, requestId: string): Promise<OpsHealthSummary> {
    await this.database.ping();
    const [[accountCount], [productionOrders], [pendingFeedback], [pendingPrivacy]] = await Promise.all([
      this.database.db.select({ value: count() }).from(accounts),
      this.database.db.select({ value: count() }).from(commerceOrders)
        .where(eq(commerceOrders.environment, 'production')),
      this.database.db.select({ value: count() }).from(feedbackTickets)
        .where(eq(feedbackTickets.status, 'received')),
      this.database.db.select({ value: count() }).from(accountDeletionJobs)
        .where(or(
          eq(accountDeletionJobs.status, 'pending'),
          eq(accountDeletionJobs.status, 'processing'),
          eq(accountDeletionJobs.status, 'retryable'),
        )),
    ]);
    await this.audit.record({
      requestId,
      actorStaffId: staff.id,
      actorRole: staff.role,
      action: 'ops.health.read',
      targetType: 'service_health',
      reason: '运营后台总览健康检查',
    });
    return {
      service: 'icao-ops-api',
      status: 'ok',
      database: 'ok',
      releaseId: this.config.apiReleaseId,
      counts: {
        accounts: Number(accountCount?.value ?? 0),
        productionOrders: Number(productionOrders?.value ?? 0),
        pendingFeedback: Number(pendingFeedback?.value ?? 0),
        pendingPrivacyRequests: Number(pendingPrivacy?.value ?? 0),
      },
    };
  }

  async searchUsers(
    query: string,
    reason: string,
    staff: OpsAuthenticatedStaff,
    requestId: string,
  ): Promise<OpsUserSummary[]> {
    const phone = normalizeChinaMobile(query);
    let accountIds: string[] = [];
    if (phone) {
      const accountId = await this.identities.accountIdForIdentity('phone', phone);
      accountIds = accountId ? [accountId] : [];
    } else if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(query)) {
      const [account] = await this.database.db.select({ id: accounts.id }).from(accounts)
        .where(eq(accounts.id, query)).limit(1);
      if (account) {
        accountIds = [account.id];
      } else {
        const orders = await this.database.db.select({ accountId: commerceOrders.accountId })
          .from(commerceOrders).where(eq(commerceOrders.id, query)).limit(20);
        accountIds = orders.map((order) => order.accountId);
      }
    } else {
      const orders = await this.database.db.select({ accountId: commerceOrders.accountId })
        .from(commerceOrders).where(eq(commerceOrders.externalOrderId, query)).limit(20);
      accountIds = orders.map((order) => order.accountId);
    }
    accountIds = [...new Set(accountIds)];
    const rows = accountIds.length === 0 ? [] : await this.database.db.select({
      id: accounts.id,
      status: accounts.status,
      sessionsRevokedAt: accounts.sessionsRevokedAt,
      createdAt: accounts.createdAt,
    }).from(accounts).where(inArray(accounts.id, accountIds));
    const identityRows = accountIds.length === 0 ? [] : await this.database.db.select({
      accountId: accountIdentities.accountId,
      provider: accountIdentities.provider,
      lastUsedAt: accountIdentities.lastUsedAt,
    }).from(accountIdentities).where(inArray(accountIdentities.accountId, accountIds));
    const result = rows.map((row) => {
      const matches = identityRows.filter((identity) => identity.accountId === row.id);
      const providers = [...new Set(matches.map((identity) => identity.provider))]
        .filter((provider): provider is 'phone' | 'apple' | 'wechat' => (
          provider === 'phone' || provider === 'apple' || provider === 'wechat'
        ));
      const lastIdentityUsedAt = matches.reduce<Date | undefined>(
        (latest, identity) => !latest || identity.lastUsedAt > latest ? identity.lastUsedAt : latest,
        undefined,
      );
      return {
        accountId: row.id,
        status: row.status,
        providers,
        phone: phone && accountIds.includes(row.id)
          ? maskChinaMobile(phone)
          : providers.includes('phone') ? '已绑定（号码已脱敏）' : '未绑定',
        lastIdentityUsedAt: lastIdentityUsedAt?.toISOString() ?? null,
        sessionsRevokedAt: row.sessionsRevokedAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
      };
    });
    await this.audit.record({
      requestId,
      actorStaffId: staff.id,
      actorRole: staff.role,
      action: 'ops.users.search',
      targetType: 'account_search',
      reason,
      metadata: { queryType: phone ? 'phone' : 'account_or_order', resultCount: result.length },
    });
    return result;
  }

  async accountCommerce(
    accountId: string,
    reason: string,
    staff: OpsAuthenticatedStaff,
    requestId: string,
  ): Promise<OpsAccountCommerceSummary> {
    const [entitlements, orders, pointLedger] = await Promise.all([
      this.commerce.currentEntitlement(accountId),
      this.database.db.select().from(commerceOrders)
        .where(eq(commerceOrders.accountId, accountId))
        .orderBy(desc(commerceOrders.purchasedAt)).limit(100),
      this.database.db.select({
        sequence: aiPointLedgerEntries.sequence,
        environment: aiPointLedgerEntries.environment,
        entryType: aiPointLedgerEntries.entryType,
        direction: aiPointLedgerEntries.direction,
        points: aiPointLedgerEntries.points,
        createdAt: aiPointLedgerEntries.createdAt,
      }).from(aiPointLedgerEntries)
        .where(eq(aiPointLedgerEntries.accountId, accountId))
        .orderBy(desc(aiPointLedgerEntries.sequence)).limit(100),
    ]);
    await this.audit.record({
      requestId,
      actorStaffId: staff.id,
      actorRole: staff.role,
      action: 'ops.commerce.read',
      targetType: 'account',
      targetId: accountId,
      reason,
    });
    return {
      accountId,
      entitlements,
      orders: orders.map((order) => ({
        id: order.id,
        environment: order.environment as 'sandbox' | 'production',
        channel: order.channel,
        externalOrderReference: maskedReference(order.externalOrderId),
        productKey: order.productKey,
        status: order.status,
        purchasedAt: order.purchasedAt.toISOString(),
      })),
      pointLedger: pointLedger.map((entry) => ({
        ...entry,
        environment: entry.environment as 'sandbox' | 'production',
        createdAt: entry.createdAt.toISOString(),
      })),
    };
  }

  async feedbackQueue(
    reason: string,
    staff: OpsAuthenticatedStaff,
    requestId: string,
  ): Promise<OpsFeedbackQueueItem[]> {
    const rows = await this.database.db.select().from(feedbackTickets)
      .orderBy(desc(feedbackTickets.createdAt)).limit(100);
    await this.audit.record({
      requestId,
      actorStaffId: staff.id,
      actorRole: staff.role,
      action: 'ops.feedback.read',
      targetType: 'feedback_queue',
      reason,
      metadata: { resultCount: rows.length },
    });
    return rows.map((ticket) => ({
      ticketNumber: ticket.ticketNumber,
      accountId: ticket.userId,
      category: ticket.category,
      status: ticket.status,
      summary: feedbackSummary(ticket.description),
      source: ticket.source,
      createdAt: ticket.createdAt.toISOString(),
    }));
  }

  async privacyQueue(
    reason: string,
    staff: OpsAuthenticatedStaff,
    requestId: string,
  ): Promise<OpsPrivacyRequestQueueItem[]> {
    const rows = await this.database.db.select().from(accountDeletionJobs)
      .orderBy(desc(accountDeletionJobs.requestedAt)).limit(100);
    await this.audit.record({
      requestId,
      actorStaffId: staff.id,
      actorRole: staff.role,
      action: 'ops.privacy_requests.read',
      targetType: 'privacy_request_queue',
      reason,
      metadata: { resultCount: rows.length },
    });
    return rows.map((job) => ({
      id: job.id,
      accountId: job.accountId,
      requestType: 'account_deletion',
      status: job.status,
      identityProviderOutcome: job.identityProviderOutcome,
      requestedAt: job.requestedAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
    }));
  }

  async auditEvents(reason: string, staff: OpsAuthenticatedStaff, requestId: string) {
    const rows = await this.database.db.select({
      sequence: opsAuditEvents.sequence,
      actorStaffId: opsAuditEvents.actorStaffId,
      actorRole: opsAuditEvents.actorRole,
      action: opsAuditEvents.action,
      targetType: opsAuditEvents.targetType,
      targetId: opsAuditEvents.targetId,
      reason: opsAuditEvents.reason,
      createdAt: opsAuditEvents.createdAt,
    }).from(opsAuditEvents).orderBy(desc(opsAuditEvents.sequence)).limit(200);
    await this.audit.record({
      requestId,
      actorStaffId: staff.id,
      actorRole: staff.role,
      action: 'ops.audit.read',
      targetType: 'ops_audit',
      reason,
      metadata: { resultCount: rows.length },
    });
    return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
  }
}
