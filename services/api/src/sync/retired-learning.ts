import { vocabularyDocumentSchema, vocabularyDocumentForPolicy } from './vocabulary-document';
import type { VocabularyMigrationPolicy } from '@icao/contracts/vocabulary-live';
import { retiredQuestionCards } from './retired-question-cards';
import { rebaseFormattedAnnotations } from './question-bank-format-compat';

type Value = Record<string, unknown>;
const object = (value: unknown): Value => value && typeof value === 'object' && !Array.isArray(value) ? value as Value : {};
const retired = new Set(retiredQuestionCards.map(card => `${card.bankId}:${card.cardId}`));
export function isRetiredCard(bankId: unknown, cardId: unknown) { return retired.has(`${String(bankId)}:${String(cardId)}`); }
export function emptyRetiredState(updatedAt: string) { return { visited: false, completed: false, note: '', updatedAt }; }
export function sanitizeRetiredAnnotations(value: Value): Value {
  if (!value.entries || typeof value.entries !== 'object') return value;
  const recovered = Array.isArray(value.recoveredNotes) ? [...value.recoveredNotes] : [];
  const entries = Object.fromEntries(Object.entries(object(value.entries)).filter(([key, entry]) => {
    const item = object(entry);
    if (!isRetiredCard(item.bankId, item.cardId)) return true;
    if (typeof item.note === 'string' && item.note.trim()) {
      const id = `retired/${key}/${item.updatedAt}`;
      if (!recovered.some(note => object(note).id === id)) recovered.push({ id, bankId: item.bankId, cardId: item.cardId, note: item.note, updatedAt: item.updatedAt, reason: 'retired' });
    }
    return false;
  }));
  return rebaseFormattedAnnotations({ ...value, entries, ...(recovered.length ? { recoveredNotes: recovered } : {}) });
}

const retiredItem = (value: unknown) => {
  const item = object(value); const source = object(item.source);
  return isRetiredCard(object(item.dataset).id ?? source.bankId, object(item.card).id ?? source.cardId);
};
export function sanitizeRetiredLearningRecord(value: Value): Value {
  // Keep history metadata, never a second copy of retired questions or feedback.
  const tombstone = () => Object.fromEntries(Object.entries({ ...value, sourceUnavailable: true }).filter(([key]) =>
    ['schemaVersion', 'id', 'sessionId', 'cardId', 'bankId', 'bankTitle', 'categoryTitle', 'topicTitle', 'completedCount', 'totalCount',
      'correctCount', 'durationSeconds', 'reason', 'createdAt', 'updatedAt', 'recordType', 'answeredCount', 'studiedCount', 'sourceUnavailable'].includes(key)));
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
export function sanitizeRetiredSyncPayload(kind: string, value: Value, policy?: VocabularyMigrationPolicy): Value {
  if (kind === 'card_state' && isRetiredCard(value.bankId, value.cardId)) return { ...value, state: emptyRetiredState(String(value.updatedAt ?? new Date(0).toISOString())) };
  if (kind === 'document' && value.documentKey === 'vocabulary') {
    if (policy) return { ...value, document: vocabularyDocumentForPolicy(value.document, policy) };
    const parsed = vocabularyDocumentSchema.safeParse(value.document);
    return parsed.success ? { ...value, document: parsed.data } : value;
  }
  if (kind === 'document' && value.documentKey === 'annotations') return { ...value, document: sanitizeRetiredAnnotations(object(value.document)) };
  if (kind === 'learning_record' && value.record) {
    const record = sanitizeRetiredLearningRecord(object(value.record));
    return { ...value, record, ...(record.deleted ? { deleted: true } : {}) };
  }
  return value;
}
