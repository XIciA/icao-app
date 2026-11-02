import rows from '../data/directory-relocations.json';
import { storageTarget, storageTopicId, storageTopicIds } from '../data/directory-storage-identity';
import { questionBankCardTargetKey } from '../annotations/card-index.native';
import { createEmptyAnnotationStore, setAnnotationEntry, getAnnotationEntry } from '../annotations/annotation-store.native';

test('every reviewed move preserves old annotation and cloud-state identity in both directions', () => {
  for (const raw of rows) {
    const [bankId, fromCategoryId, fromTopicId, toCategoryId, toTopicId, ids] = raw as [string,string,string,string,string,string[]];
    for (const cardId of ids) {
      const before = { bankId, categoryId: fromCategoryId, topicId: fromTopicId, cardId };
      const after = { bankId, categoryId: toCategoryId, topicId: toTopicId, cardId };
      expect(storageTarget(after)).toEqual(before);
      expect(storageTarget(before)).toEqual(before);
      expect(storageTopicId(toTopicId, cardId)).toBe(fromTopicId);
      expect(storageTarget({...after, bankId: 'unrelated'}).topicId).toBe(toTopicId);
      expect(questionBankCardTargetKey(after as never)).toBe(questionBankCardTargetKey(before as never));
    }
  }
});
test('new-directory annotation edits and deletions reuse the original key and tombstone', () => {
  const [bankId, categoryId, topicId, nextCategoryId, nextTopicId, ids] = rows[0] as [string,string,string,string,string,string[]];
  const old = {bankId,categoryId,topicId,cardId:ids[0]} as never;
  const next = {bankId,categoryId:nextCategoryId,topicId:nextTopicId,cardId:ids[0]} as never;
  const entry = {...next as object,note:'keep my note',highlights:[],tagIds:[],updatedAt:'2026-11-01T00:00:00Z'} as never;
  const saved = setAnnotationEntry(createEmptyAnnotationStore(), next, entry);
  expect(getAnnotationEntry(saved, old)?.note).toBe('keep my note');
  expect(getAnnotationEntry(saved, next)?.topicId).toBe(topicId);
  expect(Object.keys(saved.entries)).toHaveLength(1);
  const deleted = setAnnotationEntry(saved, next, {...entry as object,note:''} as never);
  expect(Object.keys(deleted.entries)).toHaveLength(0);
  expect(deleted.deletedEntries?.[questionBankCardTargetKey(old)]).toBeDefined();
  expect(storageTopicIds({id:nextTopicId,cards:[{id:ids[0]}]})).toContain(topicId);
});
