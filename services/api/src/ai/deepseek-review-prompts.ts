import type { AiReviewRequest } from '@icao/contracts';

export const REVIEW_PROMPT_VERSION = 'deepseek-review:v1' as const;

const SHARED_RULES = `Preserve meaning, facts, event order, and uncertainty. Copy digit-bearing tokens, callsigns, acronyms, proper names, and named control units exactly. Do not add information, scores, advice, or extra fields.`;

const GRAMMAR_PROMPT = `You correct clear English grammar, spelling, and punctuation errors only.
Return exactly one JSON object with this shape:
{"grammar":{"issues":[{"before":"exact incorrect source span","after":"replacement span","reasonZh":"brief Chinese reason"}],"correctedText":"complete corrected English text"}}
Do not polish correct wording or make the text more professional. If there is no clear error, return an empty issues array and copy the input exactly as correctedText. ${SHARED_RULES}`;

const OPI_PROMPT = `You perform two distinct tasks on one English speaking response.
Return exactly one JSON object with this shape:
{"grammar":{"issues":[{"before":"exact incorrect source span","after":"replacement span","reasonZh":"brief Chinese reason"}],"correctedText":"complete grammar-corrected English text"},"polishedText":"natural, clear spoken English"}
For grammar, correct only clear errors and do not polish; if none, copy the input exactly. For polishedText, make the smallest useful rewrite into concise professional spoken English. Keep a natural complete sentence unchanged unless there is a clear structural or aviation-expression improvement. Do not replace formal aviation wording with casual contractions or synonyms; keep phrases such as "were unable to" and "because of". ${SHARED_RULES}`;

export function reviewSystemPrompt(mode: AiReviewRequest['mode']) {
  return mode === 'grammar' ? GRAMMAR_PROMPT : OPI_PROMPT;
}
