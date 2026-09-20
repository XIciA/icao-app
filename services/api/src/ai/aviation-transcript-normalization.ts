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

export function normalizeAviationTranscriptDetailed(input: string): AviationTranscriptNormalizationResult {
  let transcript = input;
  const transformations: TranscriptTransformation[] = [];
  const apply = (ruleId: string, transform: (value: string) => string) => {
    const before = transcript;
    transcript = transform(before);
    if (before !== transcript) transformations.push({ before, after: transcript, ruleId, risk: 'context-required' });
  };
  apply('explicit-aviation-abbreviations', (value) => {
    for (const abbreviation of ABBREVIATIONS) {
      const letters = abbreviation.split('').join('[ \\t.]+');
      value = value.replace(new RegExp(`\\b(?:${abbreviation}|${letters})\\b`, 'gi'), abbreviation);
    }
    return value;
  });
  apply('explicit-digit-sequences', (value) => value.replace(
    new RegExp(`\\b(flight level|FL|heading|squawk|QNH|QFE|runway)[ \\t]+(${SEQUENCE})\\b`, 'gi'),
    (match: string, context: string, spoken: string, offset: number, whole: string) => {
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
  apply('explicit-flight-level', (value) => value.replace(
    /\b(?:flight level|FL)[ \t]+(\d{2,3})\b/gi,
    (match: string, digits: string, offset: number, whole: string) => {
      const tail = whole.slice(offset + match.length);
      if (/^[.,]\d/.test(tail) || CONTINUATION.test(tail)) return match;
      return `FL${digits}`;
    },
  ));
  return { transcript, transformations, version: AVIATION_TRANSCRIPT_NORMALIZATION_VERSION };
}
export function normalizeAviationTranscript(input: string): string {
  return normalizeAviationTranscriptDetailed(input).transcript;
}
