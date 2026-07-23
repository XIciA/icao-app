import { BadRequestException, HttpException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
import type { AiConsent, GrammarReviewRequest, PolishRequest, PolishResult, WordLookupRequest, WordLookupResult } from '@icao/contracts';

import { DatabaseService } from '../database/database.service';
import { aiConsents, aiUsageLogs, aiWordCache } from '../database/schema';
import { AiAssetsService } from './ai-assets.service';
import { AiProviderService, type ProviderMeta } from './ai-provider.service';
import { AVIATION_TRANSCRIPT_NORMALIZATION_VERSION, normalizeAviationTranscript } from './aviation-transcript-normalization';
import { FunAsrService } from './fun-asr.service';
import { GRAMMAR_REVIEW_PROMPT, OPI_POLISH_PROMPT } from './ai-prompts';
import { grammarResultSchema, polishResultSchema, wordLookupResultSchema } from './ai.schemas';

const PROMPTS = {
  word: 'word-lookup-v1',
  grammar: 'grammar-review:v2',
  polish: 'polish:v2',
} as const;

type UsageCapability = 'word_lookup' | 'transcribe' | 'grammar_review' | 'polish';

@Injectable()
export class AiService {
  constructor(
    private readonly database: DatabaseService,
    private readonly assets: AiAssetsService,
    private readonly provider: AiProviderService,
    private readonly asr: FunAsrService,
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
  }) {
    await this.database.db.insert(aiUsageLogs).values({
      ...input,
      inputTokens: input.meta?.inputTokens,
      outputTokens: input.meta?.outputTokens,
      costMicrounits: null,
    }).onConflictDoNothing();
  }

  private status(error: unknown) {
    const message = error instanceof HttpException ? String(error.getResponse()) : '';
    if (message.includes('limited')) return 'limited';
    if (message.includes('timeout')) return 'timeout';
    if (message.includes('cancelled')) return 'cancelled';
    return 'failed';
  }

  private async run<T>(input: {
    userId: string; requestId: string; capability: UsageCapability; model: string; promptVersion: string; units: number;
    action: () => Promise<{ data: T; meta: ProviderMeta }>;
  }): Promise<T> {
    const started = Date.now();
    try {
      const result = await input.action();
      await this.logUsage({ ...input, status: 'success', latencyMs: Date.now() - started, quotaUnits: input.units, meta: result.meta });
      return result.data;
    } catch (error) {
      await this.logUsage({ ...input, status: this.status(error), latencyMs: Date.now() - started, quotaUnits: 0 }).catch(() => undefined);
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
      userId, requestId, capability: 'word_lookup', model: this.provider.textModel(), promptVersion: PROMPTS.word, units: 1,
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

  async transcribe(userId: string, requestId: string, audio: Buffer, mimeType: string, signal?: AbortSignal) {
    await this.requireConsent(userId);
    if (!audio.length || audio.length > 8 * 1024 * 1024) throw new BadRequestException('invalid_audio');
    return this.run({
      userId, requestId, capability: 'transcribe', model: this.asr.model(),
      promptVersion: `${this.asr.hotwordsVersion()}+${AVIATION_TRANSCRIPT_NORMALIZATION_VERSION}`, units: 3,
      action: async () => {
        const result = await this.asr.transcribe(audio, mimeType, signal);
        return { data: { transcript: normalizeAviationTranscript(result.rawTranscript) }, meta: result.meta };
      },
    });
  }

  async grammarReview(userId: string, requestId: string, input: GrammarReviewRequest, signal?: AbortSignal) {
    await this.requireConsent(userId);
    const result = await this.run({
      userId, requestId, capability: 'grammar_review', model: this.provider.textModel(), promptVersion: PROMPTS.grammar, units: 2,
      action: async () => {
        const generated = await this.provider.generateJson<unknown>(GRAMMAR_REVIEW_PROMPT, JSON.stringify({ transcript: input.transcript }), signal);
        return { data: grammarResultSchema.parse(generated.data), meta: generated.meta };
      },
    });
    return { ...result, promptVersion: PROMPTS.grammar };
  }

  async polish(userId: string, requestId: string, input: PolishRequest, signal?: AbortSignal): Promise<PolishResult> {
    await this.requireConsent(userId);
    const result = await this.run({
      userId, requestId, capability: 'polish', model: this.provider.textModel(), promptVersion: PROMPTS.polish, units: 2,
      action: async () => {
        const generated = await this.provider.generateJson<unknown>(OPI_POLISH_PROMPT, JSON.stringify({ transcript: input.transcript, ...(input.correctedText ? { correctedText: input.correctedText } : {}) }), signal);
        return { data: polishResultSchema.parse(generated.data), meta: generated.meta };
      },
    });
    return { ...result, promptVersion: PROMPTS.polish };
  }
}
