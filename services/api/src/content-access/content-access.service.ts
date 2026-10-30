import { VersionedReadCache } from '../content/versioned-read-cache';
import { timed, timedSync } from '../performance/request-performance';
import type { AppContentHotspotBrief, AppContentHotspotOverview } from '@icao/contracts/app-content';
import { BadRequestException, ForbiddenException, HttpException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import {
  CONTENT_ACCESS_POLICY_VERSION,
  freeQuestionBankCardIds,
  studyScopeCardIds,
  offlineScopeValid, offlineTopicCards, type OfflineManifest, type OfflineDownloadScope,
  questionBankRadioEntries,
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
  resourceObjects,
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

type PreparedBank = {
  release: ActiveRelease;
  catalogCategories: Array<Record<string, unknown> & { id: string; topics: ReturnType<typeof catalogTopic>[] }>;
  freeIds: string[];
  freeResourcePaths: string[];
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

function topicAccess(topic: ContentTopic, availableCardCount: number, freeCards: ContentCard[]): QuestionBankContentAccess {
  const declaredCardCount = typeof topic.declaredCardCount === 'number' ? topic.declaredCardCount : topic.cards.length;
  return {
    freeCardIds: freeCards.map(card => card.id),
    level: freeCards.length >= declaredCardCount ? 'free' : 'member',
    availableCardCount,
    declaredCardCount,
  };
}

function activeTopic(topic: ContentTopic): ContentTopic {
  const cards = topic.cards.filter(card => card.retired !== true);
  return cards.length === topic.cards.length ? topic : { ...topic, cards, declaredCardCount: cards.length };
}

function filterTopic(bankId: string, freeIds: Set<string>, topic: ContentTopic, membershipActive: boolean) {
  topic = activeTopic(topic);
  const freeCards = topic.cards.filter((card) => freeIds.has(card.id));
  const cards = membershipActive ? topic.cards : freeCards;
  return {
    ...topic,
    scopeCardIds: studyScopeCardIds(bankId, topic),
    radioEntries: questionBankRadioEntries(topic),
    cards,
    access: topicAccess(topic, cards.length, freeCards),
  };
}

function catalogTopic(bankId: string, freeIds: Set<string>, topic: ContentTopic) {
  topic = activeTopic(topic);
  const freeCards = topic.cards.filter((card) => freeIds.has(card.id));
  return {
    ...topic,
    scopeCardIds: studyScopeCardIds(bankId, topic),
    radioEntries: questionBankRadioEntries(topic),
    cards: freeCards,
    access: topicAccess(topic, freeCards.length, freeCards),
  };
}

@Injectable()
export class ContentAccessService {
  private readonly releases = new VersionedReadCache<PreparedBank>({ maxBytes: 64 * 1024 * 1024 });
  private readonly indexes = new WeakMap<ActiveRelease, { freeIds: Set<string>; resources: Set<string>; topics: Map<string, ContentTopic> }>();

  private index(prepared: PreparedBank) {
    const hit = this.indexes.get(prepared.release);
    if (hit) return hit;
    const topics = new Map<string, ContentTopic>();
    const categories = new Set<string>();
    for (const category of prepared.release.dataset.categories) {
      // Match the original find() behavior even for malformed duplicate IDs.
      if (categories.has(category.id)) continue;
      categories.add(category.id);
      for (const topic of category.topics) {
        const key = JSON.stringify([category.id, topic.id]);
        if (!topics.has(key)) topics.set(key, topic);
      }
    }
    const index = { freeIds: new Set(prepared.freeIds), resources: new Set(prepared.freeResourcePaths), topics };
    this.indexes.set(prepared.release, index);
    return index;
  }
  constructor(
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    private readonly database: DatabaseService,
  ) {}

  async offlineManifest(bankId: string, scope: OfflineDownloadScope, accountId: string | undefined,
    sessionId: string | undefined, environment: CommerceEnvironment): Promise<OfflineManifest> {
    if (!offlineScopeValid(bankId, scope)) throw new BadRequestException('invalid_download_scope');
    await this.assertEnvironmentAuthorized(accountId, sessionId, environment, new Date());
    const release = await this.activeRelease(bankId);
    const topics: OfflineManifest['topics'] = [];
    const paths = new Set<string>();
    for (const category of release.dataset.categories) {
      for (const topic of category.topics) {
        const cards = offlineTopicCards(bankId, String(category.name), topic, scope);
        if (!cards.length) continue;
        const encoded = JSON.stringify(cards);
        topics.push({ bankId, categoryId: category.id, topicId: topic.id, cardIds: cards.map(card => card.id),
          cardChecksums: Object.fromEntries(cards.map(card => [card.id, createHash('sha256').update(JSON.stringify(card)).digest('hex')])),
          cardResources: Object.fromEntries(cards.map(card => [card.id, [card.audio, card.image].filter((path): path is string => typeof path === 'string')])),
          metadataChecksum: createHash('sha256').update(JSON.stringify({ name: topic.name, nameEn: topic.nameEn, practiceKind: topic.practiceKind })).digest('hex'),
          checksum: createHash('sha256').update(encoded).digest('hex'), sizeBytes: Buffer.byteLength(JSON.stringify({ ...topic, cards, declaredCardCount: cards.length, scopeCardIds: undefined, radioEntries: undefined })) });
        for (const card of cards) for (const field of ['audio', 'image']) {
          const path = card[field];
          if (typeof path === 'string' && path.startsWith('/question-bank-assets/')) paths.add(path);
        }
      }
    }
    const rows = await this.database.db.select().from(resourceObjects)
      .where(and(eq(resourceObjects.module, bankId), eq(resourceObjects.status, 'ready'))).orderBy(desc(resourceObjects.createdAt));
    const byPath = new Map<string, typeof rows[number]>();
    for (const row of rows) if (!byPath.has(row.sourcePath)) byPath.set(row.sourcePath, row);
    const resources = [...paths].sort().map(publicPath => {
      const row = byPath.get(publicPath);
      if (!row) throw new ServiceUnavailableException('download_resource_unavailable');
      return { publicPath, checksum: row.checksum, sizeBytes: row.sizeBytes };
    });
    return { bankId, scope, version: release.version, checksum: release.checksum, topics, resources,
      sizeBytes: topics.reduce((sum, topic) => sum + topic.sizeBytes, 0) + resources.reduce((sum, resource) => sum + resource.sizeBytes, 0),
      fingerprint: createHash('sha256').update(JSON.stringify({ topics, resources })).digest('hex') };
  }

  async getCatalog(
    bankId: string,
    accountId: string | undefined,
    sessionId: string | undefined,
    environment: CommerceEnvironment,
    now = new Date(),
  ) {
    await this.assertEnvironmentAuthorized(accountId, sessionId, environment, now);
    const [prepared, membership] = await Promise.all([
      this.preparedRelease(bankId),
      timed('content.membership', () => this.membership(accountId, environment, now)),
    ]);
    return {
      ...prepared.release,
      dataset: { ...prepared.release.dataset, categories: prepared.catalogCategories, access: this.accessSummary(membership) },
    };
  }

  async getTopic(
    bankId: string,
    categoryId: string,
    topicId: string,
    accountId: string | undefined,
    sessionId: string | undefined,
    environment: CommerceEnvironment,
    now = new Date(),
    expected?: { version: number; checksum?: string },
  ) {
    await this.assertEnvironmentAuthorized(accountId, sessionId, environment, now);
    const [prepared, membership] = await Promise.all([
      this.preparedRelease(bankId, expected),
      timed('content.membership', () => this.membership(accountId, environment, now)),
    ]);
    const release = prepared.release;
    const index = this.index(prepared);
    const topic = index.topics.get(JSON.stringify([categoryId, topicId]));
    if (!topic) throw new NotFoundException('question_bank_topic_not_found');
    const filtered = timedSync('content.topic', () => filterTopic(bankId, index.freeIds, topic, membership.active));
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
    accountId: string | undefined,
    bankId: string,
    publicPath: string,
    sessionId: string | undefined,
    environment: CommerceEnvironment,
    now = new Date(),
  ) {
    await this.assertEnvironmentAuthorized(accountId, sessionId, environment, now);
    const membership = await this.membership(accountId, environment, now);
    if (membership.active) return;
    try {
      const prepared = await this.preparedRelease(bankId);
      if (this.index(prepared).resources.has(publicPath)) return;
    } catch (error) {
      // The old resource path denies access when the active bank is absent/invalid.
      // Operational DB failures must still propagate instead of becoming permission failures.
      if (!(error instanceof NotFoundException)) throw error;
    }
    throw new ForbiddenException('membership_required');
  }

  async hotspotOverview(brief: AppContentHotspotBrief): Promise<AppContentHotspotOverview> {
    const release = await this.activeRelease('opi');
    const available = new Map(release.dataset.categories.flatMap(category => category.topics.map(topic => [topic.id, topic] as const)));
    return { brief, topics: brief.topics.map(reference => {
      const topic = available.get(reference.topicId);
      const cards = new Map(topic?.cards.filter(card => card.retired !== true).map(card => [card.id, card]));
      return { topicId: reference.topicId, topicTitle: reference.topicTitle, cards: reference.cardIds.map(id => {
        const card = cards.get(id);
        if (!card || typeof card.audioText !== 'string') throw new NotFoundException('hotspot_question_unavailable');
        // Allowlist every field: the full card also contains protected answers and audio.
        const reportedPrompts = card.reportedPrompts && typeof card.reportedPrompts === 'object'
          ? Object.fromEntries(Object.entries(card.reportedPrompts).filter((entry): entry is [string, string[]] =>
            Array.isArray(entry[1]) && entry[1].every(value => typeof value === 'string')))
          : undefined;
        return { id, prompt: card.audioText, ...(reportedPrompts ? { reportedPrompts } : {}) };
      }) };
    }) };
  }

  async assertMembership(accountId: string, sessionId: string, environment: CommerceEnvironment) {
    await this.assertEnvironmentAuthorized(accountId, sessionId, environment, new Date());
    if (!(await this.membership(accountId, environment, new Date())).active) throw new ForbiddenException('membership_required');
  }

  async issueCredential(
    accountId: string,
    input: IssueContentCredentialRequest,
    sessionId: string | undefined,
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
    accountId: string | undefined,
    environment: CommerceEnvironment,
    now: Date,
  ): Promise<MembershipAccess> {
    if (!accountId) return { active: false, expiresAt: null, segmentId: null, environment: null };
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

  async assertEnvironmentAuthorized(
    accountId: string | undefined,
    sessionId: string | undefined,
    environment: CommerceEnvironment,
    now: Date,
  ) {
    if (!accountId || !sessionId) {
      if (environment !== 'production') throw new ForbiddenException('sandbox_environment_not_authorized');
      return;
    }
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

  private async activeRelease(bankId: string, expected?: { version: number; checksum?: string }): Promise<ActiveRelease> {
    return (await this.preparedRelease(bankId, expected)).release;
  }

  private async preparedRelease(bankId: string, expected?: { version: number; checksum?: string }): Promise<PreparedBank> {
    const [metadata] = await timed('content.metadata', () => this.database.db.select({
      bankId: questionBankReleases.bankId, version: questionBankReleases.version, checksum: questionBankReleases.checksum,
    }).from(questionBankReleases)
      .where(and(eq(questionBankReleases.bankId, bankId), expected ? eq(questionBankReleases.version, expected.version) : eq(questionBankReleases.active, true)))
      .orderBy(desc(questionBankReleases.version)).limit(1));
    if (!metadata) throw new NotFoundException('question_bank_not_found');
    if (expected?.checksum && metadata.checksum !== expected.checksum) throw new BadRequestException('content_release_mismatch');
    return this.releases.get(JSON.stringify([bankId, metadata.version, metadata.checksum]), async () => {
      const [row] = await timed('content.payload', () => this.database.db.select().from(questionBankReleases)
        .where(and(eq(questionBankReleases.bankId, bankId), eq(questionBankReleases.version, metadata.version), eq(questionBankReleases.checksum, metadata.checksum)))
        .orderBy(desc(questionBankReleases.version)).limit(1));
      if (!row || !isContentDataset(row.payload) || row.payload.id !== bankId) throw new NotFoundException('question_bank_not_found');
      return timedSync('content.prepare', () => {
        const release = { bankId: row.bankId, version: row.version, checksum: row.checksum, dataset: row.payload as ContentDataset };
        const freeIds = freeQuestionBankCardIds(release.dataset);
        const paths = new Set<string>();
        for (const category of release.dataset.categories) for (const topic of category.topics) for (const card of topic.cards) {
          if (freeIds.has(card.id)) for (const field of ['audio', 'image']) if (typeof card[field] === 'string') paths.add(card[field]);
        }
        return { release, freeIds: [...freeIds], freeResourcePaths: [...paths],
          catalogCategories: release.dataset.categories.map(category => ({ ...category,
            topics: category.topics.map(topic => catalogTopic(bankId, freeIds, topic)) })),
        };
      });
    });
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
      && /^[A-Za-z0-9_-]{1,128}$/u.test(scope.topicId)
      && ((scope as ContentAccessScope & { version?: number }).version === undefined
        || (Number.isSafeInteger((scope as ContentAccessScope & { version?: number }).version) && Number((scope as ContentAccessScope & { version?: number }).version) > 0)),
    ));
    const unique = [...new Map(scopes.map((scope) => [`${scope.bankId}/${scope.categoryId}/${scope.topicId}`, scope])).values()];
    if (unique.length === 0 || unique.length !== input.scopes.length || unique.length > 24) {
      throw new BadRequestException('invalid_content_credential_request');
    }
    return unique;
  }

  private async assertScopeExists(scope: ContentAccessScope) {
    const version = (scope as ContentAccessScope & { version?: number }).version;
    const release = await this.activeRelease(scope.bankId, version ? { version } : undefined);
    const topic = release.dataset.categories
      .find((category) => category.id === scope.categoryId)
      ?.topics.find((candidate) => candidate.id === scope.topicId);
    if (!topic) throw new BadRequestException('invalid_content_scope');
  }

}
