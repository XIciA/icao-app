import { selectedSentences, type ExportSentence, type ExportOptions } from '../export/export-model';
import { exportSceneChoices, exportGroupTitle, scopedExportCards } from '../export/export-model';
import { SENTENCE_SCENARIOS } from '../lib/sentence-scenarios';
import bankData from '../data/question-bank.json';
import { scopeDataset } from '../lib/study-scope';
import type { QuestionBankDataset, QuestionBankTopic } from '../types';
const base:ExportOptions={levels:['3级','4级'],filter:'all',tagIds:[],translation:true,highlights:true,tags:true,notes:true};
const rows=[{level:'3级',card:{id:'1'},learned:true},{level:'4级',card:{id:'2'},learned:false,annotation:{note:'复习',tagIds:['hard'],highlights:[]}},{level:'4级',card:{id:'3'},learned:false}] as ExportSentence[];
it('preserves source order, selected levels and learned-only selection',()=>{
 expect(selectedSentences(rows,{...base,levels:['4级']}).map(r=>r.card.id)).toEqual(['2','3']);expect(selectedSentences(rows,{...base,filter:'learned'}).map(r=>r.card.id)).toEqual(['1']);
});
it('counts marked sentences once, filters their tags only in marked mode',()=>{
 expect(selectedSentences(rows,{...base,filter:'annotated',tagIds:['hard']}).map(r=>r.card.id)).toEqual(['2']);expect(selectedSentences(rows,{...base,filter:'annotated',tagIds:['other']})).toEqual([]);expect(selectedSentences(rows,{...base,tagIds:['hard']})).toHaveLength(3);
});

const sceneRows = [584,86,2,1,900,584].map((n,index)=>({level:index%2?'4级':'3级',learned:n===584,card:{id:`sentence900-main-${String(n).padStart(3,'0')}`}})) as ExportSentence[];
it('orders scenes by original number, deduplicates IDs and preserves original row objects',()=>{
 const result=selectedSentences(sceneRows,{...base,browseMode:'scene',scenes:['other','basic','emergency']});
 expect(result.map(r=>r.card.id)).toEqual(['sentence900-main-001','sentence900-main-002','sentence900-main-584','sentence900-main-900']);
 expect(result[2]).toBe(sceneRows[0]);
 expect(exportGroupTitle(result[2],{...base,browseMode:'scene'})).toBe('紧急情况通话术语');
 expect(exportSceneChoices(sceneRows).map(s=>s.id)).toEqual(['basic','aerodrome','emergency','other']);
 expect(selectedSentences(sceneRows,{...base,browseMode:'scene',scenes:['basic'],filter:'learned'})).toEqual([]);
 expect(selectedSentences(sceneRows,{...base,browseMode:'scene',scenes:[]})).toEqual([]);
});
it('intersects hydrated topic IDs with the supplied scope and excludes retired/image cards',()=>{
 const summary={cards:[],scopeCardIds:{all:['a','b','c'],selected:[],crash:[]}} as unknown as QuestionBankTopic;
 const topic={cards:[{id:'a',kind:'text'},{id:'b',kind:'image'},{id:'c',retired:true},{id:'outside'}]} as QuestionBankTopic;
 expect(scopedExportCards(summary,topic).map(c=>c.id)).toEqual(['a']);
 expect(scopedExportCards({...summary,scopeCardIds:undefined,cards:[]},topic)).toEqual([]);
});
it.each([721,900])('keeps level and scene all-selection within a %i-sentence supplied scope',count=>{
 const scoped=Array.from({length:count},(_,i)=>({level:i<562?'3级':i<721?'4级':'5级',learned:false,card:{id:`sentence900-main-${String(i+1).padStart(3,'0')}`}})) as ExportSentence[];
 const all={...base,levels:['3级','4级','5级'],scenes:SENTENCE_SCENARIOS.map(s=>s.id)};
 for(const browseMode of ['level','scene'] as const){
   const result=selectedSentences(scoped,{...all,browseMode});
   expect(result).toHaveLength(count);expect(new Set(result.map(r=>r.card.id)).size).toBe(count);
 }
});

it.each([['icao4-first',721],['icao5-first',900]] as const)('exports the real %s catalog without widening its scope', (goal,count)=>{
 const bank=(bankData as QuestionBankDataset[]).find(b=>b.id==='sentences900')!;
 const scoped=scopeDataset(bank,'all',goal);
 const actual=scoped.categories.flatMap(category=>category.topics.flatMap(topic=>scopedExportCards(topic,topic).map(card=>({card,level:category.name,learned:false}))));
 const options={...base,levels:scoped.categories.map(c=>c.name),scenes:SENTENCE_SCENARIOS.map(s=>s.id)};
 expect(selectedSentences(actual,options)).toHaveLength(count);
 const scenes=selectedSentences(actual,{...options,browseMode:'scene'});
 expect(scenes).toHaveLength(count);
 expect(new Set(scenes.map(row=>row.card.id))).toEqual(new Set(actual.map(row=>row.card.id)));
});
