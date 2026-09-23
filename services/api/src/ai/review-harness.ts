import type { AiReviewRequest, AiReviewResult, GrammarCorrectionIssue } from '@icao/contracts';

import { grammarModeReviewResultSchema, opiModeReviewResultSchema } from './ai.schemas';
import { REVIEW_PROMPT_VERSION } from './deepseek-review-prompts';

type ReviewBody = Omit<AiReviewResult, 'promptVersion'>;

function normalized(value: string) {
  return value.replace(/\s+/gu, ' ').trim();
}

function withoutNoOpIssues(data: unknown): unknown {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
  const grammar = (data as { grammar?: unknown }).grammar;
  if (!grammar || typeof grammar !== 'object' || Array.isArray(grammar)) return data;
  const issues = (grammar as { issues?: unknown }).issues;
  if (!Array.isArray(issues)) return data;

  return {
    ...data,
    grammar: {
      ...grammar,
      issues: issues.filter((issue) => {
        if (!issue || typeof issue !== 'object' || Array.isArray(issue)) return true;
        const { before, after } = issue as { before?: unknown; after?: unknown };
        if (typeof before !== 'string' || typeof after !== 'string') return true;
        return normalized(before).toLocaleLowerCase() !== normalized(after).toLocaleLowerCase();
      }),
    },
  };
}

function sortedMatches(value: string, pattern: RegExp) {
  return [...value.matchAll(pattern)].map((match) => match[0].toLocaleUpperCase()).sort();
}

function sameProtectedTokens(source: string, output: string) {
  const patterns = [
    /\b(?:FL\s?\d+|\d+(?:\.\d+)?)\b/giu,
    /\b[A-Z]{2,}\b/gu,
    // ASR may lowercase the airline name; casing alone does not change a callsign.
    /\b[A-Z][A-Za-z]+\s+\d+\b/giu,
    /\b[A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*\s+(?:Control|Approach|Tower|Ground|Departure|Center|Centre)\b/gu,
  ];
  return patterns.every((pattern) => JSON.stringify(sortedMatches(source, pattern)) === JSON.stringify(sortedMatches(output, pattern)));
}

const UNCERTAINTY = /\b(?:think|believe|may|might|could|maybe|perhaps|possibly|probably|likely|seems?|appears?)\b/iu;

export function assertProtectedMeaning(source: string, output: string) {
  if (!sameProtectedTokens(source, output)) throw new Error('review_protected_tokens_changed');
  if (UNCERTAINTY.test(source) && !UNCERTAINTY.test(output)) throw new Error('review_uncertainty_removed');
}

function includesSpan(text: string, span: string) {
  return normalized(text).toLocaleLowerCase().includes(normalized(span).toLocaleLowerCase());
}

function assertIssues(source: string, correctedText: string, issues: GrammarCorrectionIssue[]) {
  if (issues.length === 0) {
    if (normalized(correctedText) !== normalized(source)) throw new Error('review_no_issue_text_changed');
    return;
  }
  if (normalized(correctedText) === normalized(source)) throw new Error('review_issues_without_change');
  for (const issue of issues) {
    if (normalized(issue.before).toLocaleLowerCase() === normalized(issue.after).toLocaleLowerCase()) throw new Error('review_issue_without_change');
    if (!includesSpan(source, issue.before)) throw new Error('review_issue_source_missing');
    if (!includesSpan(correctedText, issue.after)) throw new Error('review_issue_replacement_missing');
  }
}

export function parseAndValidateReview(data: unknown, input: AiReviewRequest): ReviewBody {
  const candidate = withoutNoOpIssues(data);
  if (input.mode === 'grammar') {
    const parsed = grammarModeReviewResultSchema.parse(candidate);
    assertIssues(input.transcript, parsed.grammar.correctedText, parsed.grammar.issues);
    assertProtectedMeaning(input.transcript, parsed.grammar.correctedText);
    return parsed;
  }
  const parsed = opiModeReviewResultSchema.parse(candidate);
  assertIssues(input.transcript, parsed.grammar.correctedText, parsed.grammar.issues);
  assertProtectedMeaning(input.transcript, parsed.grammar.correctedText);
  assertProtectedMeaning(input.transcript, parsed.polishedText);
  return parsed;
}

export function withReviewPromptVersion(result: ReviewBody): AiReviewResult {
  return { ...result, promptVersion: result.analysis ? 'deepseek-review:v2' : REVIEW_PROMPT_VERSION };
}

export function legacyIssueText(issue: GrammarCorrectionIssue) {
  return `“${issue.before}” → “${issue.after}”：${issue.reasonZh}`;
}
