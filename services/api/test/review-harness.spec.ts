import { describe, expect, it } from 'vitest';

import { reviewSchema } from '../src/ai/ai.schemas';
import { parseAndValidateReview } from '../src/ai/review-harness';

describe('review harness', () => {
  it('accepts a structured grammar correction while preserving aviation tokens', () => {
    expect(parseAndValidateReview({
      grammar: {
        issues: [{ before: 'We was', after: 'We were', reasonZh: '主语 We 应使用 were。' }],
        correctedText: 'We were maintaining FL180 on heading 270.',
      },
    }, {
      mode: 'grammar', module: 'atc', questionId: 'q-1', transcript: 'We was maintaining FL180 on heading 270.',
    })).toEqual({
      grammar: {
        issues: [{ before: 'We was', after: 'We were', reasonZh: '主语 We 应使用 were。' }],
        correctedText: 'We were maintaining FL180 on heading 270.',
      },
    });
  });

  it('rejects changed numbers, acronyms, callsigns, or removed uncertainty', () => {
    const input = { mode: 'opi' as const, module: 'opi' as const, questionId: 'q-2', transcript: 'I think Speedbird 123 may maintain FL180 with ATC.' };
    expect(() => parseAndValidateReview({
      grammar: { issues: [], correctedText: input.transcript },
      polishedText: 'Speedbird 456 will maintain FL190 with ATC.',
    }, input)).toThrow();
  });

  it('rejects a changed named control unit', () => {
    expect(() => parseAndValidateReview({
      grammar: { issues: [], correctedText: 'We told Shanghai Control.' },
      polishedText: 'We informed Beijing Control.',
    }, {
      mode: 'opi', module: 'opi', questionId: 'q-control', transcript: 'We told Shanghai Control.',
    })).toThrow('review_protected_tokens_changed');
  });

  it('requires exact unchanged grammar text when there are no issues', () => {
    expect(() => parseAndValidateReview({
      grammar: { issues: [], correctedText: 'I informed ATC.' },
    }, {
      mode: 'grammar', module: 'opi', questionId: 'q-3', transcript: 'I told ATC.',
    })).toThrow('review_no_issue_text_changed');
  });

  it('removes no-op issue annotations while preserving real corrections', () => {
    expect(parseAndValidateReview({
      grammar: {
        issues: [
          { before: 'encounter', after: 'encountered', reasonZh: '应使用过去时。' },
          { before: 'turbulence', after: 'turbulence', reasonZh: '保持原样。' },
        ],
        correctedText: 'Yesterday we encountered turbulence.',
      },
    }, {
      mode: 'grammar', module: 'opi', questionId: 'q-5', transcript: 'Yesterday we encounter turbulence.',
    })).toEqual({
      grammar: {
        issues: [{ before: 'encounter', after: 'encountered', reasonZh: '应使用过去时。' }],
        correctedText: 'Yesterday we encountered turbulence.',
      },
    });
  });

  it('still rejects changed text when only no-op issue annotations remain', () => {
    expect(() => parseAndValidateReview({
      grammar: {
        issues: [{ before: 'turbulence', after: 'turbulence', reasonZh: '保持原样。' }],
        correctedText: 'Yesterday we encountered turbulence.',
      },
    }, {
      mode: 'grammar', module: 'opi', questionId: 'q-6', transcript: 'Yesterday we encounter turbulence.',
    })).toThrow('review_no_issue_text_changed');
  });

  it('requires OPI mode to use the OPI module', () => {
    expect(reviewSchema.safeParse({ mode: 'opi', module: 'atc', questionId: 'q-4', transcript: 'Ready.' }).success).toBe(false);
  });
});
