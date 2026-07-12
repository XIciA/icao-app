import { BadRequestException, HttpException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
import type { AiConsent, GrammarReviewRequest, GrammarReviewResult, OpiAnalysisResult, PolishRequest, PolishResult, WordLookupRequest, WordLookupResult } from '@icao/contracts';

import { DatabaseService } from '../database/database.service';
import { aiConsents, aiUsageLogs, aiWordCache } from '../database/schema';
import { AiAssetsService } from './ai-assets.service';
import { AiProviderService, type ProviderMeta } from './ai-provider.service';
import { grammarResultSchema, polishResultSchema, wordLookupResultSchema } from './ai.schemas';

const PROMPTS = {
  word: 'word-lookup-v1',
  grammar: 'grammar-review-v1',
  polish: 'polish-v1',
  transcribe: 'transcribe-hints:v1',
} as const;

type UsageCapability = 'word_lookup' | 'transcribe' | 'grammar_review' | 'polish';

@Injectable()
export class AiService {
  private readonly guestWordCache = new Map<string, WordLookupResult>();
  constructor(
    private readonly database: DatabaseService,
    private readonly assets: AiAssetsService,
    private readonly provider: AiProviderService,
  ) {}

  async acceptConsent(userId: string | undefined, policyVersion: string): Promise<AiConsent> {
    const now = new Date();
    if (userId) {
      await this.database.db.insert(aiConsents).values({ userId, policyVersion, acceptedAt: now, updatedAt: now })
        .onConflictDoUpdate({ target: aiConsents.userId, set: { policyVersion, acceptedAt: now, updatedAt: now } });
    }
    return { policyVersion, acceptedAt: now.toISOString() };
  }

  async revokeConsent(userId: string | undefined) {
    if (userId) await this.database.db.delete(aiConsents).where(eq(aiConsents.userId, userId));
    return { revoked: true as const };
  }

  private async requireConsent(userId: string | undefined) {
    if (!userId) return;
    const [consent] = await this.database.db.select().from(aiConsents).where(eq(aiConsents.userId, userId)).limit(1);
    if (!consent) throw new HttpException('ai_consent_required', 428);
  }

  private async logUsage(input: {
    userId?: string; requestId: string; capability: UsageCapability; status: string; model: string;
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
    userId?: string; requestId: string; capability: UsageCapability; model: string; promptVersion: string; units: number;
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

  async wordLookup(userId: string | undefined, requestId: string, input: WordLookupRequest, signal?: AbortSignal): Promise<WordLookupResult> {
    await this.requireConsent(userId);
    const normalized = JSON.stringify({ module: input.module, word: input.word.toLocaleLowerCase(), sentence: input.sentence.replace(/\s+/g, ' ').trim(), promptVersion: PROMPTS.word, model: this.provider.textModel() });
    const queryHash = createHash('sha256').update(normalized).digest('hex');
    if (userId) {
      const [cached] = await this.database.db.select().from(aiWordCache).where(and(
        eq(aiWordCache.userId, userId), eq(aiWordCache.queryHash, queryHash), gt(aiWordCache.expiresAt, new Date()),
      )).limit(1);
      if (cached) return { ...(cached.result as Omit<WordLookupResult, 'cached'>), cached: true };
    } else {
      const cached = this.guestWordCache.get(queryHash);
      if (cached) return { ...cached, cached: true };
    }

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
    if (userId) {
      await this.database.db.insert(aiWordCache).values({
        userId, queryHash, result: { ...response, cached: undefined }, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      }).onConflictDoUpdate({ target: [aiWordCache.userId, aiWordCache.queryHash], set: { result: { ...response, cached: undefined }, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) } });
    } else {
      this.guestWordCache.set(queryHash, response);
    }
    return response;
  }

  async transcribe(userId: string | undefined, requestId: string, audio: Buffer, mimeType: string, signal?: AbortSignal) {
    await this.requireConsent(userId);
    if (!audio.length || audio.length > 8 * 1024 * 1024) throw new BadRequestException('invalid_audio');
    return this.run({
      userId, requestId, capability: 'transcribe', model: this.provider.asrModel(), promptVersion: PROMPTS.transcribe, units: 3,
      action: () => this.provider.transcribe(audio, mimeType, signal),
    });
  }

  private async grammar(userId: string | undefined, requestId: string, input: GrammarReviewRequest, signal?: AbortSignal): Promise<GrammarReviewResult> {
    const rules = await this.assets.promptRules('grammar', [input.transcript, input.questionText]);
    const result = await this.run({
      userId, requestId, capability: 'grammar_review', model: this.provider.textModel(), promptVersion: PROMPTS.grammar, units: 2,
      action: async () => {
        const generated = await this.provider.generateJson<unknown>(rules, JSON.stringify({ task: 'Review only clear grammar problems. Do not score, grade, assess pronunciation or create a standard answer.', input }), signal);
        return { data: grammarResultSchema.parse(generated.data), meta: generated.meta };
      },
    });
    return { ...result, promptVersion: PROMPTS.grammar };
  }

  async grammarReview(userId: string | undefined, requestId: string, input: GrammarReviewRequest, signal?: AbortSignal) {
    await this.requireConsent(userId);
    return this.grammar(userId, requestId, input, signal);
  }

  async opiAnalysis(userId: string | undefined, requestId: string, input: GrammarReviewRequest, signal?: AbortSignal): Promise<OpiAnalysisResult> {
    await this.requireConsent(userId);
    if (input.module !== 'opi') throw new BadRequestException('invalid_ai_module');
    const grammar = await this.grammar(userId, `${requestId}:grammar`, input, signal);
    const rules = await this.assets.promptRules('polish', [grammar.correctedText, input.questionText]);
    const polished = await this.run({
      userId, requestId: `${requestId}:polish`, capability: 'polish', model: this.provider.textModel(), promptVersion: PROMPTS.polish, units: 2,
      action: async () => {
        const generated = await this.provider.generateJson<unknown>(rules, JSON.stringify({ task: 'Preserve the learner original meaning. Produce a natural, concise spoken civil aviation expression for comparison, not a standard answer.', question: input.questionText, original: input.transcript, corrected: grammar.correctedText }), signal);
        return { data: polishResultSchema.parse(generated.data), meta: generated.meta };
      },
    });
    return { grammar, ...polished, polishPromptVersion: PROMPTS.polish };
  }

  async polish(userId: string | undefined, requestId: string, input: PolishRequest, signal?: AbortSignal): Promise<PolishResult> {
    await this.requireConsent(userId);
    const rules = await this.assets.promptRules('polish', [input.correctedText ?? input.transcript, input.questionText]);
    const result = await this.run({
      userId, requestId, capability: 'polish', model: this.provider.textModel(), promptVersion: PROMPTS.polish, units: 2,
      action: async () => {
        const generated = await this.provider.generateJson<unknown>(rules, JSON.stringify({ task: 'Preserve the learner original meaning. Produce a natural, concise spoken civil aviation expression for comparison, not a standard answer.', input }), signal);
        return { data: polishResultSchema.parse(generated.data), meta: generated.meta };
      },
    });
    return { ...result, promptVersion: PROMPTS.polish };
  }
}
