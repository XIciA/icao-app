import { orderVocabularySession, type VocabularyStudyOrder } from './study-order';
import type { VocabularyState, VocabularyStudySession, VocabularyWord, VocabularyWordStatus } from './types';

/** Resume by identity, retaining the exact random queue across exits and restarts. */
export function prepareVocabularySession(words:VocabularyWord[],state:VocabularyState,order:VocabularyStudyOrder,preferredId?:string,random=Math.random) {
  const available=new Map(words.map(word=>[word.id,word])),saved=state.studySession;
  const reusable=saved?.nextWordId && saved.order===order && saved.wordIds.length===available.size && saved.wordIds.every(id=>available.has(id));
  const queue=reusable?saved.wordIds.map(id=>available.get(id)!):orderVocabularySession(words,state,order,random);
  const nextId=preferredId??(reusable?saved.nextWordId:queue[0]?.id);
  const index=Math.max(0,queue.findIndex(word=>word.id===nextId));
  const now=new Date().toISOString();
  const session:VocabularyStudySession={wordIds:queue.map(word=>word.id),nextWordId:queue[index]?.id??null,order,startedAt:reusable?saved.startedAt:now,updatedAt:now};
  const statuses:Record<string,Exclude<VocabularyWordStatus,'new'>>={};
  for(const word of queue){const item=state.words[word.id];if(item && item.status!=='new' && Date.parse(item.updatedAt)>=Date.parse(session.startedAt))statuses[word.id]=item.status;}
  return {queue,index,session,statuses,revealed:Boolean(queue[index] && statuses[queue[index]!.id])};
}
