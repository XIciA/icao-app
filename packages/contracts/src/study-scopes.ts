/** Canonical membership: rank 2 is necessarily also in rank 1. */
export type StudyScope = 'all' | 'selected' | 'crash';
export type StudyTier = 0 | 1 | 2;
export type StudyScopeCardIds = { all: string[]; selected: string[]; crash: string[] };
export function normalizeStudyScope(value: unknown): StudyScope {
  return value === 'all' || value === 'crash' ? value : 'selected';
}

/** Derived catalog projection only; the authoritative rank stays on the card
 * (or complete scenario). IDs carry no protected question/answer text. */
export function studyScopeCardIds(bankId: string, topic: { studyTier?: unknown; cards: readonly { id: string; studyTier?: unknown }[] }): StudyScopeCardIds {
  const selected: string[] = [], crash: string[] = [];
  for (const card of topic.cards) {
    const tier = bankId === 'sentences900' ? 2 : topic.studyTier ?? card.studyTier ?? 0;
    if (tier === 1 || tier === 2) selected.push(card.id);
    if (tier === 2) crash.push(card.id);
  }
  return { all: topic.cards.map((card) => card.id), selected, crash };
}
