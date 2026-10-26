import { prepareVocabularySession } from '../study-session';
import { createEmptyVocabularyState } from '../persistence';
import type { VocabularyWord } from '../types';
import { migrateVocabularyDocument } from '@icao/contracts';
import { releaseFixture } from '../test-support/live-fixture';
const words=releaseFixture().dataset.books.flatMap(book=>book.words) as VocabularyWord[];
it('retains the random queue and next word by ID across a restart',()=>{
  const empty=createEmptyVocabularyState(),first=prepareVocabularySession(words,empty,'random',undefined,()=>0.7);
  const saved={...empty,studySession:{...first.session,nextWordId:first.queue[4]!.id}};
  const resumed=prepareVocabularySession([...words].reverse(),saved,'random',undefined,()=>0.1);
  expect(resumed.queue.map(word=>word.id)).toEqual(first.queue.map(word=>word.id));expect(resumed.index).toBe(4);
});
it('starts a fresh queue after completion, a scope change, or an explicit order change',()=>{
  const empty=createEmptyVocabularyState(),first=prepareVocabularySession(words,empty,'frequency');
  const saved={...empty,studySession:first.session};
  expect(prepareVocabularySession(words.slice(0,3),saved,'frequency').queue).toHaveLength(3);
  expect(prepareVocabularySession(words,{...saved,studySession:{...first.session,nextWordId:null}},'random',undefined,()=>0).session.order).toBe('random');
});
it('removes retired session IDs, resolves merged IDs and finds the next actual unlearned word',()=>{
  const release=releaseFixture(),a=words[0]!.id,b=words[1]!.id,c=words[2]!.id;
  const state={...createEmptyVocabularyState(),studySession:{wordIds:['removed','merged',b,c],nextWordId:'removed',order:'random' as const,startedAt:'2026-10-27T00:00:00.000Z',updatedAt:'2026-10-27T00:00:00.000Z'}};
  const policy={...release.policy,retiredIds:{removed:null,merged:a}};
  const migrated=migrateVocabularyDocument(state,policy);
  expect(migrated.studySession?.wordIds).toEqual([a,b,c]);expect(migrated.studySession?.nextWordId).toBe(a);
});
