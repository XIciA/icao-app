import { BadRequestException, HttpException, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
import type { AiConsent, AiReviewRequest, AiReviewResult, GrammarReviewRequest, PolishRequest, PolishResult, TencentAsrModel, WordLookupRequest, WordLookupResult } from '@icao/contracts';

import { DatabaseService } from '../database/database.service';
import { aiConsents, aiUsageLogs, aiWordCache } from '../database/schema';
import { AiAssetsService } from './ai-assets.service';
import { AiProviderService, type ProviderMeta } from './ai-provider.service';
import { DeepSeekReviewProviderService } from './deepseek-review-provider.service';
import { TencentAsrService } from './tencent-asr.service';
import { reviewSystemPrompt, REVIEW_PROMPT_VERSION } from './deepseek-review-prompts';
import { legacyIssueText, parseAndValidateReview, withReviewPromptVersion } from './review-harness';
import { wordLookupResultSchema } from './ai.schemas';
import { aiFailureObservation } from './ai-error-observability';

const PROMPTS = {
  word: 'word-lookup-v1',
} as const;

type UsageCapability = 'word_lookup' | 'transcribe' | 'grammar_review' | 'polish';
type AiProviderName = 'dashscope' | 'deepseek' | 'tencent-asr';

function safeLogToken(value: string) {
  return value.replace(/[^A-Za-z0-9._:-]/gu, '_').slice(0, 120) || 'unknown';
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly assets: AiAssetsService,
    private readonly provider: AiProviderService,
    private readonly reviewProvider: DeepSeekReviewProviderService,
    private readonly asr: TencentAsrService,
  ) {}

  async acceptConsent(userId: string, policyVersion: string): Promise<AiConsent> {
    const now = new Date();
    await this.database.db.insert(aiConsents).values({ userId, policyVersion, acceptedAt: now, updatedAt: now })
      .onConflictDoUpdate({ target: aiConsents.userId, set: { policyVersion, acceptedAt: now, updatedAt: now } });
    return { policyVersion, acceptedAt: now.toISOString() };
  }

  async revokeConsent(userId: string) {
    await this.database.db.delete(aiConsents).where(eq(aiConsents.userId, userId));
    return { revoked: true as const };
  }

  private async requireConsent(userId: string) {
    const [consent] = await this.database.db.select().from(aiConsents).where(eq(aiConsents.userId, userId)).limit(1);
    if (!consent) throw new HttpException('ai_consent_required', 428);
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

  async wordLookup(userId: string, requestId: string, input: WordLookupRequest, signal?: AbortSignal): Promise<WordLookupResult> {
    await this.requireConsent(userId);
    const normalized = JSON.stringify({ module: input.module, word: input.word.toLocaleLowerCase(), sentence: input.sentence.replace(/\s+/g, ' ').trim(), promptVersion: PROMPTS.word, model: this.provider.textModel() });
    const queryHash = createHash('sha256').update(normalized).digest('hex');
    const [cached] = await this.database.db.select().from(aiWordCache).where(and(
      eq(aiWordCache.userId, userId), eq(aiWordCache.queryHash, queryHash), gt(aiWordCache.expiresAt, new Date()),
    )).limit(1);
    if (cached) return { ...(cached.result as Omit<WordLookupResult, 'cached'>), cached: true };

    const rules = await this.assets.promptRules('word', [input.word, input.sentence]);
    const result = await this.run({
      userId, requestId, capability: 'word_lookup', provider: 'dashscope', model: this.provider.textModel(), promptVersion: PROMPTS.word, units: 1,
      action: async () => {
        const generated = await this.provider.generateJson<unknown>(rules, JSON.stringify({ task: 'Explain the selected word or phrase in this exact learning context.', input }), signal);
        const parsed = wordLookupResultSchema.parse(generated.data);
        return { data: { definition: parsed.definition, sentenceMeaning: parsed.contextExplanationZh }, meta: generated.meta };
      },
    });
    const response = { word: input.word, ...result, promptVersion: PROMPTS.word, cached: false } satisfies WordLookupResult;
    await this.database.db.insert(aiWordCache).values({
      userId, queryHash, result: { ...response, cached: undefined }, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    }).onConflictDoUpdate({ target: [aiWordCache.userId, aiWordCache.queryHash], set: { result: { ...response, cached: undefined }, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) } });
    return response;
  }

  async transcribe(userId: string, requestId: string, audio: Buffer, mimeType: string, model: TencentAsrModel, signal?: AbortSignal) {
    await this.requireConsent(userId);
    if (!audio.length || audio.length > 8 * 1024 * 1024) throw new BadRequestException('invalid_audio');
    return this.run({
      userId, requestId, capability: 'transcribe', provider: 'tencent-asr', model,
      promptVersion: 'tencent-asr:raw:v1', units: 3,
      action: async () => {
        const result = await this.asr.transcribe(audio, mimeType, model, signal, requestId);
        return { data: { transcript: result.rawTranscript }, meta: result.meta };
      },
    });
  }

  async grammarReview(userId: string, requestId: string, input: GrammarReviewRequest, signal?: AbortSignal) {
    await this.requireConsent(userId);
    const result = await this.run({
      userId, requestId, capability: 'grammar_review', provider: 'deepseek', model: this.reviewProvider.textModel('grammar'), promptVersion: REVIEW_PROMPT_VERSION, units: 2,
      action: () => this.generateReview(userId, {
        mode: 'grammar', module: input.module, questionId: input.questionId, transcript: input.transcript,
      }, signal),
    });
    return {
      correctedText: result.grammar.correctedText,
      issues: result.grammar.issues.map(legacyIssueText),
      promptVersion: REVIEW_PROMPT_VERSION,
    };
  }

  async polish(userId: string, requestId: string, input: PolishRequest, signal?: AbortSignal): Promise<PolishResult> {
    await this.requireConsent(userId);
    const transcript = input.correctedText ?? input.transcript;
    const result = await this.run({
      userId, requestId, capability: 'polish', provider: 'deepseek', model: this.reviewProvider.textModel('opi'), promptVersion: REVIEW_PROMPT_VERSION, units: 2,
      action: () => this.generateReview(userId, {
        mode: 'opi', module: 'opi', questionId: input.questionId, transcript,
      }, signal),
    });
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

  async review(userId: string, requestId: string, input: AiReviewRequest, signal?: AbortSignal): Promise<AiReviewResult> {
    await this.requireConsent(userId);
    const result = await this.run({
      userId,
      requestId,
      capability: input.mode === 'opi' ? 'polish' : 'grammar_review',
      provider: 'deepseek',
      model: this.reviewProvider.textModel(input.mode),
      promptVersion: REVIEW_PROMPT_VERSION,
      units: input.mode === 'opi' ? 3 : 2,
      action: () => this.generateReview(userId, input, signal),
    });
    return withReviewPromptVersion(result);
  }
}
