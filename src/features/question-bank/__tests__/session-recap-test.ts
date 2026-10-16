import { annotatedThisSession, objectiveReview } from '../lib/session-recap';
import { questionBankCardTargetKey } from '../annotations/card-index.native';
import type { QuestionBankAnnotationStore } from '../annotations/types';
import type { QuestionBankStudyItem, StudyReviewSnapshot } from '../types';
const item={id:'review-id',dataset:{id:'listening'},category:{id:'category'},topic:{id:'topic'},card:{id:'card',correctChoiceIndex:1}} as QuestionBankStudyItem;
const target={bankId:'listening' as const,categoryId:'category',topicId:'topic',cardId:'card'};
const key=questionBankCardTargetKey(target);
const store=():QuestionBankAnnotationStore=>({version:2,legacyImported:true,tagDefinitions:[],highlightDefinitions:[],entries:{[key]:{...target,tagIds:['memory'],note:'旧笔记',highlights:[],updatedAt:'old'}}});
it('counts changed still-present annotations once and leaves old data untouched',()=>{
 const initial=store(),current=store();current.entries[key].note='修改笔记';current.entries[key].tagIds.push('hard');
 expect(annotatedThisSession(initial,current,[item,item])).toEqual(['card']);expect(initial.entries[key].note).toBe('旧笔记');expect(initial.entries[key].tagIds).toEqual(['memory']);
});
it('ignores timestamp changes, unchanged old annotations, and removed annotations',()=>{
 const initial=store(),current=store();current.entries[key].updatedAt='new';expect(annotatedThisSession(initial,current,[item])).toEqual([]);
 current.entries[key].note='';current.entries[key].tagIds=[];expect(annotatedThisSession(initial,current,[item])).toEqual([]);
});
it('uses final submitted answers and does not classify unanswered questions as wrong',()=>{
 const review={items:[item,{...item,id:'unanswered'},{...item,id:'wrong'}],states:{'review-id':{selectedChoiceIndex:1},wrong:{selectedChoiceIndex:0}}} as unknown as StudyReviewSnapshot;
 expect(objectiveReview(review)).toEqual({answered:2,correct:1,wrongIds:['wrong']});
});
