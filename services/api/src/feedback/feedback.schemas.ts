import { z } from 'zod';

const identifier = z.string().trim().min(1).max(160);

export const feedbackSubmissionSchema = z.object({
  clientSubmissionId: z.string().uuid(),
  category: z.enum(['feature_suggestion', 'content_correction', 'other']),
  description: z.string().trim().min(5).max(500),
  contact: z.string().trim().max(100).optional().transform((value) => value || undefined),
  source: z.enum(['profile', 'study']),
  sourceRoute: z.string().trim().min(1).max(500).transform((value) => value.split(/[?#]/u, 1)[0] || '/'),
  appDisplayVersion: z.string().regex(/^v\d{4}\.\d{2}\.\d{2}\.\d{4}$/u),
  platform: z.enum(['web', 'ios', 'android']),
  osName: z.string().trim().max(80).optional(),
  osVersion: z.string().trim().max(80).optional(),
  question: z.object({
    bankId: identifier,
    categoryId: identifier,
    topicId: identifier,
    cardId: identifier,
  }).optional(),
  error: z.object({
    code: z.string().trim().min(1).max(120),
    requestId: z.string().trim().min(1).max(160).optional(),
  }).optional(),
}).superRefine((value, context) => {
  if (value.source === 'study' && !value.question) {
    context.addIssue({ code: 'custom', message: 'study_feedback_requires_question', path: ['question'] });
  }
});

