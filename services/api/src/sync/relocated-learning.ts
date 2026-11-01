import { questionRelocations } from './question-relocations';

type Value = Record<string, unknown>;
const object = (value: unknown): Value => value && typeof value === 'object' && !Array.isArray(value) ? value as Value : {};
export function isRelocatedOldLocation(bankId: unknown, topicId: unknown, cardId: unknown) {
  return questionRelocations.some(row => row.bankId === bankId && row.fromTopicId === topicId && row.cardId === cardId);
}
const oldKey = (key: unknown) => typeof key === 'string' && questionRelocations.some(row => key.startsWith(`${row.bankId}:${row.fromCategoryId}:${row.fromTopicId}:${row.cardId}`));
export function clearRelocatedAnnotations(value: Value): Value {
  const entries = object(value.entries);
  const removed = Object.entries(entries).filter(([, raw]) => { const e = object(raw); return isRelocatedOldLocation(e.bankId, e.topicId, e.cardId); });
  const recovered = Array.isArray(value.recoveredNotes) ? value.recoveredNotes : [];
  const retained = recovered.filter(raw => !oldKey(object(raw).id));
  if (!removed.length && retained.length === recovered.length) return value;
  const deletedEntries = { ...object(value.deletedEntries) };
  for (const [key, raw] of removed) {
    const entry = object(raw);
    // Use the incoming revision as the deletion base: old clients acknowledge
    // the removal without turning this exact note into a recovered conflict.
    deletedEntries[key] = { at: entry.updatedAt, base: entry.updatedAt };
  }
  const keys = new Set(removed.map(([key]) => key));
  return { ...value, entries: Object.fromEntries(Object.entries(entries).filter(([key]) => !keys.has(key))), deletedEntries,
    ...(value.recoveredNotes ? { recoveredNotes: retained } : {}) };
}
const oldItem = (raw: unknown) => {
  const item = object(raw), source = object(item.source);
  return isRelocatedOldLocation(object(item.dataset).id ?? source.bankId, object(item.topic).id ?? source.topicId, object(item.card).id ?? source.cardId);
};
export function clearRelocatedLearningRecord(value: Value): Value {
  if (value.deleted === true) return value;
  // AI summaries do not persist topic IDs. Match the exact old title as well
  // as the reviewed bank/card IDs; new destination titles are different.
  if (value.recordType === 'ai_result' && ['缩略词', '10.缩略词'].includes(String(value.topicTitle))
    && isRelocatedOldLocation(value.bankId, 'opi-fzy-1686', value.cardId)) {
    return { deleted: true, recordType: value.recordType, sessionId: value.sessionId };
  }
  let result = value;
  for (const key of ['studyReview', 'vercelStudyReview', 'vercelListeningReview']) {
    const review = object(result[key]);
    if (!Array.isArray(review.items) || !review.items.some(oldItem)) continue;
    const removed = new Set(review.items.filter(oldItem).map(raw => object(raw).id));
    const items = review.items.filter(raw => !oldItem(raw));
    if (!items.length) return { deleted: true, recordType: value.recordType, sessionId: value.sessionId };
    const keep = (raw: unknown) => Object.fromEntries(Object.entries(object(raw)).filter(([id]) => !removed.has(id)));
    // Keep every unrelated question's snapshot, answer, feedback and recording.
    const states = keep(review.states), answers = keep(review.answers);
    const completedCount = Object.values(states).filter(raw => object(raw).completed === true).length;
    const studiedCount = Object.values(states).filter(raw => object(raw).visited === true).length;
    let answeredCount = 0, correctCount = 0;
    for (const raw of items) {
      const item = object(raw), state = object(states[String(item.id)]);
      if (typeof state.selectedChoiceIndex === 'number') { answeredCount++; if (state.selectedChoiceIndex === object(item.card).correctChoiceIndex) correctCount++; }
      else if (typeof answers[String(item.id)] === 'string' && String(answers[String(item.id)]).trim()) answeredCount++;
    }
    const exam = object(result.mockExam);
    const sectionCounts = Array.isArray(exam.sectionCounts) ? exam.sectionCounts.map(raw => {
      const section = object(raw); return { ...section, total: items.filter(rawItem => object(rawItem).sectionId === section.id).length };
    }) : undefined;
    result = { ...result, ...(sectionCounts ? { mockExam: { ...exam, sectionCounts } } : {}), [key]: { ...review, items, states, answers }, totalCount: items.length, completedCount, studiedCount, answeredCount, correctCount,
      ...(result.studyFeedback ? { studyFeedback: keep(result.studyFeedback) } : {}) };
  }
  return result;
}
export function clearRelocatedSyncPayload(kind: string, value: Value): Value {
  if (kind === 'card_state' && isRelocatedOldLocation(value.bankId, value.topicId, value.cardId)) {
    return { ...value, state: { visited: false, completed: false, note: '', updatedAt: value.updatedAt } };
  }
  if (kind === 'document' && value.documentKey === 'annotations') return { ...value, document: clearRelocatedAnnotations(object(value.document)) };
  if (kind === 'learning_record' && value.record) {
    const record = clearRelocatedLearningRecord(object(value.record));
    return { ...value, record, ...(record.deleted ? { deleted: true } : {}) };
  }
  return value;
}
