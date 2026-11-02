import rows from './directory-relocations.json';

type Target = { bankId: string; categoryId: string; topicId: string; cardId: string };
const identities = new Map<string, { bankId: string; categoryId: string; topicId: string; currentTopicId: string }>();
for (const row of rows) {
  const [bankId, categoryId, topicId, , currentTopicId, ids] = row as [string, string, string, string, string, string[]];
  for (const cardId of ids) identities.set(cardId, { bankId, categoryId, topicId, currentTopicId });
}
/** A directory move does not create a new learning identity. Keep existing cloud,
 * offline outbox, annotation tombstone and legacy-client keys intact. */
export function storageTarget<T extends Target>(target: T): T {
  const saved = identities.get(target.cardId);
  return saved?.bankId === target.bankId && [saved.topicId, saved.currentTopicId].includes(target.topicId)
    ? { ...target, categoryId: saved.categoryId, topicId: saved.topicId } : target;
}
export function storageTopicId(topicId: string, cardId: string) {
  const saved = identities.get(cardId);
  return saved && [saved.topicId, saved.currentTopicId].includes(topicId) ? saved.topicId : topicId;
}
export function storageTopicIds(topic: { id: string; cards: readonly { id: string }[]; scopeCardIds?: { all: string[] } }) {
  return [...new Set([topic.id, ...(topic.scopeCardIds?.all ?? topic.cards.map(c => c.id)).map(id => storageTopicId(topic.id, id))])];
}
