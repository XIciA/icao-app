import {it,expect} from 'vitest';
import {validateHotspotReferences} from '../src/admin/content-workflow-history';
import type {Bank} from '../src/admin/content-workflow-validation';
import type {AppContentHotspotBrief} from '@icao/contracts/app-content';
const brief:AppContentHotspotBrief={id:'frozen',date:'2026-10-16',title:'Frozen',centers:['北京考点'],topics:[{topicId:'t',topicTitle:'Old topic name',cardIds:['q']}]};
const bank:Bank={id:'opi',declaredTopicCount:1,declaredCardCount:1,categories:[{id:'c',name:'Category',declaredTopicCount:1,declaredCardCount:1,topics:[{id:'t',name:'Current topic name',declaredCardCount:1,cards:[{id:'q',taskTitle:'Question'}]}]}]};
it('preserves only the exact previously published display title',()=>{
 expect(()=>validateHotspotReferences([brief],bank,[structuredClone(brief)])).not.toThrow();
 expect(()=>validateHotspotReferences([brief],bank)).toThrow('hotspot_reference_invalid');
 const edited={...brief,title:'Changed'};
 expect(()=>validateHotspotReferences([edited],bank,[brief])).toThrow('hotspot_reference_invalid');
});
it('never permits missing, moved or retired cards in frozen history',()=>{
 for(const change of ['missing','moved','retired']){
  const changed=structuredClone(bank),topic=changed.categories[0]!.topics[0]!;
  if(change==='missing')topic.cards=[];
  if(change==='moved')topic.id='different';
  if(change==='retired')topic.cards[0]!.retired=true;
  expect(()=>validateHotspotReferences([brief],changed,[brief])).toThrow('hotspot_reference_invalid');
 }
});
