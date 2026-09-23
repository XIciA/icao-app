import { describe, expect, it } from 'vitest';
import { learningReviewMaterials, learningReviewPrompt, validateLearningReview } from '../src/ai/learning-review';
import { reviewSchema } from '../src/ai/ai.schemas';

const input = { module: 'atc' as const, mode: 'grammar' as const, questionId: 'q2', transcript: 'Turning right heading 270, CCA123.' };
const materials = { questionText: 'CCA123, turn left heading 270, QNH 1013.', contextText: '', referenceText: '', hasUnseenImage: false };
const result = { grammarErrors: [], missingInformation: [{ sourceQuote: 'QNH 1013', reasonZh: '缺少气压值复诵' }],
  incorrectInformation: [{ sourceQuote: 'turn left', answerQuote: 'Turning right', reasonZh: '转向与指令不符' }], extraInformation: [] };
describe('learning review v2', () => {
  it('preserves v1 compatibility and requires a server-resolvable matching source for v2', () => {
    expect(reviewSchema.safeParse(input).success).toBe(true);
    expect(reviewSchema.safeParse({ ...input, analysisVersion: 2 }).success).toBe(false);
    expect(reviewSchema.safeParse({ ...input, analysisVersion: 2, source: { bankId: 'opi', categoryId: 'c', topicId: 't', version: 1, checksum: 'a'.repeat(64) } }).success).toBe(false);
    expect(reviewSchema.safeParse({ ...input, module: 'opi', analysisVersion: 2, source: { bankId: 'opi', categoryId: 'c', topicId: 't', version: 1, checksum: 'a'.repeat(64) } }).success).toBe(false);
  });
  it('validates evidence and returns distinct categories without a score or story rewrite', () => {
    expect(validateLearningReview(result, input, materials).analysis).toEqual({ module: 'atc', ...result });
    expect(() => validateLearningReview({ ...result, incorrectInformation: [{ ...result.incorrectInformation[0], answerQuote: 'turning RIGHT' }] }, input, materials)).toThrow();
    expect(() => validateLearningReview({ ...result, missingInformation: [{ sourceQuote: 'Runway 27', reasonZh: '遗漏跑道' }] }, input, materials)).toThrow();
    expect(() => validateLearningReview({ ...result, score: 90 }, input, materials)).toThrow();
  });
  it('keeps source limitations and model failures separate from a clean analysis', () => {
    expect(() => validateLearningReview({ error: { code: 'invalid_answer', reasonZh: '回答无法分析' } }, input, materials)).toThrow('ai_invalid_answer');
    expect(() => learningReviewMaterials(input, { cards: [{ id: 'other', audioText: 'text' }] })).toThrow('ai_insufficient_material');
    expect(learningReviewPrompt('opi')).toContain('hasUnseenImage=true');
  });
  it('uses preceding scenario turns, never future turns or unrelated scoring-point questions', () => {
    const cards = [{ id: 'q1', audioText: 'Callsign CCA123.' }, { id: 'q2', audioText: 'Descend 3000 feet.' }, { id: 'q3', audioText: 'Cleared to land.' }];
    expect(learningReviewMaterials(input, { cards }).contextText).toBe('Callsign CCA123.');
    expect(learningReviewMaterials(input, { cards, practiceKind: 'scoring-points' }).contextText).toBe('');
  });
  it('rejects an OPI polish changing protected numbers', () => {
    expect(() => validateLearningReview({ offTopic: null, grammarErrors: [], polishedText: 'We have 300 passengers.' },
      { ...input, module: 'opi', mode: 'opi', transcript: 'We have 200 passengers.' }, materials)).toThrow();
  });
});
