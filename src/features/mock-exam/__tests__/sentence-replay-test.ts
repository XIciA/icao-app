import { createSentenceReplayLedger, consumeSentenceReplay } from '../sentence-replay';
it.each([3,5])('allows exactly one replay for each of %i independent groups',groups=>{
 const ledger=createSentenceReplayLedger();
 for(let group=1;group<=groups;group++){
  for(let question=1;question<=4;question++){
   const id=`${group}-${question}`;
   expect(consumeSentenceReplay(ledger,String(group),id)).toBe(false);
   ledger.completedItems[id]=true;
   expect(consumeSentenceReplay(ledger,String(group),id)).toBe(question===1);
  }
 }
 expect(Object.keys(ledger.usedGroups)).toHaveLength(groups);
});
