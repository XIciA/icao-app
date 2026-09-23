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

const learningFields = {
  analysisVersion: z.literal(2).optional(),
  source: z.object({
    bankId: z.enum(['radiotelephony', 'storytelling', 'opi']),
    categoryId: z.string().trim().min(1).max(160), topicId: z.string().trim().min(1).max(160),
    version: z.number().int().positive(), checksum: z.string().regex(/^[a-f0-9]{64}$/u),
  }).strict().optional(),
  resumeOperationId: z.string().uuid().optional(),
};
function validLearningSource(value: { analysisVersion?: 2; source?: z.infer<typeof learningFields.source>; mode: string; module: string; resumeOperationId?: string }) {
  if (!value.analysisVersion) return !value.source && !value.resumeOperationId;
  const bank = { atc: 'radiotelephony', story: 'storytelling', opi: 'opi' }[value.module];
  return value.source?.bankId === bank && (value.module === 'opi') === (value.mode === 'opi');
}

export const reviewSchema = z.object({
  ...learningFields,
  mode: z.enum(['grammar', 'opi']),
  module: z.enum(['atc', 'story', 'opi']),
  questionId: z.string().trim().min(1).max(160),
  transcript: z.string().trim().min(1).max(12000),
}).strict().refine(validLearningSource, 'invalid_learning_source').superRefine((value, context) => {
  if (!value.analysisVersion && value.transcript.length > 4000) {
    context.addIssue({ code: 'custom', message: 'legacy_transcript_too_long', path: ['transcript'] });
  }
  if (value.mode === 'opi' && value.module !== 'opi') {
    context.addIssue({ code: 'custom', message: 'opi_mode_requires_opi_module', path: ['module'] });
  }
});

export const transcribeReviewSchema = z.object({
  ...learningFields,
  mode: z.enum(['grammar', 'opi']), module: z.enum(['atc', 'story', 'opi']),
  questionId: z.string().trim().min(1).max(160),
}).strict().refine(validLearningSource, 'invalid_learning_source').refine((value) => !value.resumeOperationId, 'resume_requires_text').refine((value) => value.mode !== 'opi' || value.module === 'opi', { path: ['module'], message: 'opi_mode_requires_opi_module' });

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
