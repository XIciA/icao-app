import { describe, expect, it } from 'vitest';

import { feedbackSubmissionSchema } from '../src/feedback/feedback.schemas';
import { validateFeedbackImage } from '../src/feedback/feedback-image';
import {
  diagnosticsExpirationForSubmission,
  parseUserAgent,
  retentionAtForFeedback,
} from '../src/feedback/feedback.service';

const payload = {
  clientSubmissionId: '00000000-0000-4000-8000-000000000123',
  category: 'feature_suggestion',
  description: '希望增加一个新的练习功能',
  source: 'profile',
  sourceRoute: '/profile?from=test',
  appDisplayVersion: '1.0.0',
  platform: 'web',
} as const;

describe('feedback submission validation', () => {
  it.each(['feature_suggestion', 'content_correction', 'other'] as const)('accepts category %s', (category) => {
    expect(feedbackSubmissionSchema.safeParse({ ...payload, category }).success).toBe(true);
  });

  it('accepts semantic display versions and rejects the legacy date-build format', () => {
    expect(feedbackSubmissionSchema.safeParse({ ...payload, appDisplayVersion: '1.0.1' }).success).toBe(true);
    expect(feedbackSubmissionSchema.safeParse({ ...payload, appDisplayVersion: 'v2026.07.23.1331' }).success).toBe(false);
  });

  it('trims descriptions, optional contact, and query strings', () => {
    const result = feedbackSubmissionSchema.parse({
      ...payload,
      description: '  有效反馈内容  ',
      contact: '  learner@example.com  ',
    });
    expect(result.description).toBe('有效反馈内容');
    expect(result.contact).toBe('learner@example.com');
    expect(result.sourceRoute).toBe('/profile');
  });

  it('requires 5–500 trimmed characters and a question for study feedback', () => {
    expect(feedbackSubmissionSchema.safeParse({ ...payload, description: ' 1234 ' }).success).toBe(false);
    expect(feedbackSubmissionSchema.safeParse({ ...payload, description: 'x'.repeat(501) }).success).toBe(false);
    expect(feedbackSubmissionSchema.safeParse({ ...payload, source: 'study' }).success).toBe(false);
    expect(feedbackSubmissionSchema.safeParse({
      ...payload,
      source: 'study',
      category: 'content_correction',
      question: { bankId: 'listening', categoryId: 'part-a', topicId: 'topic-a', cardId: 'card-a' },
    }).success).toBe(true);
  });

  it('accepts a bounded allowlisted diagnostic bundle for the same app and platform', () => {
    const result = feedbackSubmissionSchema.parse({
      ...payload,
      diagnostics: {
        schemaVersion: 1,
        feature: 'ai',
        correlationId: 'A-TEST-01',
        appVersion: payload.appDisplayVersion,
        build: '42',
        platform: payload.platform,
        osVersion: '19.0',
        events: [{
          offsetMs: 0,
          stage: 'api',
          code: 'ai_timeout',
          level: 'error',
          capability: 'grammar',
          requestId: 'req_test-1',
          retryable: true,
          httpStatus: 504,
        }],
      },
    });
    expect(result.diagnostics?.events[0]).toMatchObject({ code: 'ai_timeout', requestId: 'req_test-1' });
  });

  it('rejects diagnostic content, URIs, tokens, oversized traces, and mismatched metadata', () => {
    const diagnostics = {
      schemaVersion: 1,
      feature: 'recording',
      correlationId: 'R-TEST-01',
      appVersion: payload.appDisplayVersion,
      build: '42',
      platform: payload.platform,
      osVersion: '19.0',
      events: [{ offsetMs: 0, stage: 'prepare', code: 'prepare_failed', level: 'error' }],
    } as const;
    expect(feedbackSubmissionSchema.safeParse({ ...payload, diagnostics: {
      ...diagnostics,
      events: [{ ...diagnostics.events[0], content: 'private answer' }],
    } }).success).toBe(false);
    expect(feedbackSubmissionSchema.safeParse({ ...payload, diagnostics: {
      ...diagnostics,
      events: [{ ...diagnostics.events[0], uri: 'file:///private.m4a' }],
    } }).success).toBe(false);
    expect(feedbackSubmissionSchema.safeParse({ ...payload, diagnostics: {
      ...diagnostics,
      events: [{ ...diagnostics.events[0], token: 'secret' }],
    } }).success).toBe(false);
    expect(feedbackSubmissionSchema.safeParse({ ...payload, diagnostics: {
      ...diagnostics,
      events: Array.from({ length: 31 }, (_, offsetMs) => ({ ...diagnostics.events[0], offsetMs })),
    } }).success).toBe(false);
    expect(feedbackSubmissionSchema.safeParse({ ...payload, diagnostics: { ...diagnostics, platform: 'ios' } }).success).toBe(false);
    expect(feedbackSubmissionSchema.safeParse({ ...payload, diagnostics: { ...diagnostics, appVersion: '1.0.1' } }).success).toBe(false);
  });
});

describe('feedback diagnostic retention', () => {
  const createdAt = new Date('2026-08-14T00:00:00.000Z');

  it('uses the same 365-day retention instant for the ticket and submitted diagnostics', () => {
    const diagnostics = feedbackSubmissionSchema.parse({
      ...payload,
      diagnostics: {
        schemaVersion: 1,
        feature: 'ai',
        correlationId: 'A-TEST-01',
        appVersion: payload.appDisplayVersion,
        build: '42',
        platform: payload.platform,
        osVersion: '19.0',
        events: [{ offsetMs: 0, stage: 'api', code: 'ai_timeout', level: 'error' }],
      },
    }).diagnostics;

    const retentionAt = retentionAtForFeedback(createdAt);
    expect(retentionAt.toISOString()).toBe('2027-08-14T00:00:00.000Z');
    expect(diagnosticsExpirationForSubmission(createdAt, diagnostics)).toEqual(retentionAt);
    expect(diagnosticsExpirationForSubmission(createdAt, undefined)).toBeNull();
  });
});

describe('feedback image validation', () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
  const png = Buffer.from('89504e470d0a1a0a0000', 'hex');
  const webp = Buffer.from('524946460000000057454250', 'hex');

  it.each([
    [jpeg, 'image/jpeg', 'screen.jpeg', 'jpg'],
    [png, 'image/png', 'screen.png', 'png'],
    [webp, 'image/webp', 'screen.webp', 'webp'],
  ] as const)('accepts valid file signatures', (buffer, mime, name, extension) => {
    expect(validateFeedbackImage(buffer, mime, name)).toMatchObject({
      extension,
      mimeType: mime,
    });
  });

  it('rejects spoofed signatures, MIME types, extensions, empty and oversized files', () => {
    expect(validateFeedbackImage(Buffer.from('not an image'), 'image/png', 'screen.png')).toBeUndefined();
    expect(validateFeedbackImage(png, 'image/gif', 'screen.gif')).toBeUndefined();
    expect(validateFeedbackImage(png, 'image/png', 'screen.jpg')).toBeUndefined();
    expect(validateFeedbackImage(Buffer.alloc(0), 'image/jpeg', 'screen.jpg')).toBeUndefined();
    expect(validateFeedbackImage(Buffer.alloc(5 * 1024 * 1024 + 1, 0xff), 'image/jpeg', 'screen.jpg')).toBeUndefined();
  });
});

describe('feedback user agent context', () => {
  it('extracts browser and OS only from the server-visible user agent', () => {
    expect(parseUserAgent('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36')).toEqual({
      browserName: 'Chrome',
      browserVersion: '140.0.0.0',
      osName: 'Windows',
      osVersion: '10.0',
    });
    expect(parseUserAgent(undefined)).toEqual({});
  });
});

it('accepts exam reports for each bank and keeps hotspot clues separate',()=>{
 for(const category of ['listening','sentences900','radiotelephony','storytelling','opi']) {
  expect(feedbackSubmissionSchema.safeParse({...payload,source:'exam_report',category}).success).toBe(true);
  expect(feedbackSubmissionSchema.safeParse({...payload,category}).success).toBe(false);
 }
 expect(feedbackSubmissionSchema.safeParse({...payload,source:'opi_hotspot',category:'opi'}).success).toBe(true);
 expect(feedbackSubmissionSchema.safeParse({...payload,source:'opi_hotspot',category:'listening'}).success).toBe(false);
 expect(feedbackSubmissionSchema.safeParse({...payload,source:'exam_report'}).success).toBe(false);
});
