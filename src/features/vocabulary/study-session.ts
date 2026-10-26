import type { VocabularyMigrationPolicy } from '@icao/contracts/vocabulary-live';
import { orderVocabularySession, type VocabularyStudyOrder } from './study-order';
import type { VocabularyState, VocabularyStudySession, VocabularyWord, VocabularyWordStatus } from './types';
type Answers=Record<string,Exclude<VocabularyWordStatus,'new'>>;
const rank={known:0,vague:2,forgot:3,wrong:4};

/** Resume by identity, retaining the exact random queue across exits and restarts. */
export function prepareVocabularySession(words:VocabularyWord[],state:VocabularyState,order:VocabularyStudyOrder,preferredId?:string,random=Math.random) {
  const available=new Map(words.map(word=>[word.id,word])),saved=state.studySession;
  const reusable=saved?.nextWordId && saved.order===order && saved.wordIds.length===available.size && saved.wordIds.every(id=>available.has(id));
  const queue=reusable?saved.wordIds.map(id=>available.get(id)!):orderVocabularySession(words,state,order,random);
  const nextId=preferredId??(reusable?saved.nextWordId:queue[0]?.id);
  const index=Math.max(0,queue.findIndex(word=>word.id===nextId));
  const now=new Date().toISOString();
  const statuses:Answers=reusable?{...saved.answers}:{};
  const session:VocabularyStudySession={wordIds:queue.map(word=>word.id),nextWordId:queue[index]?.id??null,order,startedAt:reusable?saved.startedAt:now,updatedAt:now,answers:statuses};
  return {queue,index,session,statuses,revealed:Boolean(queue[index] && statuses[queue[index]!.id])};
}

/** Text/order snapshots remain fixed; retired identities cannot remain actionable.
 * Completed aliases collapse to their survivor so a merge cannot make users learn it twice. */
export function reconcileVocabularySession(words:VocabularyWord[],index:number,answers:Answers,policy?:VocabularyMigrationPolicy) {
  if(!policy)return {words,index,statuses:answers,complete:false};
  const active=(id:string)=>Object.hasOwn(policy.testWords,id)&&!Object.hasOwn(policy.retiredIds,id);
  const statuses:Answers={};
  for(const [id,status] of Object.entries(answers)){
    const target=Object.hasOwn(policy.retiredIds,id)?policy.retiredIds[id]:id;
    if(!target||!active(target))continue;
    if(!statuses[target]||rank[status]>rank[statuses[target]!])statuses[target]=status;
  }
  const queue=words.filter(word=>active(word.id));
  const current=words[index];
  if(current&&active(current.id))return {words:queue,index:queue.findIndex(word=>word.id===current.id),statuses,complete:false};
  const next=[...words.slice(index+1),...words.slice(0,index)].find(word=>active(word.id)&&!statuses[word.id]);
  return {words:queue,index:next?queue.findIndex(word=>word.id===next.id):0,statuses,complete:!next};
}
