import type { AiReviewRequest, AiReviewResult, GrammarCorrectionIssue } from '@icao/contracts';

import { grammarCorrectionIssueSchema, reviewObject, reviewRows, reviewTextSchema } from './ai.schemas';
import { REVIEW_PROMPT_VERSION } from './deepseek-review-prompts';

type ReviewBody = Omit<AiReviewResult, 'promptVersion'>;

export function parseAndValidateReview(data: unknown, input: AiReviewRequest): ReviewBody {
  const candidate = reviewObject(data);
  const grammar = candidate.grammar && typeof candidate.grammar === 'object' && !Array.isArray(candidate.grammar)
    ? candidate.grammar as Record<string, unknown> : {};
  const issues = reviewRows(grammar.issues, grammarCorrectionIssueSchema);
  const correctedText = reviewTextSchema.parse(grammar.correctedText);
  const polishedText = input.mode === 'opi' ? reviewTextSchema.parse(candidate.polishedText) : '';
  // Do not turn a refusal, unknown object or entirely broken output into a clean,
  // chargeable analysis. A readable correction/feedback is sufficient otherwise.
  if (!correctedText.trim() && !polishedText.trim() && !issues.length) throw new Error('review_unreadable_result');
  return {
    grammar: { issues, correctedText: correctedText.trim() ? correctedText : input.transcript },
    ...(input.mode === 'opi' ? { polishedText: polishedText.trim() ? polishedText : correctedText.trim() ? correctedText : input.transcript } : {}),
  };
}

export function withReviewPromptVersion(result: ReviewBody): AiReviewResult {
  return { ...result, promptVersion: result.analysis ? 'deepseek-review:v2' : REVIEW_PROMPT_VERSION };
}

export function legacyIssueText(issue: GrammarCorrectionIssue) {
  return `“${issue.before}” → “${issue.after}”：${issue.reasonZh}`;
}
