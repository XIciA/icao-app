/** Keep the original sentence identifier; this function changes display text only. */
export function sentenceDisplayTitle(cardId: string, fallback: string): string {
  const match = /^sentence900-main-(\d+)$/.exec(cardId);
  return match ? `Sentence${Number(match[1])}` : fallback;
}
