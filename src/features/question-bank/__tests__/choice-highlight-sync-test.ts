import { preserveManagedAnnotations } from '@icao/contracts/annotation-management';
import { annotationBlockText } from '../annotations/text-block';
import type { QuestionBankCard } from '../types';
const highlight={blockId:'choice-1',wordIndex:0,colorId:'green'};
const previous={version:2,choiceHighlights:true,highlightDefinitions:[{id:'green',color:'green',label:'重点'}],tagDefinitions:[],entries:{key:{note:'',tagIds:[],highlights:[highlight]}}};
it('retains choice highlights when an older client cannot represent them',()=>{
 const merged=preserveManagedAnnotations(previous,{...previous,choiceHighlights:undefined,entries:{key:{note:'old client edit',tagIds:[],highlights:[]}}}) as typeof previous;
 expect(merged.entries.key.highlights).toEqual([highlight]);
 expect(merged.entries.key.note).toBe('old client edit');
});
it('allows a capable client to remove its choice highlight',()=>{
 const merged=preserveManagedAnnotations(previous,{...previous,entries:{key:{note:'',tagIds:[],highlights:[]}}}) as typeof previous;
 expect(merged.entries.key.highlights).toEqual([]);
});
it('keeps identical word indexes in different choices independent',()=>{
 const card={choices:['one answer','another answer'],audioText:'question',referenceText:'reference'} as QuestionBankCard;
 expect(annotationBlockText(card,'choice-0')).toBe('one answer');
 expect(annotationBlockText(card,'choice-1')).toBe('another answer');
 expect(annotationBlockText(card,'question')).toBe('question');
});
