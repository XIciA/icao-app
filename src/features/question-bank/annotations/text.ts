export function contentFingerprint(text: string) {
  let hash = 5381;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 33) ^ text.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

export function sentenceAround(text: string, start: number, end: number) {
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
  let wordIndex = -1;
  let cursor = 0;
  for (const token of text.split(/(\s+)/)) {
    const start = cursor;
    const end = start + token.length;
    cursor = end;
    if (!token || /^\s+$/.test(token)) continue;
    wordIndex += 1;
    if (wordIndex === targetWordIndex) {
      return { quote: token, sentence: sentenceAround(text, start, end) };
    }
  }
  return undefined;
}
