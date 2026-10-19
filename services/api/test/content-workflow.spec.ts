import { expect, it } from 'vitest';
import { validateBank, parseDraft } from '../src/admin/content-workflow-validation';
const question={id:'stable',taskTitle:'Title',audioText:'Question?',referenceText:'Answer.',referenceTextZh:'答案。',audio:'/question-bank-assets/audio.mp3'};
const bank=()=>({id:'opi',declaredCardCount:1,declaredTopicCount:1,categories:[{id:'category',name:'Category',declaredCardCount:1,declaredTopicCount:1,topics:[{id:'topic',name:'Topic',declaredCardCount:1,cards:[{...question}]}]}]});
it('allows additions and edits without rekeying old questions',()=>{const previous=bank();const next=bank();next.categories[0]!.topics[0]!.cards[0]!.referenceText='Updated answer.';expect(validateBank(next,previous)).toMatchObject({id:'opi'});});
it('blocks replacement IDs, moved questions and deletion so saved learning references survive',()=>{
  const original=bank();const renamed=bank();renamed.categories[0]!.topics[0]!.cards[0]!.id='replacement';expect(()=>validateBank(renamed,original)).toThrow('existing_question_identity_must_be_preserved');
  const moved=bank();moved.categories[0]!.topics[0]!.id='new-topic';expect(()=>validateBank(moved,original)).toThrow('existing_question_identity_must_be_preserved');
  const removed=bank();removed.categories[0]!.topics[0]!.cards=[];removed.categories[0]!.topics[0]!.declaredCardCount=0;removed.categories[0]!.declaredCardCount=0;removed.declaredCardCount=0;expect(()=>validateBank(removed,original)).toThrow('existing_question_identity_must_be_preserved');
});
it('requires ready references, audio and an unambiguous choice answer',()=>{
  const value=bank();value.categories[0]!.topics[0]!.cards[0]!.audio='';expect(()=>validateBank(value)).toThrow();
  const choice={...question,choices:['A','B'],correctChoiceIndex:2};const b=bank();Object.assign(b.categories[0]!.topics[0]!.cards[0]!,choice);expect(()=>validateBank(b)).toThrow('question_answer_missing');
});
it('keeps retired IDs available for saved history without accepting incomplete active questions',()=>{const value=bank();Object.assign(value.categories[0]!.topics[0]!.cards[0]!,{retired:true});expect(validateBank(value,bank()).categories[0]!.topics[0]!.cards[0]!.id).toBe('stable');});
it('accepts unresolved review decisions and rejects malformed structured drafts',()=>{
  expect(parseDraft({banks:[],decisions:[{source:'待确认原文',kind:'unresolved',reason:'语义不明确'}],notes:''}).decisions[0]?.kind).toBe('unresolved');
  expect(()=>parseDraft({banks:[],decisions:[],notes:'',article:{title:'only title'}})).toThrow('invalid_content_draft');
});
it('validates 900 sentences as translated audio, without inventing reference answers',()=>{
 const value=bank();value.id='sentences900';Object.assign(value.categories[0]!.topics[0]!.cards[0]!,{audioTextZh:'中文',referenceText:undefined,referenceTextZh:undefined});expect(validateBank(value).id).toBe('sentences900');
});
it('does not reject unchanged legacy questions when editing another question',()=>{
 const value=bank();Object.assign(value.categories[0]!.topics[0]!.cards[0]!,{referenceTextZh:undefined});expect(validateBank(value,value).id).toBe('opi');
 const next=structuredClone(value);next.categories[0]!.topics[0]!.cards[0]!.audioText='New wording?';next.categories[0]!.topics[0]!.cards[0]!.audio='/new.mp3';expect(()=>validateBank(next,value)).toThrow('question_reference_missing');
 const linked=structuredClone(value);Object.assign(linked.categories[0]!.topics[0]!.cards[0]!,{reportedPrompts:{'hotspot-2026-10-17-test':['Reported wording?']}});expect(validateBank(linked,value).id).toBe('opi');
});

import { rebaseBank, containsBankChanges } from '../src/admin/content-workflow-rebase';
it('rebases independent hotspot wording and new questions without losing either publication',()=>{
 const base=bank(),a=bank(),b=bank();
 Object.assign(a.categories[0]!.topics[0]!.cards[0]!,{reportedPrompts:{first:['First wording?']}});
 Object.assign(b.categories[0]!.topics[0]!.cards[0]!,{reportedPrompts:{second:['Second wording?']}});
 a.categories[0]!.topics[0]!.cards.push({...question,id:'new-a'});b.categories[0]!.topics[0]!.cards.push({...question,id:'new-b'});
 const merged=rebaseBank(base,b,a);const cards=merged.categories[0]!.topics[0]!.cards;
 expect(cards.map(c=>c.id)).toEqual(['stable','new-a','new-b']);expect(cards[0]!.reportedPrompts).toEqual({first:['First wording?'],second:['Second wording?']});expect(merged.declaredCardCount).toBe(3);
});
it('rejects conflicting answer edits and retains an unrelated current edit',()=>{
 const base=bank(),a=bank(),b=bank();a.categories[0]!.topics[0]!.cards[0]!.referenceText='Answer A';b.categories[0]!.topics[0]!.cards[0]!.referenceText='Answer B';
 expect(()=>rebaseBank(base,b,a)).toThrow('content_base_changed_reprocess_order');
 b.categories[0]!.topics[0]!.cards[0]!.referenceText=question.referenceText;Object.assign(b.categories[0]!.topics[0]!.cards[0]!,{reportedPrompts:{second:['New wording?']}});
 expect(rebaseBank(base,b,a).categories[0]!.topics[0]!.cards[0]!.referenceText).toBe('Answer A');
});

it('verifies only a published order delta while allowing subsequent independent content',()=>{
 const base=bank(),draft=bank(),live=bank();draft.categories[0]!.topics[0]!.cards[0]!.referenceText='Published answer';
 live.categories[0]!.topics[0]!.cards[0]!.referenceText='Published answer';
 Object.assign(live.categories[0]!.topics[0]!.cards[0]!,{reportedPrompts:{later:['Later feedback']}});
 live.categories[0]!.topics[0]!.cards.push({...question,id:'later-new'});
 expect(containsBankChanges(base,draft,live)).toBe(true);
 live.categories[0]!.topics[0]!.cards[0]!.referenceText='Replaced answer';expect(containsBankChanges(base,draft,live)).toBe(false);
});
it('detects missing newly published questions without rejecting their later independent metadata',()=>{
 const base=bank(),draft=bank();draft.categories[0]!.topics[0]!.cards.push({...question,id:'new'});
 expect(containsBankChanges(base,draft,base)).toBe(false);
 const live=structuredClone(draft);Object.assign(live.categories[0]!.topics[0]!.cards[1]!,{reportedPrompts:{later:['Other feedback']}});
 expect(containsBankChanges(base,draft,live)).toBe(true);
});

import { replaceHistoricalHotspots, validateHotspotReferences, validateExclusions } from '../src/admin/content-workflow-history';
import { canonicalAppContentJson, type AppContentSnapshot } from '@icao/contracts/app-content';
import { createHash } from 'node:crypto';
const hash = (v: unknown) => createHash('sha256').update(canonicalAppContentJson(v)).digest('hex');
const brief = {id:'old-id',date:'2026-01-14',title:'Historical',centers:['A','B'],topics:[{topicId:'topic',topicTitle:'Topic',cardIds:['stable']}]};
const app = {hotspots:{briefs:[brief]}} as AppContentSnapshot;
it('preserves historical identity and rejects stale snapshots, unknown IDs and duplicate replacements',()=>{
 const update={baseChecksum:hash(app),briefs:[structuredClone(brief)]};
 expect(replaceHistoricalHotspots(app,update)).toEqual([brief]);
 expect(()=>replaceHistoricalHotspots(app,{...update,baseChecksum:'a'.repeat(64)})).toThrow('hotspot_base_changed');
 for(const patch of [{id:'new'},{date:'2026-02-14'},{centers:['A']}])expect(()=>replaceHistoricalHotspots(app,{...update,briefs:[{...brief,...patch}]})).toThrow('identity_must_be_preserved');
 expect(()=>replaceHistoricalHotspots(app,{...update,briefs:[brief,brief]})).toThrow('duplicate_historical');
});
it('requires exact topic names and active cards in every historical reference',()=>{
 validateHotspotReferences([brief],validateBank(bank()));
 expect(()=>validateHotspotReferences([{...brief,topics:[{...brief.topics[0]!,topicTitle:'Preview-only title'}]}],validateBank(bank()))).toThrow('hotspot_reference_invalid');
 const retired=bank();Object.assign(retired.categories[0]!.topics[0]!.cards[0]!,{retired:true});
 expect(()=>validateHotspotReferences([brief],validateBank(retired))).toThrow('hotspot_reference_invalid');
});
it('prevents excluded candidates leaking through bank changes or hotspot references',()=>{
 const draft=parseDraft({banks:[{bankId:'opi',baseChecksum:hash(bank()),payload:bank()}],decisions:[{source:'Ambiguous',kind:'excluded',cardId:'stable',reason:'Deferred'}],notes:''});
 validateExclusions(draft,[{bankId:'opi',payload:bank()}]);
 expect(()=>validateExclusions({...draft,hotspotUpdates:{baseChecksum:hash(app),briefs:[brief]}},[{bankId:'opi',payload:bank()}])).toThrow('excluded_question_still_referenced');
 const changed=bank();changed.categories[0]!.topics[0]!.cards[0]!.referenceText='New answer';
 expect(()=>validateExclusions({...draft,banks:[{...draft.banks[0]!,payload:changed}]},[{bankId:'opi',payload:bank()}])).toThrow('excluded_question_has_active_changes');
 expect(()=>validateExclusions({...draft,decisions:[{source:'Ambiguous',kind:'excluded'}]},[])).toThrow('exclusion_reason_required');
});
it('blocks stale audio after wording changes but permits new audio and reported-only wording',()=>{
 const next=bank();next.categories[0]!.topics[0]!.cards[0]!.audioText='A new question?';
 expect(()=>validateBank(next,bank())).toThrow('changed_question_requires_new_audio');
 next.categories[0]!.topics[0]!.cards[0]!.audio='/new.mp3';expect(validateBank(next,bank()).id).toBe('opi');
});
it('accepts multi-center historical edits only in their distinct draft field',()=>{
 expect(parseDraft({banks:[],hotspotUpdates:{baseChecksum:hash(app),briefs:[brief]},decisions:[],notes:''}).hotspotUpdates?.briefs[0]?.centers).toEqual(['A','B']);
 expect(()=>parseDraft({banks:[],hotspot:brief,decisions:[],notes:''})).toThrow('invalid_content_draft');
});

it('rejects new OPI topic phrases while leaving unchanged historical fields readable',()=>{
 const next=bank();next.categories[0]!.topics[0]!.cards[0]!.audioText='Fuel policy';
 expect(()=>validateBank(next,bank())).toThrow('opi_question_must_be_complete');
 expect(validateBank(next,next).id).toBe('opi');
 const reported=bank();Object.assign(reported.categories[0]!.topics[0]!.cards[0]!,{reportedPrompts:{old:['Fuel policy']}});
 expect(()=>validateBank(reported,bank())).toThrow('opi_reported_question_must_be_complete');
});
