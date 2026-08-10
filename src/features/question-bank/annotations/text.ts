export function contentFingerprint(text: string) {
  let hash = 5381;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 33) ^ text.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

export type StudyTextToken = {
  end: number;
  start: number;
  text: string;
  whitespace: boolean;
  wordIndex?: number;
};

export function tokenizeStudyText(text: string): StudyTextToken[] {
  let cursor = 0;
  let wordIndex = -1;
  return text.split(/(\s+)/).filter(Boolean).map((part) => {
    const start = cursor;
    const end = start + part.length;
    const whitespace = /^\s+$/.test(part);
    cursor = end;
    if (!whitespace) wordIndex += 1;
    return { end, start, text: part, whitespace, wordIndex: whitespace ? undefined : wordIndex };
  });
}

export function sentenceAround(text: string, start: number) {
  const before = text.slice(0, start);
  const fromStart = text.slice(start);
  const leftBoundary = Math.max(
    before.lastIndexOf('.'),
    before.lastIndexOf('!'),
    before.lastIndexOf('?'),
    before.lastIndexOf(';'),
  );
  const boundaryMatch = fromStart.match(/[.!?;]/);
  const sentenceStart = leftBoundary >= 0 ? leftBoundary + 1 : 0;
  const sentenceEnd = typeof boundaryMatch?.index === 'number' ? start + boundaryMatch.index + 1 : text.length;
  return text.slice(sentenceStart, sentenceEnd).replace(/\s+/g, ' ').trim();
}

export function wordContextAt(text: string, targetWordIndex: number) {
  for (const token of tokenizeStudyText(text)) {
    if (token.wordIndex === targetWordIndex) {
      return { quote: token.text, sentence: sentenceAround(text, token.start) };
    }
  }
  return undefined;
}

export function sentenceWordRangeAt(text: string, targetWordIndex: number) {
  const words = tokenizeStudyText(text).filter((token) => !token.whitespace);
  const targetPosition = words.findIndex((token) => token.wordIndex === targetWordIndex);
  if (targetPosition < 0) return undefined;
  const target = words[targetPosition];
  const sentence = sentenceAround(text, target.start);
  let first = targetPosition;
  let last = targetPosition;
  while (first > 0 && sentenceAround(text, words[first - 1].start) === sentence) first -= 1;
  while (last < words.length - 1 && sentenceAround(text, words[last + 1].start) === sentence) last += 1;
  return {
    endWordIndex: words[last].wordIndex!,
    sentence,
    startWordIndex: words[first].wordIndex!,
  };
}
