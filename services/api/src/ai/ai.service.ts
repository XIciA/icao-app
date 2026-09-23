import { normalizeAviationTranscriptDetailed, AVIATION_TRANSCRIPT_NORMALIZATION_VERSION, type AviationTranscriptNormalizationResult } from './aviation-transcript-normalization';
import { DEFAULT_TENCENT_ASR_MODEL } from '@icao/contracts';
import { estimateCostMicrounits } from './usage-cost';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { BadRequestException, HttpException, Injectable, Logger } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { CURRENT_AI_CONSENT_FLOW_REVISION, CURRENT_AI_CONSENT_POLICY_VERSION, type AiConsent, type AiConsentChallenge, type AiConsentRequest, type AiConsentStatus, type AiReviewRequest, type GrammarReviewRequest, type PolishRequest, type TencentAsrModel } from '@icao/contracts';

import type { AiOperationLookup, AiRuleCosts, PartialAiTranscription, AiUsageOperationSummary as AiPointOperationSummary, MeteredAiReviewResult as AiReviewResult, MeteredPolishResult as PolishResult, TranscribeReviewRequest, TranscribeReviewResult } from '@icao/contracts/commerce-rules';
import type { LearningReviewMaterials } from '@icao/contracts/learning-ai';
import { learningReviewPrompt, validateLearningReview, LEARNING_REVIEW_PROMPT_VERSION } from './learning-review';

import { PersistentCommerceBenefitsService } from '../commerce/persistent-commerce-benefits.service';
import type { BillableAiCapability } from '../commerce/commerce-domain';
import { DatabaseService } from '../database/database.service';
import { accounts, aiConsentAuthorities, aiConsentChallenges, aiConsents, aiPointReservations, aiUsageLogs } from '../database/schema';
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
const AI_OPERATION_QUEUE_TIMEOUT_MS = 45 * 1000;

export type AiOperationGrant = {
  userId: string;
  environment?: 'production' | 'sandbox';
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
    private readonly commerce: PersistentCommerceBenefitsService = new PersistentCommerceBenefitsService(),
  ) {}

  async operationResult(userId: string, environment: 'production' | 'sandbox', operationId: string): Promise<AiOperationLookup> {
    return this.database.db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`learning:${userId}`}, 0))`);
    const [owner] = await tx.select().from(accounts).where(eq(accounts.id, userId)).limit(1);
    const [operation] = await tx.select().from(aiPointReservations).where(and(
      eq(aiPointReservations.accountId, userId),
      eq(aiPointReservations.environment, environment),
      eq(aiPointReservations.operationId, operationId),
    )).limit(1);
    if (!owner || owner.status !== 'active' || !operation || operation.resultDeletedAt || operation.aiResultGeneration !== owner.aiResultGeneration) return { state: 'missing' };
    const partial = (operation.resultPayload as { partialTranscription?: PartialAiTranscription } | null)?.partialTranscription;
    if (operation.status === 'released') return { state: 'released', ...(partial ? { partialTranscription: partial } : {}) };
    if (operation.status === 'reserved') {
      const pending = Boolean(operation.leaseUntil && operation.leaseUntil.getTime() > Date.now());
      return { state: pending ? 'pending' : 'released', ...(!pending && partial ? { partialTranscription: partial } : {}) };
    }
    // Privacy deletion clears the body but retains the financial ledger.
    if (!operation.resultPayload) return { state: 'missing' };
    const payload = operation.resultPayload as Record<string, unknown>;
    const result = operation.capability === 'grammar_correction' || operation.capability === 'opi_refinement'
      ? { ...payload, promptVersion: payload.analysis ? LEARNING_REVIEW_PROMPT_VERSION : REVIEW_PROMPT_VERSION } : payload;
    return { state: 'completed', capability: operation.capability as keyof AiRuleCosts,
      result: result as Extract<AiOperationLookup, { state: 'completed' }>['result'] };
    });
  }

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

  async admitOperation(userId: string, environment: 'production' | 'sandbox' = 'production'): Promise<AiOperationGrant> {
    return this.database.db.transaction(async (transaction) => {
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${consentLockId(userId)}, 0))`);
      const [authority] = await transaction.select().from(aiConsentAuthorities)
        .where(eq(aiConsentAuthorities.userId, userId)).limit(1);
      const [consent] = await transaction.select().from(aiConsents).where(eq(aiConsents.userId, userId)).limit(1);
      if (!isCurrentConsent(consent, authority)) throw new HttpException('ai_consent_required', 428);
      return {
        userId,
        environment,
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
      audioDurationSeconds: input.meta?.audioDurationSeconds == null ? null : Math.ceil(input.meta.audioDurationSeconds),
      inputTokens: input.meta?.inputTokens,
      outputTokens: input.meta?.outputTokens,
      costMicrounits: estimateCostMicrounits({ ...input, ...input.meta }),
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

  private requestDigest(parts: Array<string | Buffer>) {
    const digest = createHash('sha256');
    for (const part of parts) {
      digest.update(typeof part === 'string' ? part : new Uint8Array(part));
      digest.update('\0');
    }
    return digest.digest('hex');
  }

  private waitForQueue(milliseconds: number, signal?: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
      if (signal?.aborted) {
        const error = new Error('request_aborted');
        error.name = 'AbortError';
        reject(error);
        return;
      }
      const onAbort = () => {
        clearTimeout(timeout);
        signal?.removeEventListener('abort', onAbort);
        const error = new Error('request_aborted');
        error.name = 'AbortError';
        reject(error);
      };
      const timeout = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      }, milliseconds);
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }

  private async reservePoints<T>(input: {
    userId: string;
    environment: 'production' | 'sandbox';
    operationId: string;
    pointCapability: BillableAiCapability;
    requestDigest: string;
    signal?: AbortSignal;
  }) {
    const deadline = Date.now() + AI_OPERATION_QUEUE_TIMEOUT_MS;
    while (true) {
      let reservation;
      try {
        reservation = await this.database.db.transaction((transaction) => this.commerce.reserveAiPoints<T>(transaction, {
          accountId: input.userId,
          capability: input.pointCapability,
          environment: input.environment,
          operationId: input.operationId,
          requestDigest: input.requestDigest,
          reservedAt: new Date(),
        }));
      } catch (error) {
        const code = error instanceof Error ? error.message : 'ai_points_unavailable';
        if (code === 'insufficient_ai_points') throw new HttpException(code, 402);
        if (code === 'ai_operation_result_deleted') throw new HttpException(code, 410);
        if (code === 'ai_operation_idempotency_conflict') throw new HttpException(code, 409);
        if (code === 'ai_operation_lease_expired' || code === 'ai_operation_released') {
          throw new HttpException('ai_operation_released', 409);
        }
        throw error;
      }
      if (reservation.state !== 'wait') return reservation;
      if (Date.now() >= deadline) throw new HttpException('ai_operation_in_progress', 409);
      await this.waitForQueue(reservation.retryAfterMs, input.signal);
    }
  }

  private async run<T extends Record<string, unknown>>(input: {
    userId: string; requestId: string; capability: UsageCapability; provider: AiProviderName;
    model: string; promptVersion: string; units: number; grant: AiOperationGrant;
    operationId: string; pointCapability: BillableAiCapability; requestDigest: string; signal?: AbortSignal;
    action: () => Promise<{ data: T; meta: ProviderMeta }>;
  }): Promise<T & { aiPoints: AiPointOperationSummary }> {
    const reservation = await this.reservePoints<T & { aiPoints: AiPointOperationSummary }>({
      userId: input.userId,
      environment: input.grant.environment ?? 'production',
      operationId: input.operationId,
      pointCapability: input.pointCapability,
      requestDigest: input.requestDigest,
      signal: input.signal,
    });
    if (reservation.state === 'replay') return reservation.data;
    const started = Date.now();
    const usage = {
      userId: input.userId,
      requestId: input.requestId,
      capability: input.capability,
      model: input.model,
      promptVersion: input.promptVersion,
    };
    try {
      const result = await this.withAuthorizedOperation(input.userId, input.grant, input.action);
      this.logger.log(`ai_stages requestId=${safeLogToken(input.requestId)} capability=${input.capability} timings=${JSON.stringify(result.meta.timings ?? {})}`);
      const data = await this.database.db.transaction((transaction) => this.commerce.settleAiPoints(transaction, {
        accountId: input.userId,
        environment: input.grant.environment ?? 'production',
        operationId: input.operationId,
        result: result.data,
        settledAt: new Date(),
      }));
      await this.logUsage({ ...usage, status: 'success', latencyMs: Date.now() - started, quotaUnits: data.aiPoints.charged, meta: result.meta })
        .catch(() => this.logger.error(`ai_usage_log_failed capability=${input.capability} status=success`));
      return data;
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
      await this.database.db.transaction((transaction) => this.commerce.releaseAiPoints(transaction, {
        accountId: input.userId,
        environment: input.grant.environment ?? 'production',
        failureCode: observation.failureCode,
        operationId: input.operationId,
        releasedAt: new Date(),
      })).catch(() => this.logger.error(`ai_point_release_failed capability=${input.capability}`));
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

  async transcribe(userId: string, requestId: string, audio: Buffer, mimeType: string, model: TencentAsrModel, grant: AiOperationGrant, signal?: AbortSignal, operationId = requestId) {
    if (!audio.length || audio.length > 8 * 1024 * 1024) throw new BadRequestException('invalid_audio');
    // Older clients may still send an experimental engine preference. The server owns the rollout.
    model = DEFAULT_TENCENT_ASR_MODEL;
    return this.run({
      userId, requestId, capability: 'transcribe', provider: 'tencent-asr', model,
      promptVersion: AVIATION_TRANSCRIPT_NORMALIZATION_VERSION, units: 3, grant, operationId,
      pointCapability: 'transcription', signal,
      requestDigest: this.requestDigest(['transcription', mimeType, model, audio]),
      action: async () => {
        const result = await this.asr.transcribe(audio, mimeType, model, signal, requestId);
        const normalized = normalizeAviationTranscriptDetailed(result.rawTranscript);
        return { data: { transcript: normalized.transcript, rawTranscript: result.rawTranscript,
          normalization: { version: normalized.version, transformations: normalized.transformations }, model }, meta: result.meta };
      },
    });
  }

  async transcribeReview(
    userId: string, requestId: string, audio: Buffer, mimeType: string, model: TencentAsrModel,
    input: TranscribeReviewRequest, grant: AiOperationGrant, signal?: AbortSignal, operationId = requestId, materials?: LearningReviewMaterials,
  ): Promise<TranscribeReviewResult & { rawTranscript: string; model: TencentAsrModel; normalization: Omit<AviationTranscriptNormalizationResult, 'transcript'> }> {
    if (!audio.length || audio.length > 8 * 1024 * 1024) throw new BadRequestException('invalid_audio');
    model = DEFAULT_TENCENT_ASR_MODEL;
    const pointCapability = input.mode === 'opi' ? 'transcription_opi' : 'transcription_grammar';
    return this.run({
      userId, requestId, capability: input.mode === 'opi' ? 'polish' : 'grammar_review',
      provider: 'deepseek', model: this.reviewProvider.textModel(input.mode),
      promptVersion: input.analysisVersion === 2 ? LEARNING_REVIEW_PROMPT_VERSION : REVIEW_PROMPT_VERSION, units: 1, grant, operationId, pointCapability, signal,
      requestDigest: this.requestDigest([pointCapability, mimeType, model, JSON.stringify(input), audio]),
      action: async () => {
        const started = Date.now();
        const transcription = await this.asr.transcribe(audio, mimeType, model, signal, requestId);
        // Provider usage is recorded separately; the user has one reservation for the whole result.
        await this.logUsage({
          userId, requestId, capability: 'transcribe', status: 'success', model,
          promptVersion: AVIATION_TRANSCRIPT_NORMALIZATION_VERSION, latencyMs: Date.now() - started,
          quotaUnits: 0, meta: transcription.meta,
        }).catch(() => this.logger.error('ai_usage_log_failed capability=transcribe status=success'));
        const normalized = normalizeAviationTranscriptDetailed(transcription.rawTranscript);
        const transcript = normalized.transcript.trim();
        if (!transcript || transcript.length > (input.analysisVersion === 2 ? 12_000 : 4_000)) throw new BadRequestException('invalid_transcript');
        if (input.analysisVersion === 2) await this.savePartial(userId, grant.environment ?? 'production', operationId,
          { transcript, rawTranscript: transcription.rawTranscript, input });
        const result = await this.generateReview(userId, { ...input, transcript }, signal, materials);
        return { data: { transcript, rawTranscript: transcription.rawTranscript, model,
          normalization: { version: normalized.version, transformations: normalized.transformations },
          review: withReviewPromptVersion(result.data) }, meta: result.meta };
      },
    });
  }

  async grammarReview(userId: string, requestId: string, input: GrammarReviewRequest, grant: AiOperationGrant, signal?: AbortSignal, operationId = requestId) {
    const result = await this.run({
      userId, requestId, capability: 'grammar_review', provider: 'deepseek', model: this.reviewProvider.textModel('grammar'), promptVersion: REVIEW_PROMPT_VERSION, units: 2,
      grant, operationId, pointCapability: 'grammar_correction', signal,
      requestDigest: this.requestDigest(['grammar_correction', JSON.stringify(input)]),
      action: () => this.generateReview(userId, {
        mode: 'grammar', module: input.module, questionId: input.questionId, transcript: input.transcript,
      }, signal),
    });
    return {
      correctedText: result.grammar.correctedText,
      issues: result.grammar.issues.map(legacyIssueText),
      promptVersion: REVIEW_PROMPT_VERSION,
      aiPoints: result.aiPoints,
    };
  }

  async polish(userId: string, requestId: string, input: PolishRequest, grant: AiOperationGrant, signal?: AbortSignal, operationId = requestId): Promise<PolishResult> {
    const transcript = input.correctedText ?? input.transcript;
    const result = await this.run({
      userId, requestId, capability: 'polish', provider: 'deepseek', model: this.reviewProvider.textModel('opi'), promptVersion: REVIEW_PROMPT_VERSION, units: 2,
      grant, operationId, pointCapability: 'opi_refinement', signal,
      requestDigest: this.requestDigest(['opi_refinement', JSON.stringify(input)]),
      action: () => this.generateReview(userId, {
        mode: 'opi', module: 'opi', questionId: input.questionId, transcript,
      }, signal),
    });
    return { polishedText: result.polishedText!, promptVersion: REVIEW_PROMPT_VERSION, aiPoints: result.aiPoints };
  }

  private generateReview(userId: string, input: AiReviewRequest, signal?: AbortSignal, materials?: LearningReviewMaterials) {
    if (input.analysisVersion === 2) {
      if (!materials) throw new BadRequestException('ai_insufficient_material');
      return this.reviewProvider.generateValidated({ mode: input.mode, userId, signal,
        system: learningReviewPrompt(input.module), prompt: JSON.stringify({ ...materials, answerText: input.transcript }),
        maxTokens: 6000, timeoutMs: 45_000,
        validate: (data) => validateLearningReview(data, input, materials) });
    }
    return this.reviewProvider.generateValidated({
      mode: input.mode,
      system: reviewSystemPrompt(input.mode),
      prompt: JSON.stringify({ transcript: input.transcript }),
      userId,
      signal,
      validate: (data) => parseAndValidateReview(data, input),
    });
  }

  private async savePartial(userId: string, environment: 'production' | 'sandbox', operationId: string, partial: PartialAiTranscription) {
    await this.database.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`learning:${userId}`}, 0))`);
      const [owner] = await tx.select().from(accounts).where(eq(accounts.id, userId)).limit(1);
      if (!owner || owner.status !== 'active') throw new BadRequestException('account_unavailable');
      await tx.update(aiPointReservations).set({ resultPayload: { partialTranscription: partial } }).where(and(
        eq(aiPointReservations.accountId, userId), eq(aiPointReservations.environment, environment),
        eq(aiPointReservations.operationId, operationId), eq(aiPointReservations.status, 'reserved'),
        eq(aiPointReservations.aiResultGeneration, owner.aiResultGeneration), sql`${aiPointReservations.resultDeletedAt} is null`,
      ));
    });
  }

  async review(userId: string, requestId: string, input: AiReviewRequest, grant: AiOperationGrant, signal?: AbortSignal, operationId = requestId, materials?: LearningReviewMaterials): Promise<AiReviewResult> {
    let partial: PartialAiTranscription | undefined;
    if (input.resumeOperationId) {
      const previous = await this.operationResult(userId, grant.environment ?? 'production', input.resumeOperationId);
      if (previous.state !== 'released' || !previous.partialTranscription) throw new BadRequestException('ai_resume_unavailable');
      partial = previous.partialTranscription;
      if (partial.input.questionId !== input.questionId || partial.input.module !== input.module || partial.input.mode !== input.mode
        || !input.source || !partial.input.source
        || (['bankId', 'categoryId', 'topicId', 'version', 'checksum'] as const)
          .some((key) => partial!.input.source![key] !== input.source![key])) throw new BadRequestException('ai_resume_mismatch');
    }
    const pointCapability = partial ? (input.mode === 'opi' ? 'transcription_opi' : 'transcription_grammar')
      : input.mode === 'opi' ? 'opi_refinement' : 'grammar_correction';
    type ReviewData = Awaited<ReturnType<typeof this.generateReview>>['data'];
    const result = await this.run<ReviewData | Pick<TranscribeReviewResult, 'transcript' | 'rawTranscript' | 'review'>>({
      userId,
      requestId,
      capability: input.mode === 'opi' ? 'polish' : 'grammar_review',
      provider: 'deepseek',
      model: this.reviewProvider.textModel(input.mode),
      promptVersion: input.analysisVersion === 2 ? LEARNING_REVIEW_PROMPT_VERSION : REVIEW_PROMPT_VERSION,
      units: input.mode === 'opi' ? 3 : 2,
      grant,
      operationId,
      pointCapability,
      requestDigest: this.requestDigest([pointCapability, JSON.stringify(input)]),
      signal,
      action: async () => {
        if (partial) await this.savePartial(userId, grant.environment ?? 'production', operationId, partial);
        const generated = await this.generateReview(userId, input, signal, materials);
        // A resumed combination still has a combined billing capability. Persist
        // its complete envelope so operation lookup and cross-device recovery
        // interpret it exactly like the original audio request.
        return partial ? { ...generated, data: {
          transcript: input.transcript,
          rawTranscript: partial.rawTranscript,
          review: withReviewPromptVersion(generated.data),
        } } : generated;
      },
    });
    if ('review' in result) return { ...result.review, aiPoints: result.aiPoints };
    return { ...withReviewPromptVersion(result), aiPoints: result.aiPoints };
  }
}
