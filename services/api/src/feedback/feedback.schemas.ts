import { z } from 'zod';

const identifier = z.string().trim().min(1).max(160);
const safeIdentifier = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9:_-]{0,159}$/u);
const stableCode = z.string().regex(/^[a-z][a-z0-9_]{0,119}$/u);
const appDisplayVersion = z.string().regex(/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u);

const feedbackDiagnosticEventSchema = z.object({
  offsetMs: z.number().int().min(0).max(24 * 60 * 60 * 1_000),
  stage: stableCode,
  code: stableCode,
  level: z.enum(['info', 'warning', 'error']),
  durationMs: z.number().int().min(0).max(24 * 60 * 60 * 1_000).optional(),
  byteSize: z.number().int().min(0).max(2_147_483_647).optional(),
  format: z.enum(['m4a', 'wav', 'unknown']).optional(),
  owner: z.enum(['radio', 'study', 'recording', 'recordingPlayback']).optional(),
    recorderState: z.enum(['idle', 'prepared', 'preparing', 'recording', 'stopping', 'unknown']).optional(),
  meteringDetected: z.boolean().optional(),
  mediaServicesDidReset: z.boolean().optional(),
  canRecord: z.boolean().optional(),
  isRecording: z.boolean().optional(),
  capability: z.enum(['transcribe', 'grammar', 'polish']).optional(),
  requestId: safeIdentifier.optional(),
  retryable: z.boolean().optional(),
  httpStatus: z.number().int().min(100).max(599).optional(),
  attempt: z.number().int().min(1).max(10).optional(),
}).strict();

const feedbackDiagnosticBundleSchema = z.object({
  schemaVersion: z.literal(1),
  feature: z.enum(['recording', 'ai']),
  correlationId: safeIdentifier,
  appVersion: appDisplayVersion,
  build: z.string().trim().min(1).max(80).regex(/^[A-Za-z0-9._-]+$/u),
  platform: z.enum(['web', 'ios', 'android']),
  osVersion: z.string().trim().min(1).max(80),
  events: z.array(feedbackDiagnosticEventSchema).min(1).max(30),
}).strict().superRefine((value, context) => {
  if (!value.events.some((event) => event.level === 'error')) {
    context.addIssue({ code: 'custom', message: 'diagnostics_require_failure', path: ['events'] });
  }
});

export const feedbackSubmissionSchema = z.object({
  clientSubmissionId: z.string().uuid(),
  category: z.enum(['feature_suggestion', 'content_correction', 'other']),
  description: z.string().trim().min(5).max(500),
  contact: z.string().trim().max(100).optional().transform((value) => value || undefined),
  source: z.enum(['profile', 'study']),
  sourceRoute: z.string().trim().min(1).max(500).transform((value) => value.split(/[?#]/u, 1)[0] || '/'),
  appDisplayVersion,
  platform: z.enum(['web', 'ios', 'android']),
  osName: z.string().trim().max(80).optional(),
  osVersion: z.string().trim().max(80).optional(),
  question: z.object({
    bankId: identifier,
    categoryId: identifier,
    topicId: identifier,
    cardId: identifier,
    bankVersion: z.number().int().positive().optional(),
    bankChecksum: z.string().regex(/^[a-f0-9]{64}$/u).optional(),
  }).optional(),
  error: z.object({
    code: z.string().trim().min(1).max(120),
    requestId: z.string().trim().min(1).max(160).optional(),
  }).optional(),
  diagnostics: feedbackDiagnosticBundleSchema.optional(),
}).strict().superRefine((value, context) => {
  if (value.source === 'study' && !value.question) {
    context.addIssue({ code: 'custom', message: 'study_feedback_requires_question', path: ['question'] });
  }
  if (value.diagnostics && value.diagnostics.platform !== value.platform) {
    context.addIssue({ code: 'custom', message: 'diagnostics_platform_mismatch', path: ['diagnostics', 'platform'] });
  }
  if (value.diagnostics && value.diagnostics.appVersion !== value.appDisplayVersion) {
    context.addIssue({ code: 'custom', message: 'diagnostics_version_mismatch', path: ['diagnostics', 'appVersion'] });
  }
});

export const feedbackReplySchema = z.object({
  status: z.enum(['received', 'processing', 'resolved']),
  text: z.string().trim().max(1000).optional(),
  clientReplyId: z.string().uuid(),
}).strict();
