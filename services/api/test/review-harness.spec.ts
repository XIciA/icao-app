import { describe, expect, it } from 'vitest';
import { reviewSchema } from '../src/ai/ai.schemas';
import { parseAndValidateReview } from '../src/ai/review-harness';

const input = { mode: 'opi' as const, module: 'opi' as const, questionId: 'q', transcript: 'I think Speedbird 123 may maintain FL180 with ATC.' };
describe('review result compatibility without content vetoes', () => {
  it.each([
    'Speedbird 456 will maintain FL190 with atc.',
    'We informed Beijing Control.',
    'With heading 60.',
    'In my opinion, we should land.',
  ])('returns model wording without protected-token or uncertainty rejection: %s', (polishedText) => {
    expect(parseAndValidateReview({ grammar: { issues: [], correctedText: polishedText }, polishedText }, input))
      .toEqual({ grammar: { issues: [], correctedText: polishedText }, polishedText });
  });
  it('keeps no-op, non-exact, English and long feedback, without arbitrary row limits', () => {
    const issue = { before: 'not quoted', after: 'not quoted', reasonZh: 'English explanation '.repeat(100) };
    const issues = Array.from({ length: 50 }, () => issue);
    expect(parseAndValidateReview({ grammar: { issues, correctedText: input.transcript, score: 80 }, polishedText: 'New text', summary: 'extra' }, input))
      .toEqual({ grammar: { issues, correctedText: input.transcript }, polishedText: 'New text' });
  });
  it('retains usable partial feedback alongside malformed rows and defaults client fields', () => {
    const result = parseAndValidateReview({ grammar: { issues: [null, 42, {}, { reasonZh: 'Use the past tense.' }] } }, input);
    expect(result).toEqual({ grammar: { correctedText: input.transcript, issues: [{ before: '', after: '', reasonZh: 'Use the past tense.' }] }, polishedText: input.transcript });
    expect(parseAndValidateReview({ polishedText: 'A readable answer.' }, input).polishedText).toBe('A readable answer.');
  });
  it.each([null, [], {}, { error: 'refused' }, { grammar: {} }, { grammar: { issues: [null, {}] } }])('does not fabricate a clean result from %j', (data) => {
    expect(() => parseAndValidateReview(data, input)).toThrow();
  });
  it('keeps request boundaries and grammar-mode response compatibility', () => {
    expect(reviewSchema.safeParse({ ...input, module: 'atc' }).success).toBe(false);
    const result = parseAndValidateReview({ grammar: { correctedText: 'Changed.' }, polishedText: 'Unrequested.' }, { ...input, mode: 'grammar' });
    expect(result).toEqual({ grammar: { issues: [], correctedText: 'Changed.' } });
  });
});
