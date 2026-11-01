import { describe, expect, it } from 'vitest';
import { questionRelocations } from './question-relocations';
import { clearRelocatedAnnotations, clearRelocatedLearningRecord, clearRelocatedSyncPayload, isRelocatedOldLocation } from './relocated-learning';
const row = questionRelocations[0]!;
const target = {bankId:row.bankId,categoryId:row.fromCategoryId,topicId:row.fromTopicId,cardId:row.cardId};
const next = {...target,categoryId:row.toCategoryId,topicId:row.toTopicId};
const key = (v:{bankId:string;categoryId:string;topicId:string;cardId:string}) => [v.bankId,v.categoryId,v.topicId,v.cardId].join(':');
const time = '2026-11-01T12:00:00Z';
const old = {id:'old',dataset:{id:'opi'},topic:{id:row.fromTopicId},card:{id:row.cardId},recording:'old'};
const other = {id:'other',dataset:{id:'opi'},topic:{id:'unrelated'},card:{id:'unrelated',correctChoiceIndex:1},recording:'keep'};
describe('reviewed relocation cleanup',()=>{
 it('covers exactly 19 old identities and never clears the new destination',()=>{
  expect(questionRelocations).toHaveLength(19);
  for(const r of questionRelocations){expect(isRelocatedOldLocation(r.bankId,r.fromTopicId,r.cardId)).toBe(true);expect(isRelocatedOldLocation(r.bankId,r.toTopicId,r.cardId)).toBe(false);expect(isRelocatedOldLocation('listening',r.fromTopicId,r.cardId)).toBe(false)}
 });
 it('clears only old annotations including late offline uploads, with idempotent tombstones',()=>{
  const good={...next,note:'new note',updatedAt:time};const value={entries:{[key(target)]:{...target,note:'old',updatedAt:time},[key(next)]:good,unrelated:{bankId:'opi',topicId:'other',cardId:'other',note:'keep',updatedAt:time}}};
  const clean=clearRelocatedAnnotations(value);
  expect(clean.entries).toEqual({[key(next)]:good,unrelated:value.entries.unrelated});
  expect(clearRelocatedAnnotations(clean)).toEqual(clean);
  expect(clearRelocatedAnnotations({...clean,entries:{...value.entries}}).entries).toEqual(clean.entries);
 });
 it('preserves unrelated answers, states, feedback and recordings in a mixed history',()=>{
  const value={recordType:'session',studyReview:{items:[old,other],states:{old:{completed:true},other:{completed:true,selectedChoiceIndex:1}},answers:{old:'old answer',other:'keep answer'}},studyFeedback:{old:{text:'old'},other:{text:'keep'}}};
  const clean=clearRelocatedLearningRecord(value);
  expect(clean).toMatchObject({totalCount:1,correctCount:1,studyReview:{items:[other],answers:{other:'keep answer'},states:{other:value.studyReview.states.other}},studyFeedback:{other:{text:'keep'}}});
  expect(JSON.stringify(clean)).not.toContain('old answer');expect(clearRelocatedLearningRecord(clean)).toEqual(clean);
 });
 it('deletes a wholly affected history but preserves new destination history and AI',()=>{
  expect(clearRelocatedLearningRecord({recordType:'session',sessionId:'old',studyReview:{items:[old]}})).toEqual({deleted:true,recordType:'session',sessionId:'old'});
  const good={studyReview:{items:[{...old,topic:{id:row.toTopicId}}]}};expect(clearRelocatedLearningRecord(good)).toBe(good);
  const ai={recordType:'ai_result',bankId:'opi',cardId:row.cardId,topicTitle:'ATIS自动终端情报服务'};expect(clearRelocatedLearningRecord(ai)).toBe(ai);expect(clearRelocatedLearningRecord({...ai,topicTitle:'缩略词'}).deleted).toBe(true);
 });
 it('sanitizes pull and idempotency responses only for old locations',()=>{
  const state={visited:true,completed:true,note:'old'};expect(clearRelocatedSyncPayload('card_state',{...target,state,updatedAt:time}).state).toEqual({visited:false,completed:false,note:'',updatedAt:time});
  expect(clearRelocatedSyncPayload('card_state',{...next,state}).state).toBe(state);
 });
});

it('cleans the verified historical numbered title without matching other topics',()=>{
 const ai={recordType:'ai_result',bankId:'opi',cardId:row.cardId,topicTitle:'10.缩略词'};
 expect(clearRelocatedLearningRecord(ai).deleted).toBe(true);
 const unrelated={...ai,cardId:'not-in-reviewed-migration'};
 expect(clearRelocatedLearningRecord(unrelated)).toBe(unrelated);
});
