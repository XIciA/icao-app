import { BadRequestException, ForbiddenException, HttpException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import {
  CONTENT_ACCESS_POLICY_VERSION,
  isFreeQuestionBankCard,
  type ContentAccessCredential,
  type ContentAccessScope,
  type CommerceEnvironment,
  type IssueContentCredentialRequest,
  type QuestionBankAccessSummary,
  type QuestionBankContentAccess,
} from '@icao/contracts';
import { and, count, desc, eq, gt, gte, lte } from 'drizzle-orm';
import { createHash, createHmac, randomUUID } from 'node:crypto';

import { API_CONFIG, type ApiConfig } from '../config';
import { DatabaseService } from '../database/database.service';
import {
  contentAccessCredentials,
  contentEnvironmentSessionGrants,
  membershipEntitlementSegments,
  questionBankReleases,
} from '../database/schema';

type ContentCard = Record<string, unknown> & { id: string };
type ContentTopic = Record<string, unknown> & {
  id: string;
  declaredCardCount?: number;
  cards: ContentCard[];
};
type ContentCategory = Record<string, unknown> & { id: string; topics: ContentTopic[] };
type ContentDataset = Record<string, unknown> & { id: string; categories: ContentCategory[] };

type ActiveRelease = {
  bankId: string;
  version: number;
  checksum: string;
  dataset: ContentDataset;
};

type MembershipAccess = {
  active: boolean;
  expiresAt: Date | null;
  segmentId: string | null;
  environment: CommerceEnvironment | null;
};

function isContentCard(value: unknown): value is ContentCard {
  return Boolean(value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string');
}

function isContentTopic(value: unknown): value is ContentTopic {
  const topic = value as { id?: unknown; cards?: unknown };
  return Boolean(value && typeof value === 'object' && typeof topic.id === 'string' && Array.isArray(topic.cards) && topic.cards.every(isContentCard));
}

function isContentCategory(value: unknown): value is ContentCategory {
  const category = value as { id?: unknown; topics?: unknown };
  return Boolean(value && typeof value === 'object' && typeof category.id === 'string' && Array.isArray(category.topics) && category.topics.every(isContentTopic));
}

function isContentDataset(value: unknown): value is ContentDataset {
  const dataset = value as { id?: unknown; categories?: unknown };
  return Boolean(value && typeof value === 'object' && typeof dataset.id === 'string' && Array.isArray(dataset.categories) && dataset.categories.every(isContentCategory));
}

function topicAccess(topic: ContentTopic, availableCardCount: number, freeCardCount: number): QuestionBankContentAccess {
  const declaredCardCount = typeof topic.declaredCardCount === 'number' ? topic.declaredCardCount : topic.cards.length;
  return {
    level: freeCardCount >= declaredCardCount ? 'free' : 'member',
    availableCardCount,
    declaredCardCount,
  };
}

function filterTopic(bankId: string, topic: ContentTopic, membershipActive: boolean) {
  const freeCards = topic.cards.filter((card) => isFreeQuestionBankCard(bankId, topic.id, card.id));
  const cards = membershipActive ? topic.cards : freeCards;
  return {
    ...topic,
    cards,
    access: topicAccess(topic, cards.length, freeCards.length),
  };
}

function catalogTopic(bankId: string, topic: ContentTopic) {
  const freeCards = topic.cards.filter((card) => isFreeQuestionBankCard(bankId, topic.id, card.id));
  return {
    ...topic,
    cards: freeCards,
    access: topicAccess(topic, freeCards.length, freeCards.length),
  };
}

@Injectable()
export class ContentAccessService {
  constructor(
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    private readonly database: DatabaseService,
  ) {}

  async getCatalog(
    bankId: string,
    accountId: string,
    sessionId: string,
    environment: CommerceEnvironment,
    now = new Date(),
  ) {
    await this.assertEnvironmentAuthorized(accountId, sessionId, environment, now);
    const [release, membership] = await Promise.all([
      this.activeRelease(bankId),
      this.membership(accountId, environment, now),
    ]);
    return {
      ...release,
      dataset: {
        ...release.dataset,
        categories: release.dataset.categories.map((category) => ({
          ...category,
          topics: category.topics.map((topic) => catalogTopic(bankId, topic)),
        })),
        access: this.accessSummary(membership),
      },
    };
  }

  async getTopic(
    bankId: string,
    categoryId: string,
    topicId: string,
    accountId: string,
    sessionId: string,
    environment: CommerceEnvironment,
    now = new Date(),
  ) {
    await this.assertEnvironmentAuthorized(accountId, sessionId, environment, now);
    const [release, membership] = await Promise.all([
      this.activeRelease(bankId),
      this.membership(accountId, environment, now),
    ]);
    const category = release.dataset.categories.find((candidate) => candidate.id === categoryId);
    const topic = category?.topics.find((candidate) => candidate.id === topicId);
    if (!category || !topic) throw new NotFoundException('question_bank_topic_not_found');
    const filtered = filterTopic(bankId, topic, membership.active);
    if (filtered.cards.length === 0) throw new ForbiddenException('membership_required');
    return {
      bankId: release.bankId,
      version: release.version,
      checksum: release.checksum,
      categoryId,
      topic: filtered,
      access: this.accessSummary(membership),
    };
  }

  async assertResourceAccess(
    accountId: string,
    bankId: string,
    publicPath: string,
    sessionId: string,
    environment: CommerceEnvironment,
    now = new Date(),
  ) {
    await this.assertEnvironmentAuthorized(accountId, sessionId, environment, now);
    const membership = await this.membership(accountId, environment, now);
    if (membership.active) return;
    const release = await this.activeRelease(bankId);
    for (const category of release.dataset.categories) {
      for (const topic of category.topics) {
        for (const card of topic.cards) {
          if (isFreeQuestionBankCard(bankId, topic.id, card.id) && this.cardUsesResource(card, publicPath)) return;
        }
      }
    }
    throw new ForbiddenException('membership_required');
  }

  async issueCredential(
    accountId: string,
    input: IssueContentCredentialRequest,
    sessionId: string,
    environment: CommerceEnvironment,
    now = new Date(),
  ): Promise<ContentAccessCredential> {
    const signingSecret = this.config.contentCredentialSigningSecret;
    const signingPrivateKey = this.config.contentCredentialSigningPrivateKey;
    if (!signingSecret || !signingPrivateKey) throw new ServiceUnavailableException('content_credentials_unavailable');
    await this.assertEnvironmentAuthorized(accountId, sessionId, environment, now);
    const scopes = this.validateScopes(input);
    const membership = await this.membership(accountId, environment, now);
    if (!membership.active || !membership.expiresAt || !membership.segmentId || !membership.environment) {
      throw new ForbiddenException('membership_required');
    }
    await Promise.all(scopes.map((scope) => this.assertScopeExists(scope)));
    const expiresAt = new Date(Math.min(membership.expiresAt.getTime(), now.getTime() + 72 * 60 * 60 * 1_000));
    const credentialId = randomUUID();
    const { importPKCS8, SignJWT } = await import('jose');
    await this.assertCredentialRateLimit(accountId, now);
    const token = await new SignJWT({
      entitlementSegmentId: membership.segmentId,
      environment: membership.environment,
      policyVersion: CONTENT_ACCESS_POLICY_VERSION,
      scopes,
    })
      .setProtectedHeader({ alg: 'EdDSA', typ: 'JWT' })
      .setIssuer('icao-api')
      .setAudience('icao-content-offline')
      .setSubject(accountId)
      .setJti(credentialId)
      .setIssuedAt(Math.floor(now.getTime() / 1_000))
      .setExpirationTime(Math.floor(expiresAt.getTime() / 1_000))
      .sign(await importPKCS8(signingPrivateKey, 'EdDSA'));
    await this.database.db.insert(contentAccessCredentials).values({
      id: credentialId,
      environment: membership.environment,
      accountId,
      entitlementSegmentId: membership.segmentId,
      scopes,
      policyVersion: CONTENT_ACCESS_POLICY_VERSION,
      credentialDigest: createHash('sha256').update(token).digest('hex'),
      issuedAt: now,
      expiresAt,
      retentionAt: new Date(expiresAt.getTime() + 180 * 24 * 60 * 60 * 1_000),
    });
    return {
      token,
      issuedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      policyVersion: CONTENT_ACCESS_POLICY_VERSION,
      environment: membership.environment,
      scopes,
    };
  }

  private async membership(
    accountId: string,
    environment: CommerceEnvironment,
    now: Date,
  ): Promise<MembershipAccess> {
    const [segment] = await this.database.db.select({
      endsAt: membershipEntitlementSegments.endsAt,
      environment: membershipEntitlementSegments.environment,
      id: membershipEntitlementSegments.id,
    })
      .from(membershipEntitlementSegments)
      .where(and(
        eq(membershipEntitlementSegments.environment, environment),
        eq(membershipEntitlementSegments.accountId, accountId),
        eq(membershipEntitlementSegments.status, 'active'),
        lte(membershipEntitlementSegments.startsAt, now),
        gt(membershipEntitlementSegments.endsAt, now),
      ))
      .orderBy(desc(membershipEntitlementSegments.endsAt))
      .limit(1);
    return segment
      ? {
        active: true,
        expiresAt: segment.endsAt,
        segmentId: segment.id,
        environment: segment.environment as CommerceEnvironment,
      }
      : { active: false, expiresAt: null, segmentId: null, environment: null };
  }

  private async assertCredentialRateLimit(accountId: string, now: Date) {
    const windowStart = new Date(now.getTime() - 15 * 60 * 1_000);
    const [accountWindow] = await this.database.db.select({ total: count() }).from(contentAccessCredentials).where(and(
      eq(contentAccessCredentials.accountId, accountId),
      gte(contentAccessCredentials.issuedAt, windowStart),
    )).limit(1);
    if (Number(accountWindow?.total ?? 0) >= 240) {
      throw new HttpException('content_credential_rate_limited', 429);
    }
  }

  private async assertEnvironmentAuthorized(
    accountId: string,
    sessionId: string,
    environment: CommerceEnvironment,
    now: Date,
  ) {
    if (environment === 'production') return;
    const signingSecret = this.config.contentCredentialSigningSecret;
    if (!signingSecret) throw new ServiceUnavailableException('content_credentials_unavailable');
    const sessionDigest = createHmac('sha256', signingSecret)
      .update(`content-session-v1\0${sessionId}`)
      .digest('hex');
    const [grant] = await this.database.db.select({ id: contentEnvironmentSessionGrants.id })
      .from(contentEnvironmentSessionGrants)
      .where(and(
        eq(contentEnvironmentSessionGrants.environment, 'sandbox'),
        eq(contentEnvironmentSessionGrants.accountId, accountId),
        eq(contentEnvironmentSessionGrants.sessionDigest, sessionDigest),
        gt(contentEnvironmentSessionGrants.expiresAt, now),
      ))
      .limit(1);
    if (!grant) throw new ForbiddenException('sandbox_environment_not_authorized');
  }

  private async activeRelease(bankId: string): Promise<ActiveRelease> {
    const [row] = await this.database.db.select().from(questionBankReleases)
      .where(and(eq(questionBankReleases.bankId, bankId), eq(questionBankReleases.active, true)))
      .orderBy(desc(questionBankReleases.version))
      .limit(1);
    if (!row || !isContentDataset(row.payload) || row.payload.id !== bankId) {
      throw new NotFoundException('question_bank_not_found');
    }
    return { bankId: row.bankId, version: row.version, checksum: row.checksum, dataset: row.payload };
  }

  private accessSummary(membership: MembershipAccess): QuestionBankAccessSummary {
    return {
      policyVersion: CONTENT_ACCESS_POLICY_VERSION,
      environment: membership.environment,
      membershipActive: membership.active,
      membershipExpiresAt: membership.expiresAt?.toISOString() ?? null,
    };
  }

  private validateScopes(input: IssueContentCredentialRequest): ContentAccessScope[] {
    if (!input || !Array.isArray(input.scopes)) {
      throw new BadRequestException('invalid_content_credential_request');
    }
    const scopes = input.scopes.filter((scope): scope is ContentAccessScope => Boolean(
      scope
      && typeof scope.bankId === 'string'
      && typeof scope.categoryId === 'string'
      && typeof scope.topicId === 'string'
      && /^[A-Za-z0-9_-]{1,96}$/u.test(scope.bankId)
      && /^[A-Za-z0-9_-]{1,128}$/u.test(scope.categoryId)
      && /^[A-Za-z0-9_-]{1,128}$/u.test(scope.topicId),
    ));
    const unique = [...new Map(scopes.map((scope) => [`${scope.bankId}/${scope.categoryId}/${scope.topicId}`, scope])).values()];
    if (unique.length === 0 || unique.length !== input.scopes.length || unique.length > 24) {
      throw new BadRequestException('invalid_content_credential_request');
    }
    return unique;
  }

  private async assertScopeExists(scope: ContentAccessScope) {
    const release = await this.activeRelease(scope.bankId);
    const topic = release.dataset.categories
      .find((category) => category.id === scope.categoryId)
      ?.topics.find((candidate) => candidate.id === scope.topicId);
    if (!topic) throw new BadRequestException('invalid_content_scope');
  }

  private cardUsesResource(card: ContentCard, publicPath: string) {
    return card.audio === publicPath || card.image === publicPath;
  }
}
