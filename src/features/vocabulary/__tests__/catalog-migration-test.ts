import { migrateVocabularyDocument, vocabularyRetiredIds, vocabularyRetiredFavoriteKeys } from '@icao/contracts';
import type { VocabularyState } from '../types';

const oldAt='2026-10-25T00:00:00.000Z', newAt='2026-10-26T00:00:00.000Z';
const progress=(status:'known'|'forgot'|'wrong'='known', favorite=false, updatedAt=oldAt)=>({status,favorite,updatedAt});
const empty:VocabularyState={schemaVersion:1,words:{},updatedAt:oldAt};
const removed=Object.entries(vocabularyRetiredIds).find(([,id])=>id===null)![0];
const [merged,target]=Object.entries(vocabularyRetiredIds).find(([,id])=>typeof id==='string')! as [string,string];

it('preserves unrelated retained progress and lookup favorites verbatim',()=>{
  const value={...empty,words:{'unaffected':progress('forgot',true),'__word_favorite__:v1:independent':progress('known',true)}};
  expect(migrateVocabularyDocument(value)).toBe(value);
});
it('removes split/deleted IDs and their obsolete favorites and tests without leaving missing-word entries',()=>{
  const retiredFavorite=Object.entries(vocabularyRetiredFavoriteKeys).find(([,id])=>id===null)![0];
  const value={...empty,words:{[removed]:progress('wrong',true),[retiredFavorite]:progress('known',true)}};
  expect(migrateVocabularyDocument(value).words).toEqual({});
  const result=migrateVocabularyDocument({...value,lastTest:{answers:[{wordId:removed}]}});
  expect(result.lastTest).toBeUndefined();
});
it('merges aliases conservatively, preserves favorites, and is idempotent',()=>{
  const value={...empty,words:{[target]:progress('known'),[merged]:progress('wrong',true)}};
  const result=migrateVocabularyDocument(value);
  expect(result.words[merged]).toBeUndefined();
  expect(result.words[target]).toMatchObject({status:'wrong',favorite:true});
  expect(migrateVocabularyDocument(result)).toBe(result);
});
it('does not overwrite newer progress on the surviving card with stale legacy sync records',()=>{
  const value={...empty,words:{[target]:progress('known',false,newAt),[merged]:progress('wrong',true,oldAt)}};
  expect(migrateVocabularyDocument(value).words).toEqual({[target]:progress('known',false,newAt)});
});
it('does not turn a learned card back into new merely because its unlearned alias was favorited',()=>{
  const value={...empty,words:{[target]:progress('known'),[merged]:{status:'new' as const,favorite:true,updatedAt:oldAt}}};
  expect(migrateVocabularyDocument(value).words[target]).toMatchObject({status:'known',favorite:true});
});
