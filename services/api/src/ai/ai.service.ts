import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { BadRequestException, HttpException, Injectable, Logger } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { CURRENT_AI_CONSENT_FLOW_REVISION, CURRENT_AI_CONSENT_POLICY_VERSION, type AiConsent, type AiConsentChallenge, type AiConsentRequest, type AiConsentStatus, type AiReviewRequest, type AiReviewResult, type GrammarReviewRequest, type PolishRequest, type PolishResult, type TencentAsrModel } from '@icao/contracts';

import { DatabaseService } from '../database/database.service';
import { aiConsentAuthorities, aiConsentChallenges, aiConsents, aiUsageLogs } from '../database/schema';
import { DeepSeekReviewProviderService } from './deepseek-review-provider.service';
import { TencentAsrService } from './tencent-asr.service';
import { reviewSystemPrompt, REVIEW_PROMPT_VERSION } from './deepseek-review-prompts';
import { legacyIssueText, parseAndValidateReview, withReviewPromptVersion } from './review-harness';
import { aiFailureObservation } from './ai-error-observability';
import type { ProviderMeta } from './provider-meta';

type UsageCapability = 'transcribe' | 'grammar_review' | 'polish';
type AiProviderName = 'deepseek' | 'tencent-asr';
const CONSENT_CHALLENGE_TTL_MS = 5 * 60 * 1000;
const OPERATION_GRANT_TTL_MS = 2 * 60 * 1000;

export type AiOperationGrant = {
  userId: string;
  policyVersion: typeof CURRENT_AI_CONSENT_POLICY_VERSION;
  consentRevision: number;
  nonce: string;
  expiresAt: number;
};

function safeLogToken(value: string) {
  return value.replace(/[^A-Za-z0-9._:-]/gu, '_').slice(0, 120) || 'unknown';
}

function consentLockId(userId: string) {
  return `ai-consent:${userId}`;
}

function challengeDigest(challenge: string) {
  return createHash('sha256').update(challenge).digest('hex');
}

function isCurrentConsent(
  consent: { policyVersion: string; revision: number; revokedAt: Date | null } | undefined,
  authority: { active: boolean; policyVersion: string; revision: number } | undefined,
) {
  return Boolean(
    consent?.policyVersion === CURRENT_AI_CONSENT_POLICY_VERSION
    && consent.revokedAt === null
    && authority?.active
    && authority.policyVersion === CURRENT_AI_CONSENT_POLICY_VERSION
    && authority.revision === consent.revision,
  );
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly reviewProvider: DeepSeekReviewProviderService,
    private readonly asr: TencentAsrService,
  ) {}

  async consentStatus(userId: string): Promise<AiConsentStatus> {
    return this.database.db.transaction(async (transaction) => {
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${consentLockId(userId)}, 0))`);
      const [consent] = await transaction.select().from(aiConsents).where(eq(aiConsents.userId, userId)).limit(1);
      const [authority] = await transaction.select().from(aiConsentAuthorities)
        .where(eq(aiConsentAuthorities.userId, userId)).limit(1);
      if (!isCurrentConsent(consent, authority)) {
        return { accepted: false, policyVersion: CURRENT_AI_CONSENT_POLICY_VERSION };
      }
      return {
        accepted: true,
        policyVersion: CURRENT_AI_CONSENT_POLICY_VERSION,
        acceptedAt: consent!.acceptedAt.toISOString(),
      };
    });
  }

  async issueConsentChallenge(userId: string): Promise<AiConsentChallenge> {
    return this.database.db.transaction(async (transaction) => {
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${consentLockId(userId)}, 0))`);
      const [authority] = await transaction.select().from(aiConsentAuthorities)
        .where(eq(aiConsentAuthorities.userId, userId)).limit(1);
      const [consent] = await transaction.select().from(aiConsents).where(eq(aiConsents.userId, userId)).limit(1);
      const challenge = randomBytes(32).toString('base64url');
      const expiresAt = new Date(Date.now() + CONSENT_CHALLENGE_TTL_MS);
      await transaction.delete(aiConsentChallenges).where(eq(aiConsentChallenges.userId, userId));
      await transaction.insert(aiConsentChallenges).values({
        userId,
        policyVersion: CURRENT_AI_CONSENT_POLICY_VERSION,
        flowRevision: CURRENT_AI_CONSENT_FLOW_REVISION,
        tokenHash: challengeDigest(challenge),
        consentRevision: authority?.revision ?? consent?.revision ?? 0,
        expiresAt,
      });
      return {
        policyVersion: CURRENT_AI_CONSENT_POLICY_VERSION,
        flowRevision: CURRENT_AI_CONSENT_FLOW_REVISION,
        challenge,
        expiresAt: expiresAt.toISOString(),
      };
    });
  }

  async acceptConsent(userId: string, input: AiConsentRequest): Promise<AiConsent> {
    return this.database.db.transaction(async (transaction) => {
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${consentLockId(userId)}, 0))`);
      const [authority] = await transaction.select().from(aiConsentAuthorities)
        .where(eq(aiConsentAuthorities.userId, userId)).limit(1);
      const [consent] = await transaction.select().from(aiConsents).where(eq(aiConsents.userId, userId)).limit(1);
      const currentRevision = authority?.revision ?? consent?.revision ?? 0;
      const currentlyAccepted = isCurrentConsent(consent, authority);
      const explicitAttempt = input.flowRevision !== undefined || input.challenge !== undefined;
      if (!explicitAttempt && currentlyAccepted) {
        return {
          policyVersion: CURRENT_AI_CONSENT_POLICY_VERSION,
          acceptedAt: consent!.acceptedAt.toISOString(),
        };
      }
      if (input.flowRevision !== CURRENT_AI_CONSENT_FLOW_REVISION || !input.challenge) {
        throw new HttpException('ai_consent_challenge_required', 428);
      }
      const [challenge] = await transaction.select().from(aiConsentChallenges).where(and(
        eq(aiConsentChallenges.userId, userId),
        eq(aiConsentChallenges.tokenHash, challengeDigest(input.challenge)),
      )).limit(1);
      if (
        !challenge
        || challenge.policyVersion !== CURRENT_AI_CONSENT_POLICY_VERSION
        || challenge.flowRevision !== CURRENT_AI_CONSENT_FLOW_REVISION
        || challenge.consentRevision !== currentRevision
        || challenge.expiresAt.getTime() <= Date.now()
      ) {
        throw new HttpException('ai_consent_challenge_required', 428);
      }
      await transaction.delete(aiConsentChallenges).where(and(
        eq(aiConsentChallenges.userId, userId),
        eq(aiConsentChallenges.tokenHash, challengeDigest(input.challenge)),
      ));
      if (currentlyAccepted) {
        return {
          policyVersion: CURRENT_AI_CONSENT_POLICY_VERSION,
          acceptedAt: consent!.acceptedAt.toISOString(),
        };
      }
      const now = new Date();
      const nextRevision = currentRevision + 1;
      await transaction.insert(aiConsentAuthorities).values({
        userId,
        policyVersion: CURRENT_AI_CONSENT_POLICY_VERSION,
        revision: nextRevision,
        active: true,
        updatedAt: now,
      }).onConflictDoUpdate({
        target: aiConsentAuthorities.userId,
        set: {
          policyVersion: CURRENT_AI_CONSENT_POLICY_VERSION,
          revision: nextRevision,
          active: true,
          updatedAt: now,
        },
      });
      await transaction.insert(aiConsents).values({
        userId,
        policyVersion: CURRENT_AI_CONSENT_POLICY_VERSION,
        acceptedAt: now,
        revision: nextRevision,
        revokedAt: null,
        updatedAt: now,
      }).onConflictDoUpdate({
        target: aiConsents.userId,
        set: {
          policyVersion: CURRENT_AI_CONSENT_POLICY_VERSION,
          acceptedAt: now,
          revision: nextRevision,
          revokedAt: null,
          updatedAt: now,
        },
      });
      return { policyVersion: CURRENT_AI_CONSENT_POLICY_VERSION, acceptedAt: now.toISOString() };
    });
  }

  async revokeConsent(userId: string) {
    return this.database.db.transaction(async (transaction) => {
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${consentLockId(userId)}, 0))`);
      const [authority] = await transaction.select().from(aiConsentAuthorities)
        .where(eq(aiConsentAuthorities.userId, userId)).limit(1);
      const [consent] = await transaction.select().from(aiConsents).where(eq(aiConsents.userId, userId)).limit(1);
      await transaction.delete(aiConsentChallenges).where(eq(aiConsentChallenges.userId, userId));
      const now = new Date();
      const currentRevision = authority?.revision ?? consent?.revision ?? 0;
      const nextRevision = authority?.active || consent ? currentRevision + 1 : currentRevision;
      await transaction.insert(aiConsentAuthorities).values({
        userId,
        policyVersion: CURRENT_AI_CONSENT_POLICY_VERSION,
        revision: nextRevision,
        active: false,
        updatedAt: now,
      }).onConflictDoUpdate({
        target: aiConsentAuthorities.userId,
        set: {
          policyVersion: CURRENT_AI_CONSENT_POLICY_VERSION,
          revision: nextRevision,
          active: false,
          updatedAt: now,
        },
      });
      await transaction.delete(aiConsents).where(eq(aiConsents.userId, userId));
      return { revoked: true as const };
    });
  }

  async admitOperation(userId: string): Promise<AiOperationGrant> {
    return this.database.db.transaction(async (transaction) => {
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${consentLockId(userId)}, 0))`);
      const [authority] = await transaction.select().from(aiConsentAuthorities)
        .where(eq(aiConsentAuthorities.userId, userId)).limit(1);
      const [consent] = await transaction.select().from(aiConsents).where(eq(aiConsents.userId, userId)).limit(1);
      if (!isCurrentConsent(consent, authority)) throw new HttpException('ai_consent_required', 428);
      return {
        userId,
        policyVersion: CURRENT_AI_CONSENT_POLICY_VERSION,
        consentRevision: consent!.revision,
        nonce: randomUUID(),
        expiresAt: Date.now() + OPERATION_GRANT_TTL_MS,
      };
    });
  }

  private async withAuthorizedOperation<T>(userId: string, grant: AiOperationGrant, action: () => Promise<T>): Promise<T> {
    await this.database.db.transaction(async (transaction) => {
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${consentLockId(userId)}, 0))`);
      const [authority] = await transaction.select().from(aiConsentAuthorities)
        .where(eq(aiConsentAuthorities.userId, userId)).limit(1);
      const [consent] = await transaction.select().from(aiConsents).where(eq(aiConsents.userId, userId)).limit(1);
      if (
        grant.userId !== userId
        || grant.policyVersion !== CURRENT_AI_CONSENT_POLICY_VERSION
        || grant.expiresAt <= Date.now()
        || !isCurrentConsent(consent, authority)
        || consent!.revision !== grant.consentRevision
      ) {
        throw new HttpException('ai_consent_required', 428);
      }
    });
    // Provider calls and usage logging intentionally run after the short
    // authority transaction releases its connection. A slow upstream must not
    // exhaust the PostgreSQL pool or prevent a concurrent consent withdrawal.
    return action();
  }

  private async logUsage(input: {
    userId: string; requestId: string; capability: UsageCapability; status: string; model: string;
    promptVersion: string; latencyMs: number; quotaUnits: number; meta?: ProviderMeta;
    failureCode?: string; upstreamStatus?: string; attemptCount?: number;
  }) {
    await this.database.db.insert(aiUsageLogs).values({
      ...input,
      inputTokens: input.meta?.inputTokens,
      outputTokens: input.meta?.outputTokens,
      costMicrounits: null,
      failureCode: input.failureCode,
      upstreamStatus: input.upstreamStatus ?? input.meta?.upstreamStatus,
      attemptCount: input.attemptCount ?? input.meta?.attemptCount ?? 1,
    }).onConflictDoNothing();
  }

  private status(error: unknown) {
    const observation = aiFailureObservation(error);
    if (observation.upstreamStatus === 'limited') return 'limited';
    if (observation.upstreamStatus === 'timeout') return 'timeout';
    if (observation.upstreamStatus === 'cancelled') return 'cancelled';
    return 'failed';
  }

  private async run<T>(input: {
    userId: string; requestId: string; capability: UsageCapability; provider: AiProviderName;
    model: string; promptVersion: string; units: number;
    action: () => Promise<{ data: T; meta: ProviderMeta }>;
  }): Promise<T> {
    const started = Date.now();
    const usage = {
      userId: input.userId,
      requestId: input.requestId,
      capability: input.capability,
      model: input.model,
      promptVersion: input.promptVersion,
    };
    try {
      const result = await input.action();
      await this.logUsage({ ...usage, status: 'success', latencyMs: Date.now() - started, quotaUnits: input.units, meta: result.meta })
        .catch(() => this.logger.error(`ai_usage_log_failed capability=${input.capability} status=success`));
      return result.data;
    } catch (error) {
      const observation = aiFailureObservation(error);
      const latencyMs = Date.now() - started;
      const status = this.status(error);
      const meteredFailure = Boolean(
        observation.meta
        && ((observation.meta.inputTokens ?? 0) > 0 || (observation.meta.outputTokens ?? 0) > 0),
      );
      await this.logUsage({
        ...usage,
        status,
        latencyMs,
        // User quota is charged only for a usable result. Provider token metadata
        // remains available for internal cost reconciliation when an upstream
        // response was metered but failed validation.
        quotaUnits: 0,
        ...observation,
      }).catch(() => this.logger.error(`ai_usage_log_failed capability=${input.capability} status=failed metered=${meteredFailure}`));
      this.logger.warn(
        `ai_operation_failed requestId=${safeLogToken(input.requestId)}`
        + ` capability=${input.capability} provider=${input.provider}`
        + ` model=${safeLogToken(input.model)} stage=${observation.upstreamStatus}`
        + ` status=${status} failureCode=${observation.failureCode}`
        + ` attemptCount=${observation.attemptCount} latencyMs=${latencyMs}`,
      );
      if (observation.failureCode === 'internal_error') {
        throw new HttpException('ai_upstream_failed', 503);
      }
      throw error;
    }
  }

  async transcribe(userId: string, requestId: string, audio: Buffer, mimeType: string, model: TencentAsrModel, grant: AiOperationGrant, signal?: AbortSignal) {
    if (!audio.length || audio.length > 8 * 1024 * 1024) throw new BadRequestException('invalid_audio');
    return this.withAuthorizedOperation(userId, grant, () => this.run({
      userId, requestId, capability: 'transcribe', provider: 'tencent-asr', model,
      promptVersion: 'tencent-asr:raw:v1', units: 3,
      action: async () => {
        const result = await this.asr.transcribe(audio, mimeType, model, signal, requestId);
        return { data: { transcript: result.rawTranscript }, meta: result.meta };
      },
    }));
  }

  async grammarReview(userId: string, requestId: string, input: GrammarReviewRequest, grant: AiOperationGrant, signal?: AbortSignal) {
    const result = await this.withAuthorizedOperation(userId, grant, () => this.run({
      userId, requestId, capability: 'grammar_review', provider: 'deepseek', model: this.reviewProvider.textModel('grammar'), promptVersion: REVIEW_PROMPT_VERSION, units: 2,
      action: () => this.generateReview(userId, {
        mode: 'grammar', module: input.module, questionId: input.questionId, transcript: input.transcript,
      }, signal),
    }));
    return {
      correctedText: result.grammar.correctedText,
      issues: result.grammar.issues.map(legacyIssueText),
      promptVersion: REVIEW_PROMPT_VERSION,
    };
  }

  async polish(userId: string, requestId: string, input: PolishRequest, grant: AiOperationGrant, signal?: AbortSignal): Promise<PolishResult> {
    const transcript = input.correctedText ?? input.transcript;
    const result = await this.withAuthorizedOperation(userId, grant, () => this.run({
      userId, requestId, capability: 'polish', provider: 'deepseek', model: this.reviewProvider.textModel('opi'), promptVersion: REVIEW_PROMPT_VERSION, units: 2,
      action: () => this.generateReview(userId, {
        mode: 'opi', module: 'opi', questionId: input.questionId, transcript,
      }, signal),
    }));
    return { polishedText: result.polishedText!, promptVersion: REVIEW_PROMPT_VERSION };
  }

  private generateReview(userId: string, input: AiReviewRequest, signal?: AbortSignal) {
    return this.reviewProvider.generateValidated({
      mode: input.mode,
      system: reviewSystemPrompt(input.mode),
      prompt: JSON.stringify({ transcript: input.transcript }),
      userId,
      signal,
      validate: (data) => parseAndValidateReview(data, input),
    });
  }

  async review(userId: string, requestId: string, input: AiReviewRequest, grant: AiOperationGrant, signal?: AbortSignal): Promise<AiReviewResult> {
    const result = await this.withAuthorizedOperation(userId, grant, () => this.run({
      userId,
      requestId,
      capability: input.mode === 'opi' ? 'polish' : 'grammar_review',
      provider: 'deepseek',
      model: this.reviewProvider.textModel(input.mode),
      promptVersion: REVIEW_PROMPT_VERSION,
      units: input.mode === 'opi' ? 3 : 2,
      action: () => this.generateReview(userId, input, signal),
    }));
    return withReviewPromptVersion(result);
  }
}
