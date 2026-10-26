/** Owned by the exam package, so navigating/remounting a question cannot refill it. */
export type SentenceReplayLedger = { usedGroups: Record<string, string>; completedItems: Record<string, true> };
export function createSentenceReplayLedger(): SentenceReplayLedger { return { usedGroups: {}, completedItems: {} }; }
export function consumeSentenceReplay(ledger: SentenceReplayLedger, group: string, item: string) {
  if (!ledger.completedItems[item] || ledger.usedGroups[group]) return false;
  ledger.usedGroups[group] = item;
  return true;
}
