import { ConflictException } from '@nestjs/common';
import { canonicalAppContentJson } from '@icao/contracts/app-content';
import { bankSchema, type Bank } from './content-workflow-validation';
const same=(a:unknown,b:unknown)=>canonicalAppContentJson(a)===canonicalAppContentJson(b);
const fail=()=>{throw new ConflictException('content_base_changed_reprocess_order');};
/** Apply a reviewed bank delta to the current immutable snapshot. Conflicting
 * edits fail; unrelated published questions and hotspot wording are retained. */
export function rebaseBank(baseValue:unknown,draftValue:unknown,currentValue:unknown):Bank {
 const base=bankSchema.parse(baseValue),draft=bankSchema.parse(draftValue),current=bankSchema.parse(currentValue);
 const merge=(before:unknown,wanted:unknown,live:unknown,key=''):unknown=>{
  if(same(before,wanted))return structuredClone(live);
  if(same(before,live)||same(wanted,live))return structuredClone(wanted);
  if(['categories','topics','cards'].includes(key)&&Array.isArray(before)&&Array.isArray(wanted)&&Array.isArray(live)){
   const old=new Map(before.map(v=>[v.id,v])),next=new Map(wanted.map(v=>[v.id,v]));
   if(before.some(v=>!next.has(v.id)))return fail();
   const result=live.map(v=>next.has(v.id)?merge(old.get(v.id),next.get(v.id),v):structuredClone(v));
   const ids=new Set(live.map(v=>v.id));
   for(const item of wanted)if(!ids.has(item.id)){if(old.has(item.id))return fail();result.push(structuredClone(item));}
   return result;
  }
  if(before&&wanted&&live&&typeof before==='object'&&typeof wanted==='object'&&typeof live==='object'&&!Array.isArray(before)&&!Array.isArray(wanted)&&!Array.isArray(live)){
   const b=before as Record<string,unknown>,d=wanted as Record<string,unknown>,c=live as Record<string,unknown>;
   const result:Record<string,unknown>={};
   for(const name of new Set([...Object.keys(b),...Object.keys(d),...Object.keys(c)])){
    if(['declaredCardCount','declaredTopicCount','scopeCardIds'].includes(name))continue;
    const value=merge(b[name],d[name],c[name],name);if(value!==undefined)result[name]=value;
   }
   return result;
  }
  // Independent feedback entries can first create reportedPrompts simultaneously.
  if(key==='reportedPrompts'&&before===undefined&&wanted&&live&&typeof wanted==='object'&&typeof live==='object'){
   const result={...live} as Record<string,unknown>;
   for(const [id,value] of Object.entries(wanted)){if(id in result&&!same(result[id],value))return fail();result[id]=value;}
   return result;
  }
  return fail();
 };
 const result=merge(base,draft,current) as Bank;
 for(const category of result.categories){for(const topic of category.topics){topic.declaredCardCount=topic.cards.length;delete topic.scopeCardIds;}category.declaredTopicCount=category.topics.length;category.declaredCardCount=category.topics.reduce((n,t)=>n+t.cards.length,0);}
 result.declaredTopicCount=result.categories.reduce((n,c)=>n+c.topics.length,0);result.declaredCardCount=result.categories.reduce((n,c)=>n+c.declaredCardCount,0);
 return result;
}

/** A later, independent publication must not make an older work order look broken.
 * Check only the fields changed by this order, while retaining unrelated live edits. */
export function containsBankChanges(baseValue:unknown,draftValue:unknown,currentValue:unknown):boolean {
 const base=bankSchema.parse(baseValue),draft=bankSchema.parse(draftValue),current=bankSchema.parse(currentValue);
 const contains=(before:unknown,wanted:unknown,live:unknown,key=''):boolean=>{
  if(same(before,wanted))return true;
  if(['categories','topics','cards'].includes(key)&&Array.isArray(wanted)&&Array.isArray(live)){
   const old=new Map((Array.isArray(before)?before:[]).map(v=>[v.id,v]));
   const actual=new Map(live.map(v=>[v.id,v]));
   return wanted.every(v=>contains(old.get(v.id),v,actual.get(v.id)));
  }
  if(wanted&&live&&typeof wanted==='object'&&typeof live==='object'&&!Array.isArray(wanted)&&!Array.isArray(live)){
   const b=(before&&typeof before==='object'?before:{}) as Record<string,unknown>;
   const w=wanted as Record<string,unknown>,a=live as Record<string,unknown>;
   return [...new Set([...Object.keys(b),...Object.keys(w)])].every(name=>['declaredCardCount','declaredTopicCount','scopeCardIds'].includes(name)||contains(b[name],w[name],a[name],name));
  }
  return same(wanted,live);
 };
 return contains(base,draft,current);
}
