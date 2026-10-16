import { selectedSentences, type ExportSentence, type ExportOptions } from '../export/export-model';
const base:ExportOptions={levels:['3级','4级'],filter:'all',tagIds:[],translation:true,highlights:true,tags:true,notes:true};
const rows=[{level:'3级',card:{id:'1'},learned:true},{level:'4级',card:{id:'2'},learned:false,annotation:{note:'复习',tagIds:['hard'],highlights:[]}},{level:'4级',card:{id:'3'},learned:false}] as ExportSentence[];
it('preserves source order, selected levels and learned-only selection',()=>{
 expect(selectedSentences(rows,{...base,levels:['4级']}).map(r=>r.card.id)).toEqual(['2','3']);expect(selectedSentences(rows,{...base,filter:'learned'}).map(r=>r.card.id)).toEqual(['1']);
});
it('counts marked sentences once, filters their tags only in marked mode',()=>{
 expect(selectedSentences(rows,{...base,filter:'annotated',tagIds:['hard']}).map(r=>r.card.id)).toEqual(['2']);expect(selectedSentences(rows,{...base,filter:'annotated',tagIds:['other']})).toEqual([]);expect(selectedSentences(rows,{...base,tagIds:['hard']})).toHaveLength(3);
});
