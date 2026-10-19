import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {join} from 'node:path';
import { normalizeDailyHotspots, mergeHotspotFeedback, hotspotSources, selectHotspotSource, hotspotReportedPrompts, hotspotQuestionOrigins, compatibleHotspotBriefs, isAppContentSnapshot, type AppContentHotspotBrief } from '@icao/contracts/app-content';
const brief=(id:string,center:string,ids:string[],date='2026-10-16'):AppContentHotspotBrief=>({id,date,title:`Old ${center}`,centers:[center],topics:[{topicId:'t',topicTitle:'Topic',cardIds:ids}]});
it('merges only the same exam day, deduplicates cards and preserves all original source identities',()=>{
 const input=[brief('a','A',['q','x']),brief('b','B',['q','y']),brief('old','A',['q'],'2026-01-14')];
 const result=normalizeDailyHotspots(input);
 expect(result).toHaveLength(2);expect(result[0]?.title).toBe('2026年10月16日 OPI 热点');expect(result[0]?.centers).toEqual(['A','B']);expect(result[0]?.topics[0]?.cardIds).toEqual(['q','x','y']);
 expect(result.flatMap(hotspotSources).map(s=>s.id)).toEqual(['a','b','old']);expect(input[0]?.title).toBe('Old A');expect(normalizeDailyHotspots(result)).toEqual(result);
 expect(selectHotspotSource(result[0]!,'A').topics[0]?.cardIds).toEqual(['q','x']);
 expect(hotspotQuestionOrigins(result[0]!,'q')).toEqual(['A','B']);
 expect(hotspotReportedPrompts(result[0]!,{id:'q',reportedPrompts:{a:['First wording?'],b:['Second wording?']}})).toEqual(['First wording?','Second wording?']);
 expect(compatibleHotspotBriefs(result).map(b=>b.id)).toEqual(['a','b','old']);
});
it('appends new feedback and same-center supplements without losing old questions or creating a second day card',()=>{
 let result=mergeHotspotFeedback([],brief('a','A',['q']),'order-a');
 result=mergeHotspotFeedback(result,brief('b','B',['q','x']),'order-b');
 result=mergeHotspotFeedback(result,brief('a','A',['y']),'order-a');
 expect(result).toHaveLength(1);expect(result[0]?.id).toBe('hotspot-2026-10-16');expect(result[0]?.topics[0]?.cardIds.sort()).toEqual(['q','x','y']);expect(result[0]?.sources?.find(s=>s.id==='a')?.orderId).toBe('order-a');
});
it('does not invent per-question center attribution for historical multi-center or thematic feedback',()=>{
 const general={...brief('a','A',['q']),centers:['A','B']};
 const thematic={...brief('b','多考点反馈',['x']),centers:['多考点反馈','冬季运行专题']};
 const day=normalizeDailyHotspots([general,thematic])[0]!;
 expect(day.centers).toEqual(['A','B']);expect(selectHotspotSource(day,'A').topics).toEqual([]);expect(selectHotspotSource(day,'general').topics[0]?.cardIds).toEqual(['q','x']);expect(hotspotQuestionOrigins(day,'q')).toEqual(['本日综合反馈']);
});
it('validates source unions, rejects paid bodies and cross-day source identity reuse',()=>{
 const original=JSON.parse(readFileSync(join(__dirname,'../../../content/app-content/text.json'),'utf8'));
 const payload={...original,hotspots:{generatedAt:new Date().toISOString(),briefs:normalizeDailyHotspots([brief('a','A',['q'])])}};
 expect(isAppContentSnapshot(payload)).toBe(true);
 const mismatch=structuredClone(payload);mismatch.hotspots.briefs[0].sources[0].topics[0].cardIds=['other'];expect(isAppContentSnapshot(mismatch)).toBe(false);
 const injected=structuredClone(payload);injected.hotspots.briefs[0].sources[0].text='private body';expect(isAppContentSnapshot(injected)).toBe(false);
 expect(()=>normalizeDailyHotspots([brief('a','A',['q']),brief('a','A',['q'],'2026-01-14')])).toThrow('source_date_conflict');
});
