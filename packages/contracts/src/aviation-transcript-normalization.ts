/** Presentation only. Never infer an answer, a missing word, or a corrected number. */
export const AVIATION_TRANSCRIPT_NORMALIZATION_VERSION = 'aviation-normalization:conservative-v1';
export const AVIATION_TRANSCRIPT_NORMALIZATION_RULES = [
  'Preserve raw recognition separately from presentation.',
  'Join only explicitly spelled, allowlisted aviation abbreviations.',
  'Format explicit flight levels and unambiguous digit sequences in bounded aviation contexts.',
  'Never correct grammar, polarity, direction, place names or inferred numbers.',
] as const;
export const AVIATION_TRANSCRIPT_NORMALIZATION_EXAMPLES = [
  { normalized: 'FL310', spoken: 'flight level 310' },
  { normalized: 'QNH 1013', spoken: 'Q N H one zero one three' },
] as const;
export type TranscriptNormalizationRisk = 'safe' | 'context-required' | 'guarded';
export type TranscriptTransformation = { after: string; before: string; ruleId: string; risk: TranscriptNormalizationRisk };
export type AviationTranscriptNormalizationResult = {
  transcript: string;
  transformations: TranscriptTransformation[];
  version: typeof AVIATION_TRANSCRIPT_NORMALIZATION_VERSION;
};
const ABBREVIATIONS = ['ATC', 'APU', 'QNH', 'QFE', 'ILS', 'IFR', 'VFR', 'VOR', 'NDB', 'RNAV', 'TCAS', 'NOTAM', 'RVSM', 'CPDLC', 'DME', 'FMS', 'VMC', 'IMC', 'RVR', 'RAIM', 'SELCAL'] as const;
// Deliberately exclude ASR lookalikes: to/too/tree/oh/power/flower/ait.
const DIGITS: Record<string, string> = {
  zero: '0', one: '1', two: '2', three: '3', four: '4', fower: '4',
  five: '5', fife: '5', six: '6', seven: '7', eight: '8', nine: '9', niner: '9',
};
const DIGIT = `(?:${Object.keys(DIGITS).join('|')})`;
const SEQUENCE = `${DIGIT}(?:[ \\t]+${DIGIT})*`;
// A following scale, decimal or ambiguous digit means the number is not complete.
const CONTINUATION = /^[ \t]+(?:hundred|thousand|million|point|decimal|oh|tree|to(?:o)?|power|flower|ait|\d)\b/i;

export type TranscriptSourceSpan = { start: number; end: number };
function normalizeWithSource(input: string): AviationTranscriptNormalizationResult & { sourceSpans: TranscriptSourceSpan[] } {
  let transcript = input;
  const transformations: TranscriptTransformation[] = [];
  let sourceSpans: TranscriptSourceSpan[] = Array.from({ length: input.length }, (_, start) => ({ start, end: start + 1 }));
  // Carry the original character spans through each exact replacement. Common
  // prefixes/suffixes keep their precise spans; collapsed words cover their full source.
  function replace(value: string, expression: RegExp, replacement: string | ((match: RegExpExecArray) => string)) {
    let output = ''; let cursor = 0; const next: TranscriptSourceSpan[] = [];
    for (const match of value.matchAll(expression)) {
      const offset = match.index; const before = match[0];
      const after = typeof replacement === 'string' ? replacement : replacement(match);
      output += value.slice(cursor, offset) + after;
      next.push(...sourceSpans.slice(cursor, offset));
      let prefix = 0; let suffix = 0;
      while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix++;
      while (suffix < before.length - prefix && suffix < after.length - prefix && before[before.length - suffix - 1] === after[after.length - suffix - 1]) suffix++;
      next.push(...sourceSpans.slice(offset, offset + prefix));
      const source = sourceSpans.slice(offset + prefix, offset + before.length - suffix);
      const span = { start: source[0]?.start ?? sourceSpans[offset]?.start ?? offset, end: source.at(-1)?.end ?? sourceSpans[offset]?.end ?? offset };
      for (let index = prefix; index < after.length - suffix; index++) next.push(span);
      if (suffix) next.push(...sourceSpans.slice(offset + before.length - suffix, offset + before.length));
      cursor = offset + before.length;
    }
    output += value.slice(cursor); next.push(...sourceSpans.slice(cursor)); sourceSpans = next;
    return output;
  }
  const apply = (ruleId: string, transform: (value: string) => string) => {
    const before = transcript;
    transcript = transform(before);
    if (before !== transcript) transformations.push({ before, after: transcript, ruleId, risk: 'context-required' });
  };
  apply('explicit-aviation-abbreviations', (value) => {
    for (const abbreviation of ABBREVIATIONS) {
      const letters = abbreviation.split('').join('[ \\t.]+');
      value = replace(value, new RegExp(`\\b(?:${abbreviation}|${letters})\\b`, 'gi'), abbreviation);
    }
    return value;
  });
  apply('explicit-digit-sequences', (value) => replace(value,
    new RegExp(`\\b(flight level|FL|heading|squawk|QNH|QFE|runway)[ \\t]+(${SEQUENCE})\\b`, 'gi'),
    (matched) => {
      const match = matched[0]; const context = matched[1]!; const spoken = matched[2]!; const offset = matched.index; const whole = matched.input;
      const words = spoken.toLowerCase().split(/[ \t]+/);
      const digits = words.map((word) => DIGITS[word]).join('');
      const key = context.toLowerCase();
      const validLength = key === 'squawk' || key === 'qnh' || key === 'qfe'
        ? words.length === 4 : key === 'runway' ? words.length === 2 : words.length >= 2 && words.length <= 3;
      const tail = whole.slice(offset + match.length);
      if (!validLength || CONTINUATION.test(tail) || /^[.,]\d/.test(tail)) return match;
      // Squawk is octal; invalid spoken values are left verbatim, never repaired.
      if (key === 'squawk' && /[89]/.test(digits)) return match;
      return `${context} ${digits}`;
    },
  ));
  apply('explicit-flight-level', (value) => replace(value,
    /\b(?:flight level|FL)[ \t]+(\d{2,3})\b/gi,
    (matched) => {
      const match = matched[0]; const digits = matched[1]!; const offset = matched.index; const whole = matched.input;
      const tail = whole.slice(offset + match.length);
      if (/^[.,]\d/.test(tail) || CONTINUATION.test(tail)) return match;
      return `FL${digits}`;
    },
  ));
  return { transcript, transformations, version: AVIATION_TRANSCRIPT_NORMALIZATION_VERSION, sourceSpans };
}
export function normalizeAviationTranscriptDetailed(input: string): AviationTranscriptNormalizationResult {
  const { sourceSpans: _sourceSpans, ...result } = normalizeWithSource(input);
  return result;
}
export const normalizeAviationTranscriptWithSource = normalizeWithSource;
export function normalizeAviationTranscript(input: string): string {
  return normalizeAviationTranscriptDetailed(input).transcript;
}
