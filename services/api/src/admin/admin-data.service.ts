import { feedbackStatusForClient, feedbackStatusForStorage, feedbackStatusStorageFilter } from '../feedback/feedback-status';
import type { OpsFeedbackListResponse, OpsFeedbackDetail } from '@icao/contracts/feedback-ops';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type {
  OpsAccountCommerceSummary,
  OpsHealthSummary,
  OpsPrivacyRequestQueueItem,
} from '@icao/contracts';
import { maskChinaMobile, normalizeChinaMobile } from '@icao/contracts';
import type { NativeOpsUserSummary as OpsUserSummary } from '@icao/contracts/native-auth';
import { and, count, desc, eq, gt, inArray, isNull, lt, or } from 'drizzle-orm';

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
  feedbackReplies,
  feedbackAttachments,
  opsAuditEvents,
  questionBankReleases,
} from '../database/schema';
import { DatabaseService } from '../database/database.service';
import { AdminAuditService } from './admin-audit.service';
import type { OpsAuthenticatedStaff } from './admin.types';
import { feedbackQuestionName } from './feedback-question-name';

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
    cursor?: string,
    limit = 30,
    status?: string,
  ): Promise<OpsFeedbackListResponse> {
    let before: { createdAt: Date; id: string } | undefined;
    if (cursor) {
      try {
        const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
        if (!value || typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt))
          || typeof value.id !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu.test(value.id)) throw new Error();
        before = { createdAt: new Date(value.createdAt), id: value.id };
      } catch { throw new BadRequestException('invalid_feedback_cursor'); }
    }
    const pageSize = Math.max(1, Math.min(50, limit));
    const rows = await this.database.db.select().from(feedbackTickets).where(and(
      gt(feedbackTickets.retentionAt, new Date()),
      status ? inArray(feedbackTickets.status, feedbackStatusStorageFilter(status)) : undefined,
      before ? or(lt(feedbackTickets.createdAt, before.createdAt), and(
        eq(feedbackTickets.createdAt, before.createdAt), lt(feedbackTickets.id, before.id),
      )) : undefined,
    )).orderBy(desc(feedbackTickets.createdAt), desc(feedbackTickets.id)).limit(pageSize + 1);
    const items = rows.slice(0, pageSize);
    await this.audit.record({
      requestId, actorStaffId: staff.id, actorRole: staff.role,
      action: 'ops.feedback.read', targetType: 'feedback_queue', reason,
      metadata: { resultCount: items.length },
    });
    const last = items.at(-1);
    return {
      items: items.map((ticket) => ({
        ticketNumber: ticket.ticketNumber, accountId: ticket.userId, category: ticket.category,
        status: feedbackStatusForClient(ticket.status), summary: feedbackSummary(ticket.description), source: ticket.source,
        createdAt: ticket.createdAt.toISOString(),
      })),
      nextCursor: rows.length > pageSize && last
        ? Buffer.from(JSON.stringify({ createdAt: last.createdAt.toISOString(), id: last.id })).toString('base64url')
        : null,
    };
  }

  async feedbackDetail(ticketNumber: string, staff: OpsAuthenticatedStaff, requestId: string): Promise<OpsFeedbackDetail> {
    const [ticket] = await this.database.db.select().from(feedbackTickets).where(and(
      eq(feedbackTickets.ticketNumber, ticketNumber), gt(feedbackTickets.retentionAt, new Date()),
    )).limit(1);
    if (!ticket) throw new NotFoundException('feedback_not_found');
    const attachments = await this.database.db.select({
      id: feedbackAttachments.id, mimeType: feedbackAttachments.mimeType, sizeBytes: feedbackAttachments.sizeBytes,
    }).from(feedbackAttachments).where(and(
      eq(feedbackAttachments.ticketId, ticket.id), gt(feedbackAttachments.expiresAt, new Date()), isNull(feedbackAttachments.deletedAt),
    )).orderBy(feedbackAttachments.createdAt, feedbackAttachments.id);
    await this.audit.record({
      requestId, actorStaffId: staff.id, actorRole: staff.role, action: 'ops.feedback.detail.read',
      targetType: 'feedback_ticket', targetId: ticket.id, reason: '查看用户提交的反馈详情',
      metadata: { attachmentCount: attachments.length },
    });
    const replies = await this.database.db.select().from(feedbackReplies).where(eq(feedbackReplies.ticketId, ticket.id))
      .orderBy(feedbackReplies.createdAt, feedbackReplies.id);
    let questionName: { displayName: string; displayNameSource: 'submitted_release' | 'current_release' } | undefined;
    if (ticket.bankId && ticket.categoryId && ticket.topicId && ticket.cardId) {
      const [release] = await this.database.db.select({ payload: questionBankReleases.payload, checksum: questionBankReleases.checksum })
        .from(questionBankReleases).where(and(
          eq(questionBankReleases.bankId, ticket.bankId),
          ticket.bankVersion == null ? eq(questionBankReleases.active, true) : eq(questionBankReleases.version, ticket.bankVersion),
        )).orderBy(desc(questionBankReleases.version)).limit(1);
      // A deleted or renamed current question must not replace the historical name.
      if (release && (!ticket.bankChecksum || ticket.bankChecksum === release.checksum)) {
        const displayName = feedbackQuestionName(release.payload, {
          categoryId: ticket.categoryId, topicId: ticket.topicId, cardId: ticket.cardId,
        });
        if (displayName) questionName = { displayName, displayNameSource: ticket.bankVersion == null ? 'current_release' : 'submitted_release' };
      }
    }
    return {
      ticketNumber: ticket.ticketNumber, accountId: ticket.userId, category: ticket.category,
      status: feedbackStatusForClient(ticket.status), source: ticket.source, summary: feedbackSummary(ticket.description),
      description: ticket.description, contact: ticket.contact, createdAt: ticket.createdAt.toISOString(),
      sourceRoute: ticket.sourceRoute, appDisplayVersion: ticket.appDisplayVersion,
      platform: ticket.platform, osName: ticket.osName, osVersion: ticket.osVersion,
      question: ticket.bankId && ticket.categoryId && ticket.topicId && ticket.cardId ? {
        bankId: ticket.bankId, categoryId: ticket.categoryId, topicId: ticket.topicId, cardId: ticket.cardId,
        bankVersion: ticket.bankVersion ?? undefined, bankChecksum: ticket.bankChecksum ?? undefined,
        verified: ticket.questionVerified,
        ...questionName,
      } : null,
      attachments,
      replies: replies.map(reply => ({ id: reply.id, text: reply.text, createdAt: reply.createdAt.toISOString() })),
    };
  }

  async replyToFeedback(number: string, input: { status: string; text?: string; clientReplyId: string }, staff: OpsAuthenticatedStaff, requestId: string) {
    await this.database.db.transaction(async tx => {
      const [ticket] = await tx.select().from(feedbackTickets).where(and(
        eq(feedbackTickets.ticketNumber, number), gt(feedbackTickets.retentionAt, new Date()),
      )).limit(1).for('update');
      if (!ticket) throw new NotFoundException('feedback_not_found');
      const [existing] = await tx.select().from(feedbackReplies).where(and(
        eq(feedbackReplies.ticketId, ticket.id), eq(feedbackReplies.clientReplyId, input.clientReplyId),
      )).limit(1);
      if (existing) return;
      const now = new Date();
      if (input.text) await tx.insert(feedbackReplies).values({ ticketId: ticket.id, clientReplyId: input.clientReplyId, text: input.text, createdAt: now });
      await tx.update(feedbackTickets).set({ status: feedbackStatusForStorage(input.status), updatedAt: now }).where(eq(feedbackTickets.id, ticket.id));
      await this.audit.record({ requestId, actorStaffId: staff.id, actorRole: staff.role,
        action: 'ops.feedback.reply', targetType: 'feedback_ticket', targetId: ticket.id,
        reason: '更新反馈处理状态及对用户回复', beforeState: { status: ticket.status }, afterState: { status: feedbackStatusForStorage(input.status) },
        metadata: { hasPublicReply: !!input.text },
      }, tx);
    });
    return this.feedbackDetail(number, staff, requestId);
  }

  async feedbackAttachment(ticketNumber: string, attachmentId: string, staff: OpsAuthenticatedStaff, requestId: string) {
    const [image] = await this.database.db.select({
      objectKey: feedbackAttachments.objectKey, mimeType: feedbackAttachments.mimeType,
      sizeBytes: feedbackAttachments.sizeBytes, checksum: feedbackAttachments.checksum,
    }).from(feedbackAttachments).innerJoin(feedbackTickets, eq(feedbackTickets.id, feedbackAttachments.ticketId))
      .where(and(eq(feedbackTickets.ticketNumber, ticketNumber), eq(feedbackAttachments.id, attachmentId),
        gt(feedbackTickets.retentionAt, new Date()), gt(feedbackAttachments.expiresAt, new Date()), isNull(feedbackAttachments.deletedAt))).limit(1);
    if (!image) throw new NotFoundException('feedback_attachment_not_found');
    await this.audit.record({
      requestId, actorStaffId: staff.id, actorRole: staff.role, action: 'ops.feedback.attachment.read',
      targetType: 'feedback_attachment', targetId: attachmentId, reason: '查看用户提交的反馈图片', metadata: {},
    });
    return image;
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
