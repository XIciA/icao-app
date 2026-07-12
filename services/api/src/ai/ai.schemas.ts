import { z } from 'zod';

export const moduleSchema = z.enum(['listening', 'sentence900', 'atc', 'opi', 'story']);

export const consentSchema = z.object({
  accepted: z.literal(true),
  policyVersion: z.string().trim().min(1).max(40),
}).strict();

export const wordLookupSchema = z.object({
  module: moduleSchema,
  questionId: z.string().trim().min(1).max(160),
  word: z.string().trim().min(1).max(80),
  sentence: z.string().trim().min(1).max(1200),
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

export const wordLookupResultSchema = z.object({
  definition: z.string().trim().min(1).max(800),
  contextExplanationZh: z.string().trim().min(1).max(1200),
}).strict();

export const grammarResultSchema = z.object({
  overallFeedbackZh: z.string().trim().min(1).max(1200),
  correctedText: z.string().trim().min(1).max(5000),
  issues: z.array(z.string().trim().min(1).max(1200)).max(30),
}).strict();

export const polishResultSchema = z.object({
  polishedText: z.string().trim().min(1).max(5000),
}).strict();
