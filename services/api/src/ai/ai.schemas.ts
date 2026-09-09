import { z } from 'zod';
import { CURRENT_AI_CONSENT_FLOW_REVISION, CURRENT_AI_CONSENT_POLICY_VERSION } from '@icao/contracts';

export const consentChallengeSchema = z.object({
  policyVersion: z.literal(CURRENT_AI_CONSENT_POLICY_VERSION),
  flowRevision: z.literal(CURRENT_AI_CONSENT_FLOW_REVISION),
}).strict();

export const consentSchema = z.object({
  accepted: z.literal(true),
  policyVersion: z.literal(CURRENT_AI_CONSENT_POLICY_VERSION),
  flowRevision: z.literal(CURRENT_AI_CONSENT_FLOW_REVISION).optional(),
  challenge: z.string().trim().min(32).max(128).optional(),
}).strict();

export const grammarSchema = z.object({
  module: z.enum(['atc', 'story', 'opi']),
  questionId: z.string().trim().min(1).max(160),
  questionText: z.string().trim().min(1).max(1200),
  transcript: z.string().trim().min(1).max(4000),
}).strict();

export const polishSchema = z.object({
  module: z.literal('opi'),
  questionId: z.string().trim().min(1).max(160),
  questionText: z.string().trim().min(1).max(1200),
  transcript: z.string().trim().min(1).max(4000),
  correctedText: z.string().trim().min(1).max(5000).optional(),
}).strict();

export const reviewSchema = z.object({
  mode: z.enum(['grammar', 'opi']),
  module: z.enum(['atc', 'story', 'opi']),
  questionId: z.string().trim().min(1).max(160),
  transcript: z.string().trim().min(1).max(4000),
}).strict().superRefine((value, context) => {
  if (value.mode === 'opi' && value.module !== 'opi') {
    context.addIssue({ code: 'custom', message: 'opi_mode_requires_opi_module', path: ['module'] });
  }
});

export const transcribeReviewSchema = z.object({
  mode: z.enum(['grammar', 'opi']), module: z.enum(['atc', 'story', 'opi']),
  questionId: z.string().trim().min(1).max(160),
}).strict().refine((value) => value.mode !== 'opi' || value.module === 'opi', { path: ['module'], message: 'opi_mode_requires_opi_module' });

export const grammarResultSchema = z.object({
  correctedText: z.string().trim().min(1).max(5000),
  issues: z.array(z.string().trim().min(1).max(1200)).max(30),
}).strict();

export const polishResultSchema = z.object({
  polishedText: z.string().trim().min(1).max(5000),
}).strict();

export const grammarCorrectionIssueSchema = z.object({
  before: z.string().trim().min(1).max(500),
  after: z.string().trim().min(1).max(500),
  reasonZh: z.string().trim().min(1).max(500).refine((value) => /[\u3400-\u9fff]/u.test(value), 'reason_must_be_chinese'),
}).strict();

export const grammarCorrectionSchema = z.object({
  issues: z.array(grammarCorrectionIssueSchema).max(30),
  correctedText: z.string().trim().min(1).max(5000),
}).strict();

export const grammarModeReviewResultSchema = z.object({
  grammar: grammarCorrectionSchema,
}).strict();

export const opiModeReviewResultSchema = z.object({
  grammar: grammarCorrectionSchema,
  polishedText: z.string().trim().min(1).max(5000),
}).strict();
