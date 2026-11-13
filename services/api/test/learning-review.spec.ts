import { describe, expect, it } from 'vitest';
import { UnprocessableEntityException } from '@nestjs/common';
import { learningReviewMaterials, learningReviewPrompt, validateLearningReview } from '../src/ai/learning-review';
import { reviewSchema } from '../src/ai/ai.schemas';

const input = { module: 'atc' as const, mode: 'grammar' as const, questionId: 'q2', transcript: 'Turning right heading 270, CCA123.' };
const materials = { questionText: 'CCA123, turn left heading 270, QNH 1013.', contextText: '', referenceText: '', hasUnseenImage: false };
const result = { grammarErrors: [], missingInformation: [{ sourceQuote: 'QNH 1013', reasonZh: '缺少气压值复诵' }],
  incorrectInformation: [{ sourceQuote: 'turn left', answerQuote: 'Turning right', reasonZh: '转向与指令不符' }], extraInformation: [] };
describe('learning review v2', () => {
  it('preserves v1 compatibility and requires a server-resolvable matching source for v2', () => {
    expect(reviewSchema.safeParse(input).success).toBe(true);
    expect(reviewSchema.safeParse({ ...input, transcript: '  ' }).success).toBe(false);
    expect(reviewSchema.safeParse({ ...input, transcript: 'x' }).success).toBe(true);
    expect(reviewSchema.safeParse({ ...input, analysisVersion: 2 }).success).toBe(false);
    expect(reviewSchema.safeParse({ ...input, analysisVersion: 2, source: { bankId: 'opi', categoryId: 'c', topicId: 't', version: 1, checksum: 'a'.repeat(64) } }).success).toBe(false);
    expect(reviewSchema.safeParse({ ...input, module: 'opi', analysisVersion: 2, source: { bankId: 'opi', categoryId: 'c', topicId: 't', version: 1, checksum: 'a'.repeat(64) } }).success).toBe(false);
  });
  it('returns distinct categories without vetoing evidence or extra fields', () => {
    expect(validateLearningReview(result, input, materials).analysis).toEqual({ module: 'atc', ...result });
    expect(validateLearningReview({ ...result, incorrectInformation: [{ ...result.incorrectInformation[0], answerQuote: 'turning RIGHT' }] }, input, materials).analysis).toMatchObject({ incorrectInformation: [{ answerQuote: 'turning RIGHT' }] });
    expect(validateLearningReview({ ...result, missingInformation: [{ sourceQuote: 'Runway 27', reasonZh: 'Missing runway' }] }, input, materials).analysis).toMatchObject({ missingInformation: [{ sourceQuote: 'Runway 27', reasonZh: 'Missing runway' }] });
    expect(validateLearningReview({ ...result, score: 90 }, input, materials).analysis).toEqual({ module: 'atc', ...result });
  });
  it('keeps source limitations and model failures separate from a clean analysis', () => {
    for (const code of ['invalid_answer', 'insufficient_material']) {
      let caught: unknown;
      try { validateLearningReview({ error: { code, reasonZh: '回答无法分析' } }, input, materials); } catch (error) { caught = error; }
      expect(caught).toBeInstanceOf(Error);
      expect(caught).not.toBeInstanceOf(UnprocessableEntityException);
    }
    expect(() => learningReviewMaterials(input, { cards: [{ id: 'other', audioText: 'text' }] })).toThrow('ai_insufficient_material');
    expect(learningReviewPrompt('opi')).toContain('hasUnseenImage=true');
  });
  it.each(['My life.', 'FL310.', 'x', '???', '不知道'])('accepts evidence-backed missing-information feedback for %s', (transcript) => {
    const feedback = { grammarErrors: [], missingInformation: [{ sourceQuote: 'QNH 1013', reasonZh: '回答没有复诵题目要求的气压值' }], incorrectInformation: [], extraInformation: [] };
    expect(validateLearningReview(feedback, { ...input, transcript }, materials).analysis).toEqual({ module: 'atc', ...feedback });
  });
  it('accepts OPI relevance feedback while preserving an uninterpretable answer', () => {
    const feedback = { grammarErrors: [], offTopic: { questionQuote: materials.questionText, answerQuote: '???', reasonZh: '尚未回应题目明确要求' }, polishedText: '???' };
    expect(validateLearningReview(feedback, { ...input, module: 'opi', mode: 'opi', transcript: '???' }, materials).analysis).toEqual({ module: 'opi', ...feedback });
  });
  it('uses preceding scenario turns, never future turns or unrelated scoring-point questions', () => {
    const cards = [{ id: 'q1', audioText: 'Callsign CCA123.' }, { id: 'q2', audioText: 'Descend 3000 feet.' }, { id: 'q3', audioText: 'Cleared to land.' }];
    expect(learningReviewMaterials(input, { cards }).contextText).toBe('Callsign CCA123.');
    expect(learningReviewMaterials(input, { cards, practiceKind: 'scoring-points' }).contextText).toBe('');
  });
  it('accepts an OPI polish changing protected numbers', () => {
    expect(validateLearningReview({ offTopic: null, grammarErrors: [], polishedText: 'We have 300 passengers.' },
      { ...input, module: 'opi', mode: 'opi', transcript: 'We have 200 passengers.' }, materials).polishedText).toBe('We have 300 passengers.');
  });
});

describe('learning review partial output compatibility', () => {
  it.each(['atc', 'story', 'opi'] as const)('keeps a screenshot-style correction and partial English rows for %s', (module) => {
    const feedback = { grammarErrors: [null, {}, { before: 'with hitting 060', after: 'with heading 060', reasonZh: 'Correct the word.' }], unexpected: true };
    const output = validateLearningReview(feedback, { ...input, module, transcript: 'with hitting 060' }, materials);
    expect(output.analysis?.grammarErrors).toEqual([feedback.grammarErrors[2]]);
    expect(output.grammar.correctedText).toBe('with hitting 060');
    if (module === 'opi') expect(output.polishedText).toBe('with hitting 060');
    else expect(output.analysis).toMatchObject({ missingInformation: [], incorrectInformation: [], extraInformation: [] });
  });
  it('accepts long rows, singleton objects, numeric quotes and unchanged corrections', () => {
    const rows = Array.from({ length: 50 }, () => ({ before: 'X'.repeat(700), after: 'X'.repeat(700), reasonZh: 'No change' }));
    const output = validateLearningReview({ grammarErrors: rows, missingInformation: { sourceQuote: 60, reasonZh: 'x'.repeat(1400) } }, input, materials);
    expect(output.analysis?.grammarErrors).toEqual(rows);
    expect(output.analysis).toMatchObject({ missingInformation: [{ sourceQuote: '60', reasonZh: 'x'.repeat(1400) }] });
  });
  it('preserves an explicit clean result but does not mislabel broken output as clean', () => {
    const empty = { grammarErrors: [], missingInformation: [], incorrectInformation: [], extraInformation: [] };
    expect(validateLearningReview(empty, input, materials).analysis).toEqual({ module: 'atc', ...empty });
    for (const value of [{}, { grammarErrors: [] }, { ...empty, grammarErrors: [null, {}] }, { missingInformation: 'bad shape' }]) {
      expect(() => validateLearningReview(value, input, materials)).toThrow();
    }
  });
});
