import { feedbackStatusForClient } from './feedback-status';
import { BadRequestException, NotFoundException, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { FeedbackSubmissionResponse } from '@icao/contracts';
import type { VersionedFeedbackSubmissionPayload as FeedbackSubmissionPayload } from '@icao/contracts/feedback-ops';
import { and, count, desc, eq, gt, gte, isNull, lt, or, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import { DatabaseService } from '../database/database.service';
import { feedbackAttachments, feedbackReplies, feedbackTickets, questionBankReleases } from '../database/schema';
import { FeedbackAttachmentStorage } from './feedback-attachment-storage';
import type { FeedbackImage } from './feedback-image';

const RETENTION_MILLISECONDS = 365 * 24 * 60 * 60 * 1_000;
const RATE_LIMIT_WINDOW_MILLISECONDS = 60 * 60 * 1_000;
const RATE_LIMIT_MAX = 10;

type BrowserContext = {
  browserName?: string;
  browserVersion?: string;
  osName?: string;
  osVersion?: string;
};

type QuestionRelease = {
  version?: number;
  checksum?: string;
  verified: boolean;
};

function ticketNumber(id: string, createdAt: Date) {
  const date = createdAt.toISOString().slice(2, 10).replaceAll('-', '');
  return `FB-${date}-${id.replaceAll('-', '').slice(0, 8).toUpperCase()}`;
}

export function diagnosticsExpirationForSubmission(
  createdAt: Date,
  diagnostics: FeedbackSubmissionPayload['diagnostics'],
) {
  return diagnostics ? retentionAtForFeedback(createdAt) : null;
}

export function retentionAtForFeedback(createdAt: Date) {
  return new Date(createdAt.getTime() + RETENTION_MILLISECONDS);
}

export function parseUserAgent(userAgent: string | undefined): BrowserContext {
  if (!userAgent) return {};
  const browserPatterns: Array<[string, RegExp]> = [
    ['Edge', /Edg\/([\d.]+)/u],
    ['Chrome', /(?:Chrome|CriOS)\/([\d.]+)/u],
    ['Firefox', /(?:Firefox|FxiOS)\/([\d.]+)/u],
    ['Safari', /Version\/([\d.]+).*Safari/u],
  ];
  const browser = browserPatterns.map(([name, pattern]) => {
    const match = userAgent.match(pattern);
    return match ? { browserName: name, browserVersion: match[1] } : undefined;
  }).find(Boolean) ?? {};
  const os = userAgent.match(/Windows NT ([\d.]+)/u)
    ? { osName: 'Windows', osVersion: userAgent.match(/Windows NT ([\d.]+)/u)?.[1] }
    : userAgent.match(/Android ([\d.]+)/u)
      ? { osName: 'Android', osVersion: userAgent.match(/Android ([\d.]+)/u)?.[1] }
      : userAgent.match(/(?:iPhone OS|CPU OS) ([\d_]+)/u)
        ? { osName: 'iOS', osVersion: userAgent.match(/(?:iPhone OS|CPU OS) ([\d_]+)/u)?.[1]?.replaceAll('_', '.') }
        : userAgent.match(/Mac OS X ([\d_]+)/u)
          ? { osName: 'macOS', osVersion: userAgent.match(/Mac OS X ([\d_]+)/u)?.[1]?.replaceAll('_', '.') }
          : {};
  return { ...browser, ...os };
}

function questionExists(payload: unknown, input: NonNullable<FeedbackSubmissionPayload['question']>) {
  if (!payload || typeof payload !== 'object') return false;
  const categories = (payload as { categories?: unknown }).categories;
  if (!Array.isArray(categories)) return false;
  const category = categories.find((item) => item && typeof item === 'object' && (item as { id?: unknown }).id === input.categoryId);
  const topics = category && typeof category === 'object' ? (category as { topics?: unknown }).topics : undefined;
  if (!Array.isArray(topics)) return false;
  const topic = topics.find((item) => item && typeof item === 'object' && (item as { id?: unknown }).id === input.topicId);
  const cards = topic && typeof topic === 'object' ? (topic as { cards?: unknown }).cards : undefined;
  return Array.isArray(cards) && cards.some((item) => item && typeof item === 'object' && (item as { id?: unknown }).id === input.cardId);
}

@Injectable()
export class FeedbackService {
  constructor(
    private readonly database: DatabaseService,
    private readonly attachments: FeedbackAttachmentStorage,
  ) {}

  async submit(
    userId: string,
    payload: FeedbackSubmissionPayload,
    images: FeedbackImage[],
    userAgent?: string,
  ): Promise<FeedbackSubmissionResponse> {
    const existing = await this.findExisting(userId, payload.clientSubmissionId);
    if (existing) return existing;
    await this.assertWithinRateLimit(userId);

    const id = randomUUID();
    const createdAt = new Date();
    const number = ticketNumber(id, createdAt);
    const browser = payload.platform === 'web' ? parseUserAgent(userAgent) : {};
    const question = await this.resolveQuestion(payload.question);
    const stored = await this.attachments.upload(images);
    const retentionAt = retentionAtForFeedback(createdAt);

    try {
      await this.database.db.transaction(async (transaction) => {
        await transaction.insert(feedbackTickets).values({
          id,
          ticketNumber: number,
          userId,
          clientSubmissionId: payload.clientSubmissionId,
          category: payload.category,
          description: payload.description,
          contact: payload.contact ?? null,
          status: 'received',
          source: payload.source,
          sourceRoute: payload.sourceRoute,
          appDisplayVersion: payload.appDisplayVersion,
          platform: payload.platform,
          browserName: browser.browserName ?? null,
          browserVersion: browser.browserVersion ?? null,
          osName: payload.osName ?? browser.osName ?? null,
          osVersion: payload.osVersion ?? browser.osVersion ?? null,
          errorCode: payload.error?.code ?? null,
          errorRequestId: payload.error?.requestId ?? null,
          diagnostics: payload.diagnostics ?? null,
          diagnosticsExpiresAt: diagnosticsExpirationForSubmission(createdAt, payload.diagnostics),
          retentionAt,
          bankId: payload.question?.bankId ?? null,
          bankVersion: question.version ?? null,
          bankChecksum: question.checksum ?? null,
          categoryId: payload.question?.categoryId ?? null,
          topicId: payload.question?.topicId ?? null,
          cardId: payload.question?.cardId ?? null,
          questionVerified: question.verified,
          createdAt,
          updatedAt: createdAt,
        });
        if (stored.length > 0) {
          await transaction.insert(feedbackAttachments).values(stored.map((image) => ({
            ticketId: id,
            objectKey: image.objectKey,
            mimeType: image.mimeType,
            sizeBytes: image.buffer.length,
            checksum: image.checksum,
            expiresAt: retentionAt,
          })));
        }
      });
    } catch (error) {
      await this.attachments.remove(stored.map((image) => image.objectKey)).catch(() => undefined);
      const duplicate = await this.findExisting(userId, payload.clientSubmissionId);
      if (duplicate) return duplicate;
      throw error;
    }

    return { ticketNumber: number, status: 'received', createdAt: createdAt.toISOString() };
  }

  private async ownedTicket(userId: string, number: string) {
    const [ticket] = await this.database.db.select().from(feedbackTickets).where(and(
      eq(feedbackTickets.userId, userId), eq(feedbackTickets.ticketNumber, number), gt(feedbackTickets.retentionAt, new Date()),
    )).limit(1);
    if (!ticket) throw new NotFoundException('feedback_not_found');
    return ticket;
  }

  private async publicItem(ticket: typeof feedbackTickets.$inferSelect) {
    const replies = await this.database.db.select({ id: feedbackReplies.id, text: feedbackReplies.text, createdAt: feedbackReplies.createdAt })
      .from(feedbackReplies).where(eq(feedbackReplies.ticketId, ticket.id)).orderBy(feedbackReplies.createdAt, feedbackReplies.id);
    return { ticketNumber: ticket.ticketNumber, category: ticket.category, description: ticket.description,
      status: feedbackStatusForClient(ticket.status), createdAt: ticket.createdAt.toISOString(),
      unread: replies.some(reply => !ticket.repliesReadAt || reply.createdAt > ticket.repliesReadAt),
      replies: replies.map(reply => ({ ...reply, createdAt: reply.createdAt.toISOString() })) };
  }

  async list(userId: string, cursor?: string) {
    let before: { time: Date; id: string } | undefined;
    if (cursor) {
      try {
        const value = JSON.parse(Buffer.from(cursor, 'base64url').toString());
        if (!/^[a-f0-9-]{36}$/iu.test(value.id) || !Number.isFinite(Date.parse(value.time))) throw new Error();
        before = { time: new Date(value.time), id: value.id };
      } catch { throw new BadRequestException('invalid_feedback_cursor'); }
    }
    const rows = await this.database.db.select().from(feedbackTickets).where(and(
      eq(feedbackTickets.userId, userId), gt(feedbackTickets.retentionAt, new Date()),
      before ? or(lt(feedbackTickets.createdAt, before.time), and(eq(feedbackTickets.createdAt, before.time), lt(feedbackTickets.id, before.id))) : undefined,
    )).orderBy(desc(feedbackTickets.createdAt), desc(feedbackTickets.id)).limit(31);
    const items = await Promise.all(rows.slice(0, 30).map(ticket => this.publicItem(ticket)));
    const last = rows[29];
    const { unread } = await this.unread(userId);
    return { items, unread, nextCursor: rows.length > 30 && last
      ? Buffer.from(JSON.stringify({ time: last.createdAt.toISOString(), id: last.id })).toString('base64url') : null };
  }

  async unread(userId: string) {
    const unread = await this.database.db.select({ id: feedbackReplies.id }).from(feedbackReplies)
      .innerJoin(feedbackTickets, eq(feedbackReplies.ticketId, feedbackTickets.id)).where(and(
        eq(feedbackTickets.userId, userId), gt(feedbackTickets.retentionAt, new Date()),
        or(isNull(feedbackTickets.repliesReadAt), gt(feedbackReplies.createdAt, feedbackTickets.repliesReadAt)),
      )).limit(1);
    return { unread: unread.length > 0 };
  }

  async detail(userId: string, number: string) {
    const ticket = await this.ownedTicket(userId, number);
    const images = await this.database.db.select().from(feedbackAttachments).where(and(
      eq(feedbackAttachments.ticketId, ticket.id), gt(feedbackAttachments.expiresAt, new Date()), isNull(feedbackAttachments.deletedAt),
    )).orderBy(feedbackAttachments.createdAt);
    return { ...await this.publicItem(ticket), attachments: await Promise.all(images.map(async image => ({
      id: image.id, url: await this.attachments.signedUrl(image.objectKey),
    }))) };
  }

  async markRead(userId: string, number: string, replyId: string) {
    const ticket = await this.ownedTicket(userId, number);
    const [reply] = await this.database.db.select().from(feedbackReplies).where(and(
      eq(feedbackReplies.ticketId, ticket.id), eq(feedbackReplies.id, replyId),
    )).limit(1);
    if (!reply) throw new NotFoundException('feedback_reply_not_found');
    // Only acknowledge what the user actually viewed; a later reply remains unread.
    await this.database.db.update(feedbackTickets).set({ repliesReadAt: sql`greatest(${feedbackTickets.repliesReadAt}, ${reply.createdAt.toISOString()})` })
      .where(and(eq(feedbackTickets.id, ticket.id), eq(feedbackTickets.userId, userId)));
    return { read: true };
  }

  async userObjectKeys(userId: string) {
    const rows = await this.database.db.select({ objectKey: feedbackAttachments.objectKey })
      .from(feedbackAttachments)
      .innerJoin(feedbackTickets, eq(feedbackAttachments.ticketId, feedbackTickets.id))
      .where(eq(feedbackTickets.userId, userId));
    return rows.map((row) => row.objectKey);
  }

  async removeObjects(objectKeys: string[]) {
    await this.attachments.remove(objectKeys);
  }

  private async findExisting(userId: string, clientSubmissionId: string): Promise<FeedbackSubmissionResponse | undefined> {
    const [row] = await this.database.db.select({
      ticketNumber: feedbackTickets.ticketNumber,
      status: feedbackTickets.status,
      createdAt: feedbackTickets.createdAt,
    }).from(feedbackTickets).where(and(
      eq(feedbackTickets.userId, userId),
      eq(feedbackTickets.clientSubmissionId, clientSubmissionId),
    )).limit(1);
    if (!row) return undefined;
    return { ticketNumber: row.ticketNumber, status: 'received', createdAt: row.createdAt.toISOString() };
  }

  private async assertWithinRateLimit(userId: string) {
    const cutoff = new Date(Date.now() - RATE_LIMIT_WINDOW_MILLISECONDS);
    const [result] = await this.database.db.select({ value: count() }).from(feedbackTickets)
      .where(and(eq(feedbackTickets.userId, userId), gte(feedbackTickets.createdAt, cutoff)));
    if ((result?.value ?? 0) >= RATE_LIMIT_MAX) {
      throw new HttpException('feedback_rate_limited', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  private async resolveQuestion(input: FeedbackSubmissionPayload['question']): Promise<QuestionRelease> {
    if (!input) return { verified: false };
    const [release] = await this.database.db.select({
      version: questionBankReleases.version,
      checksum: questionBankReleases.checksum,
      payload: questionBankReleases.payload,
    }).from(questionBankReleases).where(and(
      eq(questionBankReleases.bankId, input.bankId),
      input.bankVersion === undefined
        ? eq(questionBankReleases.active, true)
        : eq(questionBankReleases.version, input.bankVersion),
    )).orderBy(desc(questionBankReleases.version)).limit(1);
    if (!release || (input.bankChecksum !== undefined && input.bankChecksum !== release.checksum)) {
      // Keep the submitted context for investigation, but never relabel it as the current release.
      return { verified: false, version: input.bankVersion, checksum: input.bankChecksum };
    }
    return {
      version: release.version,
      checksum: release.checksum,
      verified: questionExists(release.payload, input),
    };
  }
}
