export const ANNOTATION_PALETTE = {
  green: '#34C98A', yellow: '#F2C94C', red: '#F06570', blue: '#1F5ED9',
  purple: '#9267C7', orange: '#E99437', teal: '#249B91', pink: '#D66DA3',
  indigo: '#5966B5', brown: '#A57955', slate: '#738396', cyan: '#39AFC8',
} as const;
export type ManagedAnnotationTone = keyof typeof ANNOTATION_PALETTE;
export type ManagedAnnotationDefinition = { id: string; label: string; color: ManagedAnnotationTone; builtIn?: boolean };
export type AnnotationDeletions = { tags: string[]; highlights: string[] };

export function normalizeAnnotationDefinitions(values: unknown, defaults: ManagedAnnotationDefinition[], deleted: string[] = []) {
  const ids = new Set<string>(); const colors = new Set<string>();
  const result: ManagedAnnotationDefinition[] = [];
  for (const raw of Array.isArray(values) ? values : defaults) {
    if (!raw || typeof raw !== 'object') continue;
    const value = raw as Partial<ManagedAnnotationDefinition>;
    if (!value.id || ids.has(value.id) || deleted.includes(value.id) || typeof value.label !== 'string' || !value.label.trim()
      || !value.color || !Object.hasOwn(ANNOTATION_PALETTE, value.color)) continue;
    ids.add(value.id);
    // Preserve ID, label and references during migration. Overflow is retained,
    // never silently merged or removed; the editor can delete/reassign it later.
    const color = colors.has(value.color) ? (Object.keys(ANNOTATION_PALETTE) as ManagedAnnotationTone[]).find((tone) => !colors.has(tone)) ?? value.color : value.color;
    colors.add(color);
    result.push({ id: value.id, label: value.label.trim(), color, builtIn: value.builtIn === true });
  }
  return result;
}

/** An old client may omit unknown colors and resurrect its hardcoded defaults.
 * Preserve definitions it cannot represent and honor accumulated deletions.
 * Existing entry edits still use the document owner's version/conflict protocol.
 */
export function preserveManagedAnnotations(previous: Record<string, unknown> | undefined, incoming: Record<string, unknown>) {
  if (previous?.version !== 2) return incoming;
  const oldClient = incoming.version !== 2;
  const oldChoiceClient = incoming.choiceHighlights !== true;
  const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
  const tombstones = (value: unknown) => value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const previousDeleted = tombstones(previous.deletedDefinitions); const incomingDeleted = tombstones(incoming.deletedDefinitions);
  const deletedDefinitions = {
    tags: [...new Set([...strings(previousDeleted.tags), ...strings(incomingDeleted.tags)])],
    highlights: [...new Set([...strings(previousDeleted.highlights), ...strings(incomingDeleted.highlights)])],
  };
  const merged: Record<string, unknown> = { ...incoming, version: 2, choiceHighlights: true, deletedDefinitions };
  if (previous.offlineMerge === true && incoming.offlineMerge !== true) {
    merged.offlineMerge = true;
    merged.deletedEntries = previous.deletedEntries;
    merged.recoveredNotes = previous.recoveredNotes;
  }
  for (const [key, deleted] of [['tagDefinitions', deletedDefinitions.tags], ['highlightDefinitions', deletedDefinitions.highlights]] as const) {
    const current = normalizeAnnotationDefinitions(previous[key], [], deleted);
    const next = normalizeAnnotationDefinitions(incoming[key], [], deleted);
    merged[key] = oldClient
      ? normalizeAnnotationDefinitions([...current, ...next.filter((d) => !current.some((c) => c.id === d.id))], [], deleted)
      : normalizeAnnotationDefinitions(next, [], deleted);
  }
  const tagIds = new Set((merged.tagDefinitions as ManagedAnnotationDefinition[]).map((d) => d.id));
  const highlightIds = new Set((merged.highlightDefinitions as ManagedAnnotationDefinition[]).map((d) => d.id));
  const priorEntries = previous.entries && typeof previous.entries === 'object' ? previous.entries as Record<string, Record<string, unknown>> : {};
  const entries = incoming.entries && typeof incoming.entries === 'object' ? incoming.entries as Record<string, Record<string, unknown>> : {};
  const opaqueTags = new Set((merged.tagDefinitions as ManagedAnnotationDefinition[]).filter((d) => !['green', 'yellow', 'red', 'blue'].includes(d.color)).map((d) => d.id));
  const opaqueHighlights = new Set((merged.highlightDefinitions as ManagedAnnotationDefinition[]).filter((d) => !['green', 'yellow', 'red', 'blue'].includes(d.color)).map((d) => d.id));
  merged.entries = Object.fromEntries([...new Set([...Object.keys(entries), ...((oldClient || oldChoiceClient) ? Object.keys(priorEntries) : [])])].flatMap((key) => {
    const value = entries[key]; const prior = priorEntries[key];
    if (!value && !oldClient && !oldChoiceClient) return [];
    const deletion = tombstones(tombstones(merged.deletedEntries)[key]);
    if (typeof deletion.at === 'string' && value?.baseUpdatedAt !== deletion.at && value?.restoredAfterDeletion !== deletion.at) return [];
    const highlights = (data: unknown) => Array.isArray(data) ? data.filter((h): h is Record<string, unknown> => Boolean(h && typeof h === 'object' && typeof h.colorId === 'string')) : [];
    const retainedTags = oldClient ? strings(prior?.tagIds).filter((id) => opaqueTags.has(id)) : [];
    const retainedHighlights = highlights(prior?.highlights).filter((h) => (oldClient && opaqueHighlights.has(String(h.colorId))) || (oldChoiceClient && /^choice-\d+$/.test(String(h.blockId))));
    if (!value && !retainedTags.length && !retainedHighlights.length) return [];
    const combinedHighlights = new Map<string, Record<string, unknown>>();
    for (const h of [...retainedHighlights, ...highlights(value?.highlights)]) if (highlightIds.has(String(h.colorId))) combinedHighlights.set(`${h.blockId}:${h.wordIndex}`, h);
    return [[key, { ...(value ?? prior), tagIds: [...new Set([...strings(value?.tagIds), ...retainedTags])].filter((id) => tagIds.has(id)), highlights: [...combinedHighlights.values()], ...(!value ? { note: '' } : {}) }]];
  }));
  return merged;
}

export type RecoveredAnnotationNote = { id: string; bankId: string; cardId: string; note: string; updatedAt: string; reason: 'conflict' | 'retired' };
export type AnnotationEntryDeletion = { at: string; base?: string };
/** Entry-level reconciliation for offline clients. Retained notes contain user text only. */
export function mergeOfflineAnnotations(previous: Record<string, unknown>, incoming: Record<string, unknown>) {
  const object = (value: unknown): Record<string, any> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
  const validEntries = (value: unknown) => Object.fromEntries(Object.entries(object(value)).filter(([, entry]) => entry && typeof entry === 'object' && !Array.isArray(entry) && typeof entry.updatedAt === 'string'));
  const prior = validEntries(previous.entries); const next = validEntries(incoming.entries);
  const deletions = (value: unknown) => Object.fromEntries(Object.entries(object(value)).filter(([, entry]) => entry && typeof entry === 'object' && typeof entry.at === 'string'));
  const deleted = { ...deletions(previous.deletedEntries) };
  for (const [key, deletion] of Object.entries(deletions(incoming.deletedEntries))) {
    if (!deleted[key] || String(deletion.at) > String(deleted[key].at)) deleted[key] = deletion;
  }
  const recovered = new Map<string, RecoveredAnnotationNote>();
  for (const value of [...(Array.isArray(previous.recoveredNotes) ? previous.recoveredNotes : []), ...(Array.isArray(incoming.recoveredNotes) ? incoming.recoveredNotes : [])]) {
    if (value && typeof value.id === 'string' && typeof value.note === 'string') recovered.set(value.id, value);
  }
  const preserve = (key: string, entry: Record<string, any>) => {
    if (typeof entry.note !== 'string' || !entry.note.trim()) return;
    const id = `${key}/${entry.updatedAt}/${entry.note}`;
    recovered.set(id, { id, bankId: String(entry.bankId), cardId: String(entry.cardId), note: entry.note, updatedAt: String(entry.updatedAt), reason: 'conflict' });
  };
  const entries: Record<string, unknown> = {};
  for (const key of new Set([...Object.keys(prior), ...Object.keys(next)])) {
    let a = prior[key]; let b = next[key]; const deletion = deleted[key];
    if (deletion) {
      // A deliberate new edit after observing deletion may recreate an entry.
      const restored = (entry: Record<string, any> | undefined) => entry && (entry.baseUpdatedAt === deletion.at || entry.restoredAfterDeletion === deletion.at);
      const restoredA = restored(a); const restoredB = restored(b);
      if (!restoredA && !restoredB) {
        for (const entry of [a, b]) if (entry && entry.updatedAt !== deletion.base) preserve(key, entry);
        continue;
      }
      // Recreated entries still need normal ordering and conflict reconciliation.
      a = restoredA ? { ...a, restoredAfterDeletion: deletion.at } : undefined;
      b = restoredB ? { ...b, restoredAfterDeletion: deletion.at } : undefined;
    }
    if (!a || !b) { entries[key] = a ?? b; continue; }
    if (a.updatedAt === b.updatedAt && a.note === b.note) { entries[key] = a; continue; }
    if (b.baseUpdatedAt === a.updatedAt || Array.isArray(b.ancestorUpdatedAts) && b.ancestorUpdatedAts.includes(a.updatedAt)) { entries[key] = b; continue; }
    if (a.baseUpdatedAt === b.updatedAt || Array.isArray(a.ancestorUpdatedAts) && a.ancestorUpdatedAts.includes(b.updatedAt)) { entries[key] = a; continue; }
    const winner = String(b.updatedAt) > String(a.updatedAt) ? b : a;
    const other = winner === b ? a : b;
    if (winner.note !== other.note) preserve(key, other);
    entries[key] = winner;
  }
  return { ...incoming, offlineMerge: true, entries, deletedEntries: deleted, recoveredNotes: [...recovered.values()] };
}
