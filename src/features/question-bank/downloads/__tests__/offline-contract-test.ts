import { offlineTopicCards, offlineScopeIncludes } from '@icao/contracts';
import { mergeOfflineAnnotations } from '@icao/contracts/annotation-management';
const card = (id: string, studyTier: number) => ({ id, studyTier });
test('four level includes levels 3 and 4, five includes all; selected uses learning scope', () => {
  const topic = { cards: [card('a', 0), card('b', 1), card('c', 2), { ...card('retired', 1), retired: true }] };
  expect(offlineTopicCards('sentences900', '3级', topic, 'icao4').map(c => c.id)).toEqual(['a', 'b', 'c']);
  expect(offlineTopicCards('sentences900', '5级', topic, 'icao4')).toEqual([]);
  expect(offlineTopicCards('sentences900', '5级', topic, 'icao5')).toHaveLength(3);
  expect(offlineTopicCards('listening', '听力', topic, 'selected').map(c => c.id)).toEqual(['b', 'c']);
  expect(offlineScopeIncludes('all', 'selected')).toBe(true);
  expect(offlineScopeIncludes('icao4', 'icao5')).toBe(false);
});
const entry = (note: string, updatedAt: string, baseUpdatedAt?: string) => ({ bankId: 'opi', cardId: 'one', note, updatedAt, baseUpdatedAt });
test('concurrent changes on different notes are merged', () => {
  const result = mergeOfflineAnnotations({ entries: { a: entry('A', '1') } }, { entries: { b: entry('B', '2') } });
  expect(Object.keys(result.entries)).toEqual(['a', 'b']);
});
test('normal sequential edit does not create a conflict; concurrent text is retained idempotently', () => {
  const first = { entries: { a: entry('old', '1') } };
  const normal = mergeOfflineAnnotations(first, { entries: { a: entry('new', '2', '1') } });
  expect(normal.recoveredNotes).toHaveLength(0);
  const conflict = mergeOfflineAnnotations(normal, { entries: { a: entry('other', '3', '1') } });
  expect(conflict.recoveredNotes.map(n => n.note)).toEqual(['new']);
  expect(mergeOfflineAnnotations(conflict, conflict).recoveredNotes).toHaveLength(1);
});
test('deletion wins without silently discarding a concurrent note', () => {
  const result = mergeOfflineAnnotations({ entries: { a: entry('edited offline', '2', '1') } }, { entries: {}, deletedEntries: { a: { at: '3', base: '1' } } });
  expect(result.entries).toEqual({});
  expect(result.recoveredNotes[0].note).toBe('edited offline');
});

test('a deliberate recreation and subsequent edit survive stale deletion replay', () => {
  const deleted = { entries: {}, deletedEntries: { a: { at: '3', base: '1' } } };
  const restored = mergeOfflineAnnotations(deleted, { entries: { a: entry('recreated', '4', '3') } });
  const edited = mergeOfflineAnnotations(restored, { entries: { a: { ...(restored.entries.a as object), ...entry('edited after recreation', '5', '4') } } });
  const replay = mergeOfflineAnnotations(edited, deleted);
  expect((replay.entries.a as { note: string }).note).toBe('edited after recreation');
});

test('multiple offline edits on one device are sequential, not a false conflict', () => {
  const server = { entries: { a: entry('original', '1') } };
  const offline = { entries: { a: { ...entry('third edit', '4', '1'), ancestorUpdatedAts: ['1', '2', '3'] } } };
  const merged = mergeOfflineAnnotations(server, offline);
  expect((merged.entries.a as { note: string }).note).toBe('third edit');
  expect(merged.recoveredNotes).toEqual([]);
});

test('stale recreated entries cannot overwrite later edits, and concurrent recreated notes survive', () => {
  const deletedEntries = { a: { at: '3', base: '1' } };
  const older = { entries: { a: { ...entry('restored', '4', '3'), restoredAfterDeletion: '3' } }, deletedEntries };
  const newer = { entries: { a: { ...entry('latest', '5', '4'), restoredAfterDeletion: '3' } }, deletedEntries };
  expect((mergeOfflineAnnotations(newer, older).entries.a as { note: string }).note).toBe('latest');
  const concurrent = { entries: { a: { ...entry('parallel', '6', '4'), restoredAfterDeletion: '3' } }, deletedEntries };
  expect(mergeOfflineAnnotations(newer, concurrent).recoveredNotes.map(n => n.note)).toEqual(['latest']);
});
