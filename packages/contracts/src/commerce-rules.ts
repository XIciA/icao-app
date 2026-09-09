import type { AiReviewRequest, AiReviewResult, GrammarReviewResult, PolishResult, TranscribeResult } from './index';

/** Public allowance display, and the separate administrator-only rule contract. */
export type AiAllowanceMode = 'weekly' | 'trial' | 'expired' | 'unavailable';

export type AiAllowanceSummary = {
  mode: AiAllowanceMode;
  remainingPercent: number;
  resetAt: string | null;
  membershipExpiresAt: string | null;
  ruleVersion: string;
};

export type AiRuleCosts = {
  transcription: number;
  grammar_correction: number;
  opi_refinement: number;
  transcription_grammar: number;
  transcription_opi: number;
};

export type AiUsageRuleValues = {
  weeklyAllowance: number;
  trialAllowance: number;
  costs: AiRuleCosts;
};

export type AiUsageRuleVersion = AiUsageRuleValues & {
  id: string;
  effectiveAt: string;
  createdAt: string;
  actorId: string | null;
  previousVersionId: string | null;
};

export type AiRuleChangeImpact = {
  field: string;
  before: number;
  after: number;
  audience: 'eligible_new_accounts' | 'new_purchases' | 'all_members';
};

export type AiRulePublishRequest = AiUsageRuleValues & {
  expectedVersionId: string;
  effectiveAt: string;
  idempotencyKey: string;
};

export type AiRulePreview = {
  current: AiUsageRuleVersion;
  proposed: AiUsageRuleValues;
  effectiveAt: string;
  changes: AiRuleChangeImpact[];
};

export type AiRuleCatalog = {
  current: AiUsageRuleVersion;
  latestVersionId: string;
  versions: AiUsageRuleVersion[];
};

export type AiAllowanceResponse = {
  environment: 'production' | 'sandbox';
  serverTime: string;
  allowance: AiAllowanceSummary;
};

export type AiUsageOperationSummary = {
  operationId: string;
  ruleVersion: string;
  estimated: number;
  charged: number;
  remaining: number;
};
type WithUsage<T> = Omit<T, 'aiPoints'> & { aiPoints?: AiUsageOperationSummary };
export type MeteredAiReviewResult = WithUsage<AiReviewResult>;
export type MeteredTranscribeResult = WithUsage<TranscribeResult>;
export type MeteredGrammarReviewResult = WithUsage<GrammarReviewResult>;
export type MeteredPolishResult = WithUsage<PolishResult>;

export type TranscribeReviewRequest = Omit<AiReviewRequest, 'transcript'>;
export type TranscribeReviewResult = {
  transcript: string;
  review: Omit<AiReviewResult, 'aiPoints'>;
  aiPoints?: AiUsageOperationSummary;
};

/** Recovery reads an existing operation and never starts new provider work. */
export type AiOperationLookup =
  | { state: 'missing' | 'pending' | 'released' }
  | { state: 'completed'; capability: keyof AiRuleCosts;
      result: MeteredTranscribeResult | MeteredAiReviewResult | TranscribeReviewResult };
