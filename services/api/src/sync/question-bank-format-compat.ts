import { formatRevisions } from './question-bank-format-revisions';

type Value = Record<string, unknown>;
const object = (value: unknown): Value => value && typeof value === 'object' && !Array.isArray(value) ? value as Value : {};

/** Rebase only exact, reviewed old text fingerprints. Never guess from a quote,
 * delete a highlight, or modify learning completion, answers, notes or recordings.
 * This also covers late uploads from an offline older installed client. */
export function rebaseFormattedAnnotations(document: Value): Value {
  if (!document.entries || typeof document.entries !== 'object') return document;
  return { ...document, entries: Object.fromEntries(Object.entries(object(document.entries)).map(([key, value]) => {
    const entry = object(value);
    if (!Array.isArray(entry.highlights)) return [key, value];
    return [key, { ...entry, highlights: entry.highlights.map((raw: unknown) => {
      const highlight = object(raw);
      const revision = formatRevisions[`${String(entry.bankId)}:${String(entry.categoryId)}:${String(entry.topicId)}:${String(entry.cardId)}:${String(highlight.blockId)}:${String(highlight.contentFingerprint)}`];
      if (!revision || typeof highlight.wordIndex !== 'number') return raw;
      const index = highlight.wordIndex;
      const run = revision.runs.find(([start = 0, , length = 0]) => index >= start && index < start + length);
      // A deliberately removed label has no current token. Keep its complete
      // original context, available in the annotations list and rollback backup.
      if (!run) return raw;
      return { ...highlight, wordIndex: index - run[0]! + run[1]!, contentFingerprint: revision.fingerprint };
    }) }];
  })) };
}
