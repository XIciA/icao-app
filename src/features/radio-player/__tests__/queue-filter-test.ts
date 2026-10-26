import { DEFAULT_ANNOTATION_HIGHLIGHTS, DEFAULT_ANNOTATION_TAGS, type QuestionBankAnnotationStore } from '../../question-bank/annotations/types';
import { emptyRadioQueueFilter, filterRadioCatalogs, matchingRadioAnnotations, radioDirectory } from '../queue-filter';
import type { RadioCatalog, RadioTrack } from '../types';
const track = (id: string, categoryId = 'a', topicId = 'one'): RadioTrack => ({ id, bankId: 'listening', bankTitle: '听力', categoryId, categoryTitle: categoryId, topicId, topicTitle: '同名分组', title: id, audioPath: '/a.mp3', audioText: '', durationSeconds: 1, stableIndex: 0 });
const catalogs: RadioCatalog[] = [{ bankId: 'listening', title: '听力', nameEn: 'Listening', tracks: [track('1'), track('2'), track('3'), track('1', 'b')] }];
const store: QuestionBankAnnotationStore = { version: 2, legacyImported: true, tagDefinitions: DEFAULT_ANNOTATION_TAGS, highlightDefinitions: DEFAULT_ANNOTATION_HIGHLIGHTS, entries: {
  first: { bankId: 'listening', categoryId: 'a', topicId: 'one', cardId: '1', tagIds: ['good', 'memory'], highlights: [{ colorId: 'red', blockId: 'question', wordIndex: 0, quote: '', sentence: '', contentFingerprint: '' }], note: '笔记', updatedAt: '' },
  second: { bankId: 'listening', categoryId: 'a', topicId: 'one', cardId: '2', tagIds: ['confused'], highlights: [], note: '  ', updatedAt: '' },
  third: { bankId: 'listening', categoryId: 'a', topicId: 'one', cardId: '3', tagIds: ['deleted'], highlights: [], note: '有笔记', updatedAt: '' },
} };
const ids = (filter: typeof emptyRadioQueueFilter) => filterRadioCatalogs(catalogs, matchingRadioAnnotations(store, filter))[0].tracks.map(item => item.id);
it('ORs selected types and colors and emits each question only once', () => {
  expect(ids({ ...emptyRadioQueueFilter, tags: true, tagIds: ['good', 'confused'], highlights: true, highlightIds: ['red'], notes: true })).toEqual(['1', '2', '3']);
});
it('keeps tag and highlight IDs distinct and ignores removed definitions', () => {
  expect(ids({ ...emptyRadioQueueFilter, tags: true, tagIds: ['red'] })).toEqual([]);
  expect(ids({ ...emptyRadioQueueFilter, highlights: true, highlightIds: ['red'] })).toEqual(['1']);
  expect(ids({ ...emptyRadioQueueFilter, tags: true })).toEqual(['1', '2']);
  expect(ids({ ...emptyRadioQueueFilter, notes: true })).toEqual(['1', '3']);
});
it('preserves empty banks and restores all tracks without filtering', () => {
  expect(filterRadioCatalogs(catalogs, new Set())[0].tracks).toEqual([]);
  expect(filterRadioCatalogs(catalogs)).toBe(catalogs);
});
it('uses category/topic identities, preserving directory order even for same-name topics', () => {
  const tree = radioDirectory([track('1'), track('2', 'a', 'two'), track('3', 'b', 'one')]);
  expect(tree.map(item => item.id)).toEqual(['a', 'b']);
  expect(tree[0].topics.map(item => item.id)).toEqual(['one', 'two']);
  expect(tree[1].tracks.map(item => item.id)).toEqual(['3']);
});
