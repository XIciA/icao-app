export const AVIATION_TRANSCRIPT_NORMALIZATION_RULES = [
  'Collapse repeated whitespace and trim transcript text.',
  'Normalize aviation abbreviations only on whole words.',
  'Collapse number words only in explicit aviation contexts.',
  'Keep learner grammar errors intact for downstream grammar-review.',
] as const;

export const AVIATION_TRANSCRIPT_NORMALIZATION_EXAMPLES = [
  { normalized: 'FL290', spoken: 'flight level two nine zero' },
  { normalized: 'runway 27L', spoken: 'runway two seven left' },
  { normalized: 'QNH 1013', spoken: 'QNH one zero one three' },
] as const;

export const AVIATION_TRANSCRIPT_NORMALIZATION_VERSION = 'aviation-normalization:v7';

export type TranscriptNormalizationRisk = 'safe' | 'context-required' | 'guarded';

export type TranscriptTransformation = {
  after: string;
  before: string;
  ruleId: string;
  risk: TranscriptNormalizationRisk;
};

export type AviationTranscriptNormalizationResult = {
  transcript: string;
  transformations: TranscriptTransformation[];
  version: typeof AVIATION_TRANSCRIPT_NORMALIZATION_VERSION;
};

const DIGIT_WORDS: Record<string, string> = {
  ait: '8',
  eight: '8',
  fife: '5',
  five: '5',
  four: '4',
  fower: '4',
  nine: '9',
  niner: '9',
  oh: '0',
  one: '1',
  seven: '7',
  six: '6',
  three: '3',
  to: '2',
  too: '2',
  tree: '3',
  two: '2',
  zero: '0',
};

const CARDINAL_WORDS: Record<string, number> = {
  eight: 8,
  eighteen: 18,
  eighty: 80,
  eleven: 11,
  fifteen: 15,
  fifty: 50,
  five: 5,
  forty: 40,
  four: 4,
  fourteen: 14,
  nine: 9,
  nineteen: 19,
  ninety: 90,
  one: 1,
  seven: 7,
  seventeen: 17,
  seventy: 70,
  six: 6,
  sixteen: 16,
  sixty: 60,
  ten: 10,
  thirteen: 13,
  thirty: 30,
  three: 3,
  twelve: 12,
  twenty: 20,
  two: 2,
  zero: 0,
};

const DIGIT_WORD_PATTERN =
  '(zero|one|two|to|too|three|tree|four|fower|five|fife|six|seven|eight|ait|nine|niner)';
const DIGIT_WORD_NON_CAPTURING_PATTERN =
  '(?:zero|one|two|to|too|three|tree|four|fower|five|fife|six|seven|eight|ait|nine|niner)';
const DIGIT_WORD_SEQUENCE_PATTERN = `${DIGIT_WORD_NON_CAPTURING_PATTERN}(?:\\s+${DIGIT_WORD_NON_CAPTURING_PATTERN})*`;

const ICAO_SPELLING_WORDS: Record<string, string> = {
  alfa: 'A',
  alpha: 'A',
  bravo: 'B',
  charlie: 'C',
  delta: 'D',
  echo: 'E',
  foxtrot: 'F',
  golf: 'G',
  hotel: 'H',
  india: 'I',
  juliet: 'J',
  juliett: 'J',
  kilo: 'K',
  lima: 'L',
  mike: 'M',
  november: 'N',
  oscar: 'O',
  papa: 'P',
  quebec: 'Q',
  romeo: 'R',
  sierra: 'S',
  tango: 'T',
  uniform: 'U',
  victor: 'V',
  whiskey: 'W',
  xray: 'X',
  yankee: 'Y',
  zulu: 'Z',
};
const ICAO_SPELLING_WORD_PATTERN =
  '(?:alfa|alpha|bravo|charlie|delta|echo|foxtrot|golf|hotel|india|juliett|juliet|kilo|lima|mike|november|oscar|papa|quebec|romeo|sierra|tango|uniform|victor|whiskey|x(?:-|\\s*)ray|yankee|zulu)';
const SPELLING_OR_DIGIT_WORD_PATTERN = `(?:${ICAO_SPELLING_WORD_PATTERN}|${DIGIT_WORD_NON_CAPTURING_PATTERN})`;
const SPELLING_OR_DIGIT_SEQUENCE_PATTERN = `${SPELLING_OR_DIGIT_WORD_PATTERN}(?:\\s+${SPELLING_OR_DIGIT_WORD_PATTERN}){1,5}`;
const NUMBER_WORD_PATTERN =
  '(?:zero|oh|one|two|three|tree|four|fower|five|fife|six|seven|eight|ait|nine|niner|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|and)';
const NUMBER_WORD_SEQUENCE_PATTERN = `${NUMBER_WORD_PATTERN}(?:(?:\\s+|-)${NUMBER_WORD_PATTERN})*`;
const CALLSIGN_DIGIT_WORD_PATTERN =
  '(?:zero|oh|or|one|two|to|too|three|tree|four|fower|flower|power|five|fife|six|seven|eight|ait|at|a|nine|niner)';
const CALLSIGN_PUNCTUATED_DIGIT_SEQUENCE_PATTERN = `${CALLSIGN_DIGIT_WORD_PATTERN}(?:(?:\\s*,\\s*|\\s+)${CALLSIGN_DIGIT_WORD_PATTERN})*`;
const CALLSIGN_OR_FILLER_WORD_PATTERN =
  '(?:zero|oh|or|one|two|to|too|three|tree|four|fower|flower|power|five|fife|six|seven|eight|ait|nine|niner)';
const CALLSIGN_OR_FILLER_SEQUENCE_PATTERN = `${CALLSIGN_OR_FILLER_WORD_PATTERN}(?:\\s+${CALLSIGN_OR_FILLER_WORD_PATTERN})*`;
const DESIGNATOR_DIGIT_WORD_PATTERN =
  '(?:zero|oh|or|one|two|three|tree|four|fower|power|five|fife|six|seven|eight|ait|at|nine|niner)';
const TIME_DIGIT_WORD_PATTERN =
  '(?:zero|oh|one|two|three|tree|four|fower|five|fife|six|seven|eight|ait|nine|niner)';
const TIME_DIGIT_SEQUENCE_PATTERN = `${TIME_DIGIT_WORD_PATTERN}(?:\\s+${TIME_DIGIT_WORD_PATTERN})+`;

const FL_WORDS_PATTERN = new RegExp(
  `\\b(?:flight\\s+level|fl)\\s+${DIGIT_WORD_PATTERN}\\s+${DIGIT_WORD_PATTERN}(?:\\s+${DIGIT_WORD_PATTERN})?\\b`,
  'gi',
);
const FL_NUMERIC_PATTERN = /\b(?:flight\s+level|fl)\s+(\d{2,3})\b/gi;
const RUNWAY_NUMERIC_SUFFIX_PATTERN = /\brunway\s+(\d{1,2})\s+(left|right|center|centre)\b/gi;
const RUNWAY_SUFFIX_PATTERN = new RegExp(
  `\\brunway\\s+${DIGIT_WORD_PATTERN}\\s+${DIGIT_WORD_PATTERN}\\s+(left|right|center|centre)\\b`,
  'gi',
);
const RUNWAY_PATTERN = new RegExp(
  `\\brunway\\s+${DIGIT_WORD_PATTERN}\\s+${DIGIT_WORD_PATTERN}\\b(?!\\s+(?:left|right|center|centre)\\b)`,
  'gi',
);
const HEADING_PATTERN = new RegExp(
  `\\bheading\\s+${DIGIT_WORD_PATTERN}\\s+${DIGIT_WORD_PATTERN}\\s+${DIGIT_WORD_PATTERN}\\b`,
  'gi',
);
const PRESSURE_PATTERN = new RegExp(
  `\\b(qnh|qfe|qh|q\\s+and\\s+h)\\s+(${DIGIT_WORD_SEQUENCE_PATTERN})\\b`,
  'gi',
);
const SQUAWK_PATTERN = new RegExp(
  `\\b(squawk(?:ing|ed)?)\\s+${DIGIT_WORD_PATTERN}\\s+${DIGIT_WORD_PATTERN}\\s+${DIGIT_WORD_PATTERN}\\s+${DIGIT_WORD_PATTERN}\\b`,
  'gi',
);
const FREQUENCY_PATTERN = new RegExp(
  `\\b((?:departure\\s+)?frequency|radio\\s+check\\s+on|monitor(?:\\s+(?:tower|guard|frequency))?|monitoring|on|contact(?:\\s+(?:control|approach|ground|tower|arrival|departure|radar|center|centre|delivery)){0,2})\\s+(?:on\\s+)?(${DIGIT_WORD_SEQUENCE_PATTERN})\\s+(?:decimal|point)\\s+(${DIGIT_WORD_SEQUENCE_PATTERN})\\b`,
  'gi',
);
const LEVEL_PATTERN = new RegExp(
  `\\b((?:cruising\\s+)?level)\\s+${DIGIT_WORD_PATTERN}\\s+${DIGIT_WORD_PATTERN}\\s+${DIGIT_WORD_PATTERN}\\b`,
  'gi',
);
const THOUSAND_FEET_PATTERN = new RegExp(
  `\\b${DIGIT_WORD_PATTERN}\\s+thousand(?:\\s+${DIGIT_WORD_PATTERN}\\s+hundred)?\\s+feet\\b`,
  'gi',
);
const NAVAID_SPELLING_PATTERN = new RegExp(
  `\\b(${SPELLING_OR_DIGIT_SEQUENCE_PATTERN})\\s+(VOR|NDB)\\b`,
  'gi',
);
const DEPARTURE_SPELLING_PATTERN = new RegExp(
  `\\b(${SPELLING_OR_DIGIT_SEQUENCE_PATTERN})\\s+(RNAV\\s+)?departure\\b`,
  'gi',
);
const WAYPOINT_SPELLING_PATTERN = new RegExp(
  `\\b((?:direct\\s+to|proceed\\s+direct\\s+to|tracking?\\s+(?:in)?to|over|passing|cross|estimating|position(?:\\s+\\d+\\s+miles)?(?:\\s+north\\s*east)?\\s+of)\\s+)(${ICAO_SPELLING_WORD_PATTERN}(?:\\s+${ICAO_SPELLING_WORD_PATTERN}){1,4})(?:\\s+(${DIGIT_WORD_SEQUENCE_PATTERN}))?\\b`,
  'gi',
);

function normalizeSpaces(input: string) {
  return input.replace(/\s+([,.;?!])/g, '$1').replace(/\s+/g, ' ').trim();
}

function digitFor(word: string) {
  return DIGIT_WORDS[word.toLowerCase()];
}

function digitsFor(...words: Array<string | undefined>) {
  const digits = words
    .filter((word): word is string => typeof word === 'string' && word.length > 0)
    .map(digitFor);
  return digits.every(Boolean) ? digits.join('') : undefined;
}

function digitsFromText(value: string) {
  return digitsFor(...value.split(/\s+/).filter(Boolean));
}

function pressureDigitsFor(value: string) {
  const digits = digitsFromText(value);
  if (!digits || (digits.length !== 3 && digits.length !== 4)) return undefined;
  if (digits.length === 4 && /^[23]/.test(digits)) {
    return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  }
  return digits;
}

function runwaySuffixFor(value: string) {
  if (/^left$/i.test(value)) return 'L';
  if (/^right$/i.test(value)) return 'R';
  if (/^(?:center|centre)$/i.test(value)) return 'C';
  return '';
}

function spellingTokenFor(value: string) {
  const normalized = value.toLowerCase().replace(/-/g, '');
  return ICAO_SPELLING_WORDS[normalized] ?? digitFor(normalized);
}

function spellingSequenceFor(value: string) {
  const words = value.replace(/\bx\s+ray\b/gi, 'x-ray').split(/\s+/).filter(Boolean);
  if (!words.some((word) => ICAO_SPELLING_WORDS[word.toLowerCase().replace(/-/g, '')])) {
    return undefined;
  }
  const tokens = words.map(spellingTokenFor);
  return tokens.every(Boolean) ? tokens.join('') : undefined;
}

function spokenNumberFor(value: string) {
  const words = value.toLowerCase().split(/[\s-]+/).filter((word) => word && word !== 'and');
  if (!words.length) return undefined;
  const digitSequence = words.map((word) => DIGIT_WORDS[word]);
  if (digitSequence.every((digit) => digit !== undefined)) return digitSequence.join('');

  const thousandIndex = words.indexOf('thousand');
  if (thousandIndex > 0) {
    const leadingDigits = words.slice(0, thousandIndex).map((word) => DIGIT_WORDS[word]);
    const trailingWords = words.slice(thousandIndex + 1);
    const trailingDigit = trailingWords[0] ? DIGIT_WORDS[trailingWords[0]] : undefined;
    if (leadingDigits.every(Boolean) && (trailingWords.length === 0 || (
      trailingWords.length === 2 && trailingDigit && trailingWords[1] === 'hundred'
    ))) {
      const thousands = Number(leadingDigits.join('')) * 1000;
      const hundreds = trailingDigit ? Number(trailingDigit) * 100 : 0;
      return String(thousands + hundreds);
    }
  }

  let total = 0;
  let current = 0;
  let used = false;
  for (const word of words) {
    const normalized = word === 'tree' ? 'three'
      : word === 'fower' ? 'four'
        : word === 'fife' ? 'five'
          : word === 'ait' ? 'eight'
            : word === 'niner' ? 'nine'
              : word === 'oh' ? 'zero'
                : word;
    const valuePart = CARDINAL_WORDS[normalized];
    if (valuePart !== undefined) {
      current += valuePart;
      used = true;
    } else if (word === 'hundred') {
      current = Math.max(current, 1) * 100;
      used = true;
    } else if (word === 'thousand') {
      total += Math.max(current, 1) * 1000;
      current = 0;
      used = true;
    } else {
      return undefined;
    }
  }
  return used ? String(total + current) : undefined;
}

function callsignDigitsFor(value: string) {
  const contextualDigitWords: Record<string, string> = {
    ...DIGIT_WORDS,
    a: '8',
    at: '8',
    flower: '4',
    or: '',
    power: '4',
  };
  const digits = value.toLowerCase().split(/[\s,]+/).filter(Boolean).map((word) => contextualDigitWords[word]);
  return digits.length > 0 && digits.every((digit) => digit !== undefined) ? digits.join('') || undefined : undefined;
}

function callsignNumberFor(value: string) {
  const digits = callsignDigitsFor(value);
  if (digits) return digits;
  const words = value.toLowerCase().split(/[\s-]+/).filter(Boolean);
  for (let split = 1; split < words.length; split += 1) {
    const leadingDigits = words.slice(0, split).map((word) => DIGIT_WORDS[word]);
    const suffixWords = words.slice(split);
    if (leadingDigits.every(Boolean) && suffixWords.every((word) => CARDINAL_WORDS[word] !== undefined)) {
      const suffix = spokenNumberFor(suffixWords.join(' '));
      if (suffix && Number(suffix) >= 10) return `${leadingDigits.join('')}${suffix}`;
    }
  }
  return spokenNumberFor(value);
}

function normalizeFlWords(match: string, d1: string, d2: string, d3: string | undefined, offset: number, input: string) {
  if (d3 && /^(?:to|too)$/i.test(d3) && /^\s+(?:flight\s+level|fl)\b/i.test(input.slice(offset + match.length))) {
    const digits = digitsFor(d1, d2);
    return digits ? `FL${digits} ${d3}` : match;
  }
  const digits = digitsFor(d1, d2, d3);
  return digits ? `FL${digits}` : match;
}

function trackedRule(
  state: { transcript: string; transformations: TranscriptTransformation[] },
  ruleId: string,
  risk: TranscriptNormalizationRisk,
  transform: (input: string) => string,
) {
  const before = state.transcript;
  const after = transform(before);
  if (after !== before) {
    state.transformations.push({ after, before, risk, ruleId });
    state.transcript = after;
  }
}

export function normalizeAviationTranscriptDetailed(input: string): AviationTranscriptNormalizationResult {
  const state = { transcript: input, transformations: [] as TranscriptTransformation[] };
  trackedRule(state, 'TXT-001', 'safe', normalizeSpaces);
  trackedRule(state, 'ABBR-001', 'safe', (value) => value
    .replace(/\batc\b/gi, 'ATC')
    .replace(/\bapu\b/gi, 'APU')
    .replace(/\bqnh\b/gi, 'QNH')
    .replace(/\bqfe\b/gi, 'QFE')
    .replace(/\bads[-\s]?b\b/gi, 'ADS-B')
    .replace(/\bils\b/gi, 'ILS')
    .replace(/\bifr\b/gi, 'IFR')
    .replace(/\bvor\b/gi, 'VOR')
    .replace(/\bndb\b/gi, 'NDB')
    .replace(/\brnav\b/gi, 'RNAV')
    .replace(/\btcas\b/gi, 'TCAS')
    .replace(/\bnotam\b/gi, 'NOTAM')
    .replace(/\bsop\b/gi, 'SOP')
    .replace(/\bvmc\b/gi, 'VMC')
    .replace(/\bc\s+b\b/gi, 'CB')
    .replace(/\bmetres\b/gi, 'meters')
    .replace(/\bwind\s+shear\b/gi, 'windshear'));
  trackedRule(state, 'PRESSURE-001', 'context-required', (value) => value.replace(
    PRESSURE_PATTERN,
    (match, label: string, digitWords: string) => {
      const digits = pressureDigitsFor(digitWords);
      const normalizedLabel = /^(?:qh|q\s+and\s+h)$/i.test(label) ? 'QNH' : label.toUpperCase();
      return digits ? `${normalizedLabel} ${digits}` : match;
    },
  ));
  trackedRule(state, 'FL-001', 'context-required', (value) => value
    .replace(FL_NUMERIC_PATTERN, 'FL$1')
    .replace(FL_WORDS_PATTERN, normalizeFlWords));
  trackedRule(state, 'RUNWAY-001', 'context-required', (value) => value
    .replace(RUNWAY_NUMERIC_SUFFIX_PATTERN, (match, runway: string, suffix: string) => {
      const numericRunway = Number(runway);
      return numericRunway >= 1 && numericRunway <= 36
        ? `runway ${String(numericRunway).padStart(2, '0')}${runwaySuffixFor(suffix)}`
        : match;
    })
    .replace(RUNWAY_SUFFIX_PATTERN, (match, d1: string, d2: string, suffix: string) => {
      const digits = digitsFor(d1, d2);
      return digits ? `runway ${digits}${runwaySuffixFor(suffix)}` : match;
    })
    .replace(RUNWAY_PATTERN, (match, d1: string, d2: string) => {
      const digits = digitsFor(d1, d2);
      return digits ? `runway ${digits}` : match;
    }));
  trackedRule(state, 'HEADING-001', 'context-required', (value) => value.replace(
    HEADING_PATTERN,
    (match, d1: string, d2: string, d3: string) => {
      const digits = digitsFor(d1, d2, d3);
      return digits ? `heading ${digits}` : match;
    },
  ));
  trackedRule(state, 'SQUAWK-001', 'context-required', (value) => value.replace(
    SQUAWK_PATTERN,
    (match, verb: string, d1: string, d2: string, d3: string, d4: string) => {
      const digits = digitsFor(d1, d2, d3, d4);
      return digits ? `${verb} ${digits}` : match;
    },
  ));
  trackedRule(state, 'FREQ-001', 'context-required', (value) => value.replace(
    FREQUENCY_PATTERN,
    (match, prefix: string, before: string, after: string) => {
      const beforeDigits = digitsFromText(before);
      const afterDigits = digitsFromText(after);
      return beforeDigits && afterDigits ? `${prefix} ${beforeDigits}.${afterDigits}` : match;
    },
  ));
  trackedRule(state, 'FREQ-005', 'context-required', (value) => value.replace(
    /\b((?:the\s+)?frequency\s+of)\s+(\d{2,3})\s+(?:decimal|point)\s+(\d{1,3})\s+(?:mega\s*hertz|megahertz|mhz)\b/gi,
    (match, prefix: string, before: string, after: string) => `${prefix} ${before}.${after} MHz`,
  ));
  trackedRule(state, 'FREQ-006', 'guarded', (value) => value.replace(
    /\b(contact\s+(?:approach|departure|control|tower|ground)(?:\s+on)?)\s+((?:11[89]|12\d|13[0-6])\d{2})\b/gi,
    (match, prefix: string, digits: string) => `${prefix} ${digits.slice(0, 3)}.${digits.slice(3)}`,
  ));
  trackedRule(state, 'FREQ-002', 'context-required', (value) => value.replace(
    new RegExp(`\\b(hear\\s+it\\s+as)\\s+(${DIGIT_WORD_SEQUENCE_PATTERN})\\s+(?:decimal|point)\\s+(${DIGIT_WORD_SEQUENCE_PATTERN})\\b`, 'gi'),
    (match, prefix: string, before: string, after: string) => {
      const beforeDigits = digitsFromText(before);
      const afterDigits = digitsFromText(after);
      return beforeDigits && afterDigits ? `${prefix} ${beforeDigits}.${afterDigits}` : match;
    },
  ));
  trackedRule(state, 'FREQ-003', 'context-required', (value) => value.replace(
    new RegExp(`\\b(contact\\s+(?:Beijing|Wuhan|Shanghai|Guangzhou)\\s+(?:Control|Approach))\\s+(${DIGIT_WORD_SEQUENCE_PATTERN})\\s+(?:decimal|point)\\s+(${DIGIT_WORD_SEQUENCE_PATTERN})\\b`, 'gi'),
    (match, prefix: string, before: string, after: string) => {
      const beforeDigits = digitsFromText(before);
      const afterDigits = digitsFromText(after);
      return beforeDigits && afterDigits ? `${prefix} ${beforeDigits}.${afterDigits}` : match;
    },
  ));
  trackedRule(state, 'FREQ-004', 'guarded', (value) => value.replace(
    new RegExp(`\\b(contact\\s+(?:approach|departure|control|tower))\\s+(${DIGIT_WORD_SEQUENCE_PATTERN})\\s+day\\s+simo\\s+(${DIGIT_WORD_SEQUENCE_PATTERN})\\b`, 'gi'),
    (match, prefix: string, before: string, after: string) => {
      const beforeDigits = digitsFromText(before);
      const afterDigits = digitsFromText(after);
      return beforeDigits && afterDigits ? `${prefix} ${beforeDigits}.${afterDigits}` : match;
    },
  ));
  trackedRule(state, 'LEVEL-001', 'context-required', (value) => value.replace(
    LEVEL_PATTERN,
    (match, label: string, d1: string, d2: string, d3: string) => {
      const digits = digitsFor(d1, d2, d3);
      return digits ? `${label} ${digits}` : match;
    },
  ));
  trackedRule(state, 'ALTITUDE-001', 'context-required', (value) => value
    .replace(new RegExp(`\\bbetween\\s+(${NUMBER_WORD_SEQUENCE_PATTERN})\\s+and\\s+(${NUMBER_WORD_SEQUENCE_PATTERN})\\s+(miles|kilometers|kilometres|meters|metres|feet)\\b`, 'gi'), (match, first: string, second: string, unit: string) => {
      const firstDigits = spokenNumberFor(first);
      const secondDigits = spokenNumberFor(second);
      const normalizedUnit = /^metres$/i.test(unit) ? 'meters' : /^kilometres$/i.test(unit) ? 'kilometers' : unit;
      return firstDigits && secondDigits ? `between ${firstDigits} and ${secondDigits} ${normalizedUnit}` : match;
    })
    .replace(THOUSAND_FEET_PATTERN, (match, thousands: string, hundreds?: string) => {
      const thousandDigit = digitFor(thousands);
      const hundredDigit = hundreds ? digitFor(hundreds) : undefined;
      if (!thousandDigit || (hundreds && !hundredDigit)) return match;
      return `${thousandDigit}${hundredDigit ?? '0'}00 feet`;
    })
    .replace(new RegExp(`\\b(${NUMBER_WORD_SEQUENCE_PATTERN})\\s+(meters|metres|feet|knots|tons|rpm|degrees|miles|minutes|kilometers|kilometres)\\b`, 'gi'), (match, spoken: string, unit: string) => {
      const number = spokenNumberFor(spoken);
      const normalizedUnit = /^metres$/i.test(unit) ? 'meters' : /^kilometres$/i.test(unit) ? 'kilometers' : unit;
      return number ? `${number} ${normalizedUnit}` : match;
    }));
  trackedRule(state, 'CALLSIGN-001', 'context-required', (value) => value
    .replace(
      new RegExp(`\\b(Air\\s+Canada|Air\\s+China|Air\\s+France|China\\s+Eastern|China\\s+Southern|Delta|Dragonair|Eastern|Great\\s+Wall|Japan(?:\\s+Air(?:lines)?)?|KLM|Korean(?:\\s+Air)?|Northwest|Pacific|Qantas|Singapore|Southern|Southwest|Speedbird|United(?:\\s+Airlines)?|Windar|Windor)\\s+(${DIGIT_WORD_NON_CAPTURING_PATTERN})\\s+(\\d{1,3})\\b`, 'gi'),
      (match, prefix: string, leading: string, trailing: string) => {
        const digit = digitFor(leading);
        return digit ? `${prefix} ${digit}${trailing}` : match;
      },
    )
    .replace(
    new RegExp(`\\b(Air\\s+Canada|Air\\s+China|Air\\s+France|China\\s+Eastern|China\\s+Southern|Delta|Dragonair|Eastern|Great\\s+Wall|Japan(?:\\s+Air(?:lines)?)?|KLM|Korean(?:\\s+Air)?|Northwest|Pacific|Qantas|Singapore|Southern|Southwest|Speedbird|United(?:\\s+Airlines)?|Windar|Windor)\\s+(${CALLSIGN_PUNCTUATED_DIGIT_SEQUENCE_PATTERN})\\b(?=\\s*(?:[,.;?!]|$|roger\\b|thanks\\b|vacate\\b|enter\\b|have\\b|is\\b|for\\b|on\\b|stop\\b))`, 'gi'),
      (match, prefix: string, spoken: string) => {
        const number = callsignNumberFor(spoken);
        return number ? `${prefix} ${number}` : match;
      },
    )
    .replace(
      new RegExp(`\\b(Air\\s+Canada|Air\\s+China|Air\\s+France|China\\s+Eastern|China\\s+Southern|Delta|Dragonair|Eastern|Great\\s+Wall|Japan(?:\\s+Air(?:lines)?)?|KLM|Korean(?:\\s+Air)?|Northwest|Pacific|Qantas|Singapore|Southern|Southwest|Speedbird|United(?:\\s+Airlines)?|Windar|Windor)\\s+(${NUMBER_WORD_SEQUENCE_PATTERN})\\b(?!\\s+or\\b)`, 'gi'),
      (match, prefix: string, spoken: string) => {
        const number = callsignNumberFor(spoken);
        return number ? `${prefix} ${number}${/\band$/i.test(spoken) ? ' and' : ''}` : match;
      },
    )
    .replace(
      new RegExp(`\\b(Air\\s+Canada|Air\\s+China|Air\\s+France|China\\s+Eastern|China\\s+Southern|Delta|Dragonair|Eastern|Great\\s+Wall|Japan(?:\\s+Air(?:lines)?)?|KLM|Korean(?:\\s+Air)?|Northwest|Pacific|Qantas|Singapore|Southern|Southwest|Speedbird|United(?:\\s+Airlines)?|Windar|Windor)\\s+(${CALLSIGN_OR_FILLER_SEQUENCE_PATTERN})\\b`, 'gi'),
      (match, prefix: string, spoken: string) => {
        const number = callsignDigitsFor(spoken);
        return number ? `${prefix} ${number}` : match;
      },
    ));
  trackedRule(state, 'AIRCRAFT-001', 'context-required', (value) => value.replace(
    new RegExp(`\\b(Airbus|Boeing)\\s+(${NUMBER_WORD_SEQUENCE_PATTERN})\\b`, 'gi'),
    (match, prefix: string, spoken: string) => {
      const number = spokenNumberFor(spoken);
      return number ? `${prefix} ${number}` : match;
    },
  ));
  trackedRule(state, 'POSITION-001', 'context-required', (value) => value
    .replace(new RegExp(`\\b(bay|stand|parking\\s+at)\\s+(${NUMBER_WORD_SEQUENCE_PATTERN})\\b`, 'gi'), (match, prefix: string, spoken: string) => {
      const number = spokenNumberFor(spoken);
      return number ? `${prefix} ${number}` : match;
    })
    .replace(new RegExp(`\\bgate\\s+(${ICAO_SPELLING_WORD_PATTERN})\\s+(${NUMBER_WORD_SEQUENCE_PATTERN})\\b`, 'gi'), (match, spelling: string, spoken: string) => {
      const code = spellingTokenFor(spelling);
      const number = spokenNumberFor(spoken);
      return code && number ? `gate ${code}${number}` : match;
    })
    .replace(new RegExp(`\\b(intersection\\s+departure\\s+from)\\s+(${ICAO_SPELLING_WORD_PATTERN})\\s+(${DESIGNATOR_DIGIT_WORD_PATTERN})\\b`, 'gi'), (match, prefix: string, spelling: string, digit: string) => {
      const code = spellingTokenFor(spelling);
      const number = callsignDigitsFor(digit);
      return code && number ? `${prefix} ${code}${number}` : match;
    })
    .replace(new RegExp(`\\b(intersection\\s+departure\\s+from)\\s+(${ICAO_SPELLING_WORD_PATTERN})\\s+(\\d{1,2})\\b`, 'gi'), (match, prefix: string, spelling: string, digit: string) => {
      const code = spellingTokenFor(spelling);
      return code ? `${prefix} ${code}${digit}` : match;
    })
    .replace(new RegExp(`\\b(intersection)\\s+(${ICAO_SPELLING_WORD_PATTERN})\\s+(${DESIGNATOR_DIGIT_WORD_PATTERN})\\b`, 'gi'), (match, prefix: string, spelling: string, digit: string) => {
      const code = spellingTokenFor(spelling);
      const number = callsignDigitsFor(digit);
      return code && number ? `${prefix} ${code}${number}` : match;
    })
    .replace(new RegExp(`\\b(depart\\s+from)\\s+(${ICAO_SPELLING_WORD_PATTERN})\\s+(${DESIGNATOR_DIGIT_WORD_PATTERN})\\b`, 'gi'), (match, prefix: string, spelling: string, digit: string) => {
      const code = spellingTokenFor(spelling);
      const number = callsignDigitsFor(digit);
      return code && number ? `${prefix} ${code}${number}` : match;
    })
    .replace(new RegExp(`\\b((?:holding\\s+point|rapid\\s+exit|cleared\\s+to\\s+leave)\\s+)(${ICAO_SPELLING_WORD_PATTERN})\\s+(${DESIGNATOR_DIGIT_WORD_PATTERN})\\b`, 'gi'), (match, prefix: string, spelling: string, digit: string) => {
      const code = spellingTokenFor(spelling);
      const number = callsignDigitsFor(digit);
      return code && number ? `${prefix}${code}${number}` : match;
    })
    .replace(new RegExp(`\\b((?:holding\\s+point|rapid\\s+exit|cleared\\s+to\\s+leave|taxiway)\\s+)(${ICAO_SPELLING_WORD_PATTERN})\\s+(\\d{1,2})\\b`, 'gi'), (match, prefix: string, spelling: string, digit: string) => {
      const code = spellingTokenFor(spelling);
      return code ? `${prefix}${code}${digit}` : match;
    })
    .replace(new RegExp(`\\b(stand)\\s+(${ICAO_SPELLING_WORD_PATTERN})\\s+(${DESIGNATOR_DIGIT_WORD_PATTERN})\\b`, 'gi'), (match, prefix: string, spelling: string, digit: string) => {
      const code = spellingTokenFor(spelling);
      const number = callsignDigitsFor(digit);
      return code && number ? `${prefix} ${code}${number}` : match;
    })
    .replace(new RegExp(`\\b(then\\s+${ICAO_SPELLING_WORD_PATTERN})\\s+(${DESIGNATOR_DIGIT_WORD_PATTERN})\\b`, 'gi'), (match, prefix: string, spoken: string) => {
      const number = callsignDigitsFor(spoken);
      return number ? `${prefix} ${number}` : match;
    })
    .replace(new RegExp(`\\bgate\\s+(${NUMBER_WORD_SEQUENCE_PATTERN})\\b`, 'gi'), (match, spoken: string) => {
      const number = spokenNumberFor(spoken);
      return number ? `gate ${number}` : match;
    })
    .replace(new RegExp(`\\b((?:via|exit(?:\\s+via)?|hold\\s+short\\s+of)\\s+)(${ICAO_SPELLING_WORD_PATTERN})\\s+(${DESIGNATOR_DIGIT_WORD_PATTERN})\\b`, 'gi'), (match, prefix: string, spelling: string, digit: string) => {
      const number = callsignDigitsFor(digit);
      return number ? `${prefix}${spelling} ${number}` : match;
    })
    .replace(new RegExp(`\\b(via\\s+${ICAO_SPELLING_WORD_PATTERN}\\s+\\d+\\s+and\\s+)(${ICAO_SPELLING_WORD_PATTERN})\\s+(${DESIGNATOR_DIGIT_WORD_PATTERN})\\b`, 'gi'), (match, prefix: string, spelling: string, digit: string) => {
      const number = callsignDigitsFor(digit);
      return number ? `${prefix}${spelling} ${number}` : match;
    })
    .replace(new RegExp(`\\b((?:via\\s+taxiway|taxiway|onto)\\s+)(${ICAO_SPELLING_WORD_PATTERN})\\s+(flower|foaur|${DESIGNATOR_DIGIT_WORD_PATTERN})\\b`, 'gi'), (match, prefix: string, spelling: string, digit: string) => {
      const number = /^(?:flower|foaur)$/i.test(digit) ? '4' : callsignDigitsFor(digit);
      return number ? `${prefix}${spelling} ${number}` : match;
    })
    .replace(new RegExp(`\\b(holding\\s+point)\\s+(${DIGIT_WORD_NON_CAPTURING_PATTERN})\\s+(${DIGIT_WORD_NON_CAPTURING_PATTERN})\\s+(left|right|center|centre)\\b`, 'gi'), (match, prefix: string, d1: string, d2: string, suffix: string) => {
      const digits = digitsFor(d1, d2);
      return digits ? `${prefix} ${digits}${runwaySuffixFor(suffix)}` : match;
    })
    .replace(/\binformation\s+x\s+ray\b/gi, 'information X')
    .replace(new RegExp(`\\binformation\\s+(${ICAO_SPELLING_WORD_PATTERN})\\b`, 'gi'), (match, spelling: string) => {
      const code = spellingTokenFor(spelling);
      return code ? `information ${code}` : match;
    }));
  trackedRule(state, 'NAVAID-001', 'context-required', (value) => value.replace(
    NAVAID_SPELLING_PATTERN,
    (match, spelling: string, navaid: string) => {
      const leadingPreposition = /^(to|too)\s+/i.exec(spelling);
      const designator = leadingPreposition ? spelling.slice(leadingPreposition[0].length) : spelling;
      const code = spellingSequenceFor(designator);
      if (!code) return match;
      return `${leadingPreposition ? `${leadingPreposition[1]} ` : ''}${code} ${navaid.toUpperCase()}`;
    },
  ));
  trackedRule(state, 'WAYPOINT-001', 'context-required', (value) => value
    .replace(WAYPOINT_SPELLING_PATTERN, (match, prefix: string, spelling: string, spokenDigits?: string) => {
      const code = spellingSequenceFor(spelling);
      const digits = spokenDigits ? digitsFromText(spokenDigits) : undefined;
      return code ? `${prefix}${code}${digits ? ` ${digits}` : ''}` : match;
    })
    .replace(new RegExp(`\\b((?:VOR|NDB))\\s+(${DIGIT_WORD_SEQUENCE_PATTERN})\\b`, 'gi'), (match, label: string, spoken: string) => {
      const digits = digitsFromText(spoken);
      return digits ? `${label.toUpperCase()} ${digits}` : match;
    })
    .replace(new RegExp(`\\bairway\\s+(${ICAO_SPELLING_WORD_PATTERN})\\s+(${DIGIT_WORD_SEQUENCE_PATTERN})\\b`, 'gi'), (match, spelling: string, spoken: string) => {
      const code = spellingTokenFor(spelling);
      const digits = digitsFromText(spoken);
      return code && digits ? `airway ${code}${digits}` : match;
    })
    .replace(new RegExp(`\\b(${ICAO_SPELLING_WORD_PATTERN}(?:\\s+${ICAO_SPELLING_WORD_PATTERN}){1,4})\\s+next\\b`, 'gi'), (match, spelling: string) => {
      const code = spellingSequenceFor(spelling);
      return code ? `${code} next` : match;
    })
    .replace(new RegExp(`\\b((?:clear(?:ed)?\\s+to|join)\\s+)(${ICAO_SPELLING_WORD_PATTERN}(?:\\s+${ICAO_SPELLING_WORD_PATTERN}){0,2})\\s+(${DIGIT_WORD_SEQUENCE_PATTERN})\\b`, 'gi'), (match, prefix: string, spelling: string, spoken: string) => {
      const code = spellingSequenceFor(spelling);
      const digits = digitsFromText(spoken);
      return code && digits ? `${prefix}${code}${digits}` : match;
    })
    .replace(new RegExp(`\\breport\\s+(${ICAO_SPELLING_WORD_PATTERN}(?:\\s+${ICAO_SPELLING_WORD_PATTERN}){1,4})\\b`, 'gi'), (match, spelling: string) => {
      const code = spellingSequenceFor(spelling);
      return code ? `report ${code}` : match;
    })
    .replace(new RegExp(`\\b((?:route|east\\s+of|west\\s+of|north(?:\\s*west)?\\s+of|south(?:\\s*west)?\\s+of|from|by)\\s+)(${ICAO_SPELLING_WORD_PATTERN}(?:\\s+${ICAO_SPELLING_WORD_PATTERN}){0,4})(?:\\s+(${DIGIT_WORD_SEQUENCE_PATTERN}))?\\b`, 'gi'), (match, prefix: string, spelling: string, spoken?: string) => {
      const code = spellingSequenceFor(spelling);
      const digits = spoken ? digitsFromText(spoken) : undefined;
      return code ? `${prefix}${code}${digits ? digits : ''}` : match;
    })
    .replace(new RegExp(`\\bbetween\\s+(${ICAO_SPELLING_WORD_PATTERN}(?:\\s+${ICAO_SPELLING_WORD_PATTERN}){1,3})\\s+and\\s+(${ICAO_SPELLING_WORD_PATTERN}(?:\\s+${ICAO_SPELLING_WORD_PATTERN}){1,3})\\b`, 'gi'), (match, first: string, second: string) => {
      const firstCode = spellingSequenceFor(first);
      const secondCode = spellingSequenceFor(second);
      return firstCode && secondCode ? `between ${firstCode} and ${secondCode}` : match;
    }));
  trackedRule(state, 'DEPARTURE-001', 'context-required', (value) => value.replace(
    DEPARTURE_SPELLING_PATTERN,
    (match, spelling: string, rnav?: string) => {
      const code = spellingSequenceFor(spelling);
      if (!code) return match;
      return rnav ? `${code} RNAV Departure` : `${code} Departure`;
    },
  ));
  trackedRule(state, 'URGENCY-001', 'safe', (value) => value
    .replace(/\b((?:confirm\s+you\s+)?declare(?:d)?(?:\s+a)?)\s+(?:pompon|p(?:an|on|om)\s+p(?:an|on|om))\b/gi, '$1 PANPAN')
    .replace(/\bpan\s+pan\b/gi, 'PANPAN')
    .replace(/(?<!-)\bpan\b(?!-)/gi, 'PAN')
    .replace(/\bmay\s+day\b/gi, 'mayday'));
  trackedRule(state, 'MACH-001', 'context-required', (value) => value.replace(
    new RegExp(`\\bMach\\s+(?:zero\\s+)?(?:decimal|point)\\s+(${DIGIT_WORD_SEQUENCE_PATTERN})\\b`, 'gi'),
    (match, spoken: string) => {
      const digits = digitsFromText(spoken);
      return digits ? `Mach 0.${digits}` : match;
    },
  ));
  trackedRule(state, 'TIME-001', 'context-required', (value) => value
    .replace(new RegExp(`\\b((?:departure\\s+time\\s+is|time|clearance\\s+at)\\s+)(${TIME_DIGIT_SEQUENCE_PATTERN})\\b`, 'gi'), (match, prefix: string, spoken: string) => {
      const digits = digitsFromText(spoken);
      return digits ? `${prefix}${digits}` : match;
    })
    .replace(new RegExp(`\\b(expect\\s+further\\s+clearance\\s+at)\\s+(${TIME_DIGIT_SEQUENCE_PATTERN})\\b`, 'gi'), (match, prefix: string, spoken: string) => {
      const digits = digitsFromText(spoken);
      return digits ? `${prefix} ${digits}` : match;
    })
    .replace(new RegExp(`\\b(slot\\s+time\\s+at)\\s+(${TIME_DIGIT_SEQUENCE_PATTERN})\\b`, 'gi'), (match, prefix: string, spoken: string) => {
      const digits = digitsFromText(spoken);
      return digits ? `${prefix} ${digits}` : match;
    })
    .replace(new RegExp(`\\b(at)\\s+(${TIME_DIGIT_SEQUENCE_PATTERN})\\s+(or\\s+later)\\b`, 'gi'), (match, prefix: string, spoken: string, suffix: string) => {
      const digits = digitsFromText(spoken);
      return digits ? `${prefix} ${digits} ${suffix}` : match;
    }));
  trackedRule(state, 'MANEUVER-001', 'context-required', (value) => value.replace(/\bthree\s+sixty\s+turn\b/gi, '360 turn'));
  trackedRule(state, 'AIRCRAFT-002', 'context-required', (value) => value.replace(/\bBoeing\s+triple\s+seven\b/gi, 'Boeing 777'));
  trackedRule(state, 'RADIAL-001', 'context-required', (value) => value
    .replace(new RegExp(`\\b(${DIGIT_WORD_SEQUENCE_PATTERN})\\s+radial\\b`, 'gi'), (match, spoken: string) => {
      const digits = digitsFromText(spoken);
      return digits ? `${digits} radial` : match;
    })
    .replace(new RegExp(`\\b(inbound\\s+track)\\s+(${DIGIT_WORD_SEQUENCE_PATTERN})\\b`, 'gi'), (match, prefix: string, spoken: string) => {
      const digits = digitsFromText(spoken);
      return digits ? `${prefix} ${digits}` : match;
    }));
  trackedRule(state, 'ABBR-002', 'safe', (value) => value
    .replace(/\bB\s+T\s+M\b/gi, 'BTM')
    .replace(/\bB\s+C\s+F\b/gi, 'BCF')
    .replace(/\bA\s+P\s+U\b/gi, 'APU')
    .replace(/\bC\s+P\s+D\s+L\s+C\b/gi, 'CPDLC')
    .replace(/\bR\s+V\s+S\s+M\b/gi, 'RVSM'));
  trackedRule(state, 'ABBR-003', 'guarded', (value) => value
    .replace(/\bIcaho(?=\s+(?:standard|spelling))\b/gi, 'ICAO')
    .replace(/\bTCS\s*RA\b/gi, 'TCAS RA')
    .replace(/\bT\.\s*Cas\.(?=\s*R\.\s*A\.)/gi, 'TCAS')
    .replace(/\bTCAS\s+R\.\s*A\./gi, 'TCAS RA')
    .replace(/\b(?:TCAST|cast)(?=\s+(?:resolution\s+advisories?|maneuvers?))\b/gi, 'TCAS')
    .replace(/\bCAT\s+III\s+C\b/gi, 'CAT IIIC'));
  trackedRule(state, 'ALTITUDE-002', 'guarded', (value) => value.replace(
    /\b(nine|niner)\s+or\s+(?:hundred|100)\s+(meters|metres|feet)\b/gi,
    (match, digit: string, unit: string) => `${digitFor(digit)}00 ${/^metres$/i.test(unit) ? 'meters' : unit}`,
  ));
  trackedRule(state, 'ALTITUDE-003', 'guarded', (value) => value.replace(
    /\bnine\s+thousand\s+or\s+100\s+(meters|metres|feet)\b/gi,
    (match, unit: string) => `900 ${/^metres$/i.test(unit) ? 'meters' : unit}`,
  ));
  trackedRule(state, 'ALTITUDE-005', 'guarded', (value) => value.replace(
    /\bnine\s+or\s+1000\s+(meters|metres|feet)\b/gi,
    (match, unit: string) => `9000 ${/^metres$/i.test(unit) ? 'meters' : unit}`,
  ));
  trackedRule(state, 'ALTITUDE-006', 'guarded', (value) => value.replace(
    /\bNiner\s+Tau\s+Sen\s+([1-9])00\s+(meters|metres|feet)\b/gi,
    (match, hundreds: string, unit: string) => `9${hundreds}00 ${/^metres$/i.test(unit) ? 'meters' : unit}`,
  ));
  trackedRule(state, 'ALTITUDE-004', 'guarded', (value) => value
    .replace(
      new RegExp(`\\b(tree|three|faur|four|fower)\\s+(?:tao\\s+sand|tau\\s+sen)\\s+(${DIGIT_WORD_NON_CAPTURING_PATTERN})\\s+hundred\\s+(meters|metres|feet)\\b`, 'gi'),
      (match, thousands: string, hundreds: string, unit: string) => {
        const thousandDigit = /^(?:tree|three)$/i.test(thousands) ? '3' : '4';
        const hundredDigit = digitFor(hundreds);
        return hundredDigit ? `${thousandDigit}${hundredDigit}00 ${/^metres$/i.test(unit) ? 'meters' : unit}` : match;
      },
    )
    .replace(
      /\b(tree|three|faur|four|fower)\s+(?:tao\s+sand|tau\s+sen)\s+([1-9])00\s+(meters|metres|feet)\b/gi,
      (match, thousands: string, hundreds: string, unit: string) => `${/^(?:tree|three)$/i.test(thousands) ? '3' : '4'}${hundreds}00 ${/^metres$/i.test(unit) ? 'meters' : unit}`,
    )
    .replace(
      /\bFauvret\s+Au\s+Sen\s+([1-9])00\s+(meters|metres|feet)\b/gi,
      (match, hundreds: string, unit: string) => `4${hundreds}00 ${/^metres$/i.test(unit) ? 'meters' : unit}`,
    ));
  trackedRule(state, 'PROPER-NAME-001', 'guarded', (value) => value
    .replace(/\b((?:clear(?:ed)?|request\s+clearance)\s+to)\s+Dos\s+Sun\b/gi, '$1 DOSSON')
    .replace(/\b(cleared\s+to)\s+Bicol\b/gi, '$1 BEKOL')
    .replace(/\b(overhead)\s+B\s+call\b/gi, '$1 BEKOL')
    .replace(/\b(overhead)\s+Gulf\s+Charlie\s+Foxtrot\b/gi, '$1 GCF')
    .replace(/\bBOBEX\s+zero\s+three\s+departure\b/gi, 'BOBAK03 Departure')
    .replace(/\b(return\s+to)\s+Raxbury\b/gi, '$1 Rexburg')
    .replace(/\bWindor\b/gi, 'Windar')
    .replace(/\b((?:proceed\s+direct\s+to|cleared\s+to))\s+Akuba\b/gi, '$1 IKUBA')
    .replace(/\b(position)\s+oblique\b/gi, '$1 OBLIK'));
  trackedRule(state, 'STANDBY-001', 'context-required', (value) => value.replace(/\bstand\s*by\s+one\b/gi, 'standby 1'));
  trackedRule(state, 'CALLSIGN-002', 'guarded', (value) => value.replace(/\bKLM\s+made\s+eight\b/gi, 'KLM 88'));
  trackedRule(state, 'RUNWAY-002', 'context-required', (value) => value.replace(
    new RegExp(`\\brunway\\s+in\\s+use\\s+(${DIGIT_WORD_NON_CAPTURING_PATTERN})\\s+(${DIGIT_WORD_NON_CAPTURING_PATTERN})\\s+(left|right|center|centre)\\b`, 'gi'),
    (match, d1: string, d2: string, suffix: string) => {
      const digits = digitsFor(d1, d2);
      return digits ? `runway in use ${digits}${runwaySuffixFor(suffix)}` : match;
    },
  ));
  trackedRule(state, 'ARRIVAL-001', 'context-required', (value) => value.replace(
    new RegExp(`\\b(${SPELLING_OR_DIGIT_SEQUENCE_PATTERN})\\s+arrival\\b`, 'gi'),
    (match, spelling: string) => {
      const code = spellingSequenceFor(spelling);
      return code ? `${code} Arrival` : match;
    },
  ));
  trackedRule(state, 'STATUS-001', 'guarded', (value) => value
    .replace(/\bEnable\s+RVS\s*M\s+due\b/gi, 'Unable RVSM due')
    .replace(/\bRVS\s+M\b/gi, 'RVSM'));
  trackedRule(state, 'WAYPOINT-002', 'context-required', (value) => value.replace(
    new RegExp(`\\b(after)\\s+(${ICAO_SPELLING_WORD_PATTERN}(?:\\s+${ICAO_SPELLING_WORD_PATTERN}){1,3})\\b`, 'gi'),
    (match, prefix: string, spelling: string) => {
      const code = spellingSequenceFor(spelling);
      return code ? `${prefix} ${code}` : match;
    },
  ));
  trackedRule(state, 'WAYPOINT-003', 'context-required', (value) => value.replace(
    new RegExp(`\\b((?:clear(?:ed)?\\s+to|hold\\s+at|level\\s+at)\\s+)(${ICAO_SPELLING_WORD_PATTERN}(?:\\s+${ICAO_SPELLING_WORD_PATTERN}){1,4})\\b`, 'gi'),
    (match, prefix: string, spelling: string) => {
      const code = spellingSequenceFor(spelling);
      return code ? `${prefix}${code}` : match;
    },
  ));
  trackedRule(state, 'WAYPOINT-004', 'context-required', (value) => value.replace(
    new RegExp(`\\b(rejoin\\s+the)\\s+(${ICAO_SPELLING_WORD_PATTERN})\\s+(${DESIGNATOR_DIGIT_WORD_PATTERN})\\b`, 'gi'),
    (match, prefix: string, spelling: string, digit: string) => {
      const code = spellingTokenFor(spelling);
      const number = callsignDigitsFor(digit);
      return code && number ? `${prefix} ${code}${number}` : match;
    },
  ));
  trackedRule(state, 'TAXIWAY-001', 'guarded', (value) => value.replace(
    new RegExp(`\\bon\\s+taxiing\\s+(${ICAO_SPELLING_WORD_PATTERN}(?:\\s+${ICAO_SPELLING_WORD_PATTERN}){1,3})\\b`, 'gi'),
    (match, spelling: string) => {
      const code = spellingSequenceFor(spelling);
      return code ? `on taxiway ${code}` : match;
    },
  ));
  trackedRule(state, 'COORDINATE-001', 'context-required', (value) => value.replace(
    new RegExp(`\\b(at)\\s+(${TIME_DIGIT_WORD_PATTERN}(?:\\s+${TIME_DIGIT_WORD_PATTERN}){3})\\b`, 'gi'),
    (match, prefix: string, spoken: string) => {
      const digits = digitsFromText(spoken);
      return digits ? `${prefix} ${digits}` : match;
    },
  ));
  trackedRule(state, 'LEVEL-002', 'context-required', (value) => value.replace(
    new RegExp(`\\b(reach)\\s+(${DIGIT_WORD_NON_CAPTURING_PATTERN})\\s+(${DIGIT_WORD_NON_CAPTURING_PATTERN})\\s+(${DIGIT_WORD_NON_CAPTURING_PATTERN})\\s+within\\b`, 'gi'),
    (match, prefix: string, d1: string, d2: string, d3: string) => {
      const digits = digitsFor(d1, d2, d3);
      return digits ? `${prefix} ${digits} within` : match;
    },
  ));
  trackedRule(state, 'WIND-001', 'context-required', (value) => value.replace(
    new RegExp(`\\b(surface\\s+wind)\\s+(${DIGIT_WORD_SEQUENCE_PATTERN}),?\\s+(${NUMBER_WORD_SEQUENCE_PATTERN})\\s+(?:kts|knots)\\b`, 'gi'),
    (match, prefix: string, direction: string, speed: string) => {
      const directionDigits = digitsFromText(direction);
      const speedNumber = spokenNumberFor(speed);
      return directionDigits && speedNumber ? `${prefix} ${directionDigits}, ${speedNumber} knots` : match;
    },
  ));
  trackedRule(state, 'WEATHER-001', 'guarded', (value) => value.replace(/\bC\s+Bee['’]?s\b/gi, 'CBs'));
  trackedRule(state, 'SELCAL-001', 'guarded', (value) => value
    .replace(/\bSail\s+cow\s+code\b/gi, 'SELCAL code')
    .replace(/\brequest\s+Sail\s+cow\s+check\b/gi, 'request SELCAL check')
    .replace(new RegExp(`\\b(SELCAL\\s+code)\\s+(${ICAO_SPELLING_WORD_PATTERN}(?:\\s+${ICAO_SPELLING_WORD_PATTERN}){3})\\b`, 'gi'), (match, prefix: string, spelling: string) => {
      const code = spellingSequenceFor(spelling);
      return code ? `${prefix} ${code}` : match;
    }));
  trackedRule(state, 'APPROACH-001', 'context-required', (value) => value
    .replace(/\bICAO\s+Category\s+3A\b/gi, 'ICAO CAT IIIA')
    .replace(/\bCategory\s+3A\s+approach\b/gi, 'CAT IIIA approach'));
  trackedRule(state, 'BULLETIN-001', 'context-required', (value) => value.replace(
    new RegExp(`\\b(bulletin\\s+${ICAO_SPELLING_WORD_PATTERN})\\s+(${DIGIT_WORD_SEQUENCE_PATTERN})\\b`, 'gi'),
    (match, prefix: string, spoken: string) => {
      const digits = digitsFromText(spoken);
      return digits ? `${prefix} ${digits}` : match;
    },
  ));
  trackedRule(state, 'POSITION-002', 'guarded', (value) => value.replace(
    /\bB\s+two\s+four,\s+request\s+start\s*up\b/gi,
    'Bay24, request start-up',
  ));
  trackedRule(state, 'TIME-002', 'context-required', (value) => value.replace(
    new RegExp(`\\b(at)\\s+(${TIME_DIGIT_WORD_PATTERN})\\s+(${TIME_DIGIT_WORD_PATTERN})(?=,\\s+altitude\\b)`, 'gi'),
    (match, prefix: string, d1: string, d2: string) => {
      const digits = digitsFor(d1, d2);
      return digits ? `${prefix} ${digits}` : match;
    },
  ));
  trackedRule(state, 'COORDINATE-002', 'context-required', (value) => value
    .replace(new RegExp(`\\b(position|at)\\s+(${TIME_DIGIT_WORD_PATTERN}(?:\\s+${TIME_DIGIT_WORD_PATTERN}){3})\\s+(south|north|east|west)\\b`, 'gi'), (match, prefix: string, spoken: string, direction: string) => {
      const digits = digitsFromText(spoken);
      return digits ? `${prefix} ${digits} ${direction}` : match;
    })
    .replace(new RegExp(`\\b(route\\s+${ICAO_SPELLING_WORD_PATTERN}),\\s+(${DIGIT_WORD_NON_CAPTURING_PATTERN})\\s+(${DIGIT_WORD_NON_CAPTURING_PATTERN})\\b`, 'gi'), (match, prefix: string, d1: string, d2: string) => {
      const code = spellingSequenceFor(prefix.replace(/^route\s+/i, ''));
      const digits = digitsFor(d1, d2);
      return code && digits ? `route ${code}${digits}` : match;
    })
    .replace(new RegExp(`\\broute\\s+([A-Z]),\\s+(${DIGIT_WORD_NON_CAPTURING_PATTERN})\\s+(${DIGIT_WORD_NON_CAPTURING_PATTERN})\\b`, 'gi'), (match, code: string, d1: string, d2: string) => {
      const digits = digitsFor(d1, d2);
      return digits ? `route ${code.toUpperCase()}${digits}` : match;
    }));
  trackedRule(state, 'PRESSURE-002', 'context-required', (value) => value.replace(
    new RegExp(`\\b(altimeter\\s+setting)\\s+(${DIGIT_WORD_SEQUENCE_PATTERN})\\b`, 'gi'),
    (match, prefix: string, spoken: string) => {
      const pressure = pressureDigitsFor(spoken);
      return pressure ? `${prefix} ${pressure}` : match;
    },
  ));
  trackedRule(state, 'EQUIPMENT-001', 'context-required', (value) => value.replace(
    new RegExp(`\\b(ADS-B\\s+receiver)\\s+(${DIGIT_WORD_SEQUENCE_PATTERN})\\b`, 'gi'),
    (match, prefix: string, spoken: string) => {
      const digits = digitsFromText(spoken);
      return digits ? `${prefix} ${digits}` : match;
    },
  ));
  trackedRule(state, 'NOTAM-001', 'guarded', (value) => value.replace(/\bNote\s+to\s+say\b/gi, 'NOTAM says'));
  trackedRule(state, 'TAXIWAY-002', 'guarded', (value) => value.replace(/\b(taxiway\s+Zulu),\s+Foxtail\b/gi, '$1 4'));
  trackedRule(state, 'TAXIWAY-003', 'context-required', (value) => value.replace(
    new RegExp(`\\b(taxiway\\s+)(${ICAO_SPELLING_WORD_PATTERN})\\b(?!\\s+(?:\\d|${DESIGNATOR_DIGIT_WORD_PATTERN})\\b)(?=\\s+(?:to|for|at|about|and|is|was|will|then|before|after|on|near|with|where|which|that|has|had|shall)\\b|[,.;?!])`, 'gi'),
    (match, prefix: string, spelling: string) => {
      const code = spellingTokenFor(spelling);
      return code ? `${prefix}${code}` : match;
    },
  ));
  trackedRule(state, 'TXT-002', 'safe', normalizeSpaces);
  return { transcript: state.transcript, transformations: state.transformations, version: AVIATION_TRANSCRIPT_NORMALIZATION_VERSION };
}

export function normalizeAviationTranscript(input: string): string {
  return normalizeAviationTranscriptDetailed(input).transcript;
}
