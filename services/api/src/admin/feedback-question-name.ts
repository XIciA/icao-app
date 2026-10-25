/** Resolve names within the submitted directory, never by a matching card ID elsewhere. */
export function feedbackQuestionName(payload: unknown, context: { categoryId: string; topicId: string; cardId: string }): string | undefined {
  const object = (value: unknown): Record<string, unknown> | undefined =>
    value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
  const entries = (value: unknown) => Array.isArray(value) ? value.map(object).filter((entry): entry is Record<string, unknown> => !!entry) : [];
  const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
  const bank = object(payload);
  const category = entries(bank?.categories).find(entry => entry.id === context.categoryId);
  const topic = entries(category?.topics).find(entry => entry.id === context.topicId);
  const card = entries(topic?.cards).find(entry => entry.id === context.cardId);
  if (!card || !text(card.taskTitle)) return undefined;
  return [text(bank?.title), text(category?.name), text(topic?.name), text(card.taskTitle)].filter(Boolean).join(' / ');
}
