import type { QuestionBankAnnotationStore } from '../annotations/types';
import { questionBankCardTargetKey } from '../annotations/card-index.native';
import type { LearningRecord, QuestionBankStudyItem, StudyReviewSnapshot } from '../types';
export type SessionRecap = { annotatedCardIds: string[]; words: {word:string;favorited:boolean}[] };
function annotationValue(entry:QuestionBankAnnotationStore['entries'][string]|undefined) {
  return JSON.stringify(entry ? {tags:entry.tagIds,highlights:entry.highlights,note:entry.note}:null);
}
export function annotatedThisSession(initial:QuestionBankAnnotationStore,current:QuestionBankAnnotationStore,items:QuestionBankStudyItem[]) {
  const result=new Set<string>();
  for(const item of items) {
    const key=questionBankCardTargetKey({bankId:item.dataset.id,categoryId:item.category.id,topicId:item.topic.id,cardId:item.card.id});
    const entry=current.entries[key];
    if(entry && (entry.note.trim()||entry.tagIds.length||entry.highlights.length) && annotationValue(entry)!==annotationValue(initial.entries[key])) result.add(item.card.id);
  }
  return [...result];
}
export function objectiveReview(review:StudyReviewSnapshot|undefined) {
  const wrongIds:string[]=[];let answered=0;let correct=0;
  for(const item of review?.items??[]) {
    const selected=review?.states[item.id]?.selectedChoiceIndex;
    if(item.card.correctChoiceIndex===undefined||selected===undefined)continue;
    answered+=1;if(selected===item.card.correctChoiceIndex)correct+=1;else wrongIds.push(item.id);
  }
  return {answered,correct,wrongIds};
}
export function selectReview(record:LearningRecord,ids:Set<string>) {
  if(!record.studyReview)return record;
  return {...record,studyReview:{...record.studyReview,items:record.studyReview.items.filter(item=>ids.has(item.id))}};
}
