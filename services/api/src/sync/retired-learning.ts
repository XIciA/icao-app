import { retiredQuestionCards } from './retired-question-cards';

type Value = Record<string, unknown>;
const object = (value: unknown): Value => value && typeof value === 'object' && !Array.isArray(value) ? value as Value : {};
const retired = new Set(retiredQuestionCards.map(card => `${card.bankId}:${card.cardId}`));
export function isRetiredCard(bankId: unknown, cardId: unknown) { return retired.has(`${String(bankId)}:${String(cardId)}`); }
export function emptyRetiredState(updatedAt: string) { return { visited: false, completed: false, note: '', updatedAt }; }
export function sanitizeRetiredAnnotations(value: Value): Value {
  if (!value.entries || typeof value.entries !== 'object') return value;
  return { ...value, entries: Object.fromEntries(Object.entries(object(value.entries)).filter(([, entry]) => {
    const item = object(entry); return !isRetiredCard(item.bankId, item.cardId);
  })) };
}
const retiredItem = (value: unknown) => {
  const item = object(value); const source = object(item.source);
  return isRetiredCard(object(item.dataset).id ?? source.bankId, object(item.card).id ?? source.cardId);
};
export function sanitizeRetiredLearningRecord(value: Value): Value {
  const tombstone = () => ({ deleted: true, recordType: value.recordType, sessionId: value.sessionId });
  if (value.deleted === true) return value;
  if (isRetiredCard(value.bankId, value.cardId)) return tombstone();
  let result = value;
  for (const key of ['studyReview', 'vercelStudyReview', 'vercelListeningReview']) {
    const review = object(value[key]);
    if (!Array.isArray(review.items) || !review.items.some(retiredItem)) continue;
    if (value.recordType === 'mock_exam' || value.mockExam || key === 'vercelListeningReview') return tombstone();
    const items = review.items.filter(item => !retiredItem(item));
    if (!items.length) return tombstone();
    const ids = new Set(items.map(item => object(item).id));
    const states = Object.fromEntries(Object.entries(object(review.states)).filter(([id]) => ids.has(id)));
    const answers = Object.fromEntries(Object.entries(object(review.answers)).filter(([id]) => ids.has(id)));
    const completedCount = Object.values(states).filter(state => object(state).completed === true).length;
    const studiedCount = Object.values(states).filter(state => object(state).visited === true).length;
    let answeredCount = 0; let correctCount = 0;
    for (const entry of items) {
      const item = object(entry); const id = String(item.id); const state = object(states[id]);
      const chosen = state.selectedChoiceIndex;
      if (typeof chosen === 'number') { answeredCount += 1; if (chosen === object(item.card).correctChoiceIndex) correctCount += 1; }
      else if (typeof answers[id] === 'string' && String(answers[id]).trim()) answeredCount += 1;
    }
    result = { ...result, [key]: { ...review, items, states, answers }, totalCount: items.length, completedCount, studiedCount, answeredCount, correctCount };
    // Per-question feedback for removed items must not survive in a second copy.
    for (const field of ['studyFeedback']) if (result[field]) result[field] = Object.fromEntries(Object.entries(object(result[field])).filter(([id]) => ids.has(id)));
    for (const field of ['annotationCount', 'noteCount', 'feedbackCount']) delete result[field];
  }
  return result;
}
export function sanitizeRetiredSyncPayload(kind: string, value: Value): Value {
  if (kind === 'card_state' && isRetiredCard(value.bankId, value.cardId)) return { ...value, state: emptyRetiredState(String(value.updatedAt ?? new Date(0).toISOString())) };
  if (kind === 'document' && value.documentKey === 'annotations') return { ...value, document: sanitizeRetiredAnnotations(object(value.document)) };
  if (kind === 'learning_record' && value.record) {
    const record = sanitizeRetiredLearningRecord(object(value.record));
    return { ...value, record, ...(record.deleted ? { deleted: true } : {}) };
  }
  return value;
}
