import { PDFDocument, PDFPage } from 'pdf-lib';
import { buildSentencesPdf } from '../export/sentences-pdf';
import type { ExportOptions, ExportSentence } from '../export/export-model';
import type { QuestionBankAnnotationStore } from '../annotations/types';
const { readFileSync } = jest.requireActual('fs') as { readFileSync: (path: string) => Uint8Array };
const options:ExportOptions={levels:['4级'],filter:'all',tagIds:[],translation:true,highlights:false,tags:false,notes:false};
const rows=Array.from({length:12},(_,index)=>({level:'4级',learned:true,card:{kind:'text',id:`s${index}`,taskTitle:`Sentence${index+1}`,audioText:'Maintain present heading and report passing the waypoint.',audioTextZh:'保持当前航向，飞越航路点时报告。'}})) as unknown as ExportSentence[];
const annotations={entries:{},tagDefinitions:[],highlightDefinitions:[]} as unknown as QuestionBankAnnotationStore;
it('yields to the UI while producing a valid PDF with the original CJK font', async () => {
  const font=readFileSync(`${process.cwd()}/assets/fonts/NotoSerifSC_600SemiBold.ttf`);
  const yieldControl=jest.fn(()=>new Promise<void>(resolve=>setTimeout(resolve,0)));
  const result=await buildSentencesPdf(rows,options,annotations,font,new Date('2026-10-25'),{yieldControl});
  expect(yieldControl.mock.calls.length).toBeGreaterThanOrEqual(2);
  const pdf=await PDFDocument.load(result.bytes);
  expect(pdf.getPageCount()).toBe(result.pageCount);
  expect(result.sentenceCount).toBe(12);
},30000);
it('stops an abandoned export before font loading or output serialization', async () => {
  const controller=new AbortController();
  const yieldControl=jest.fn(async()=>{controller.abort();});
  await expect(buildSentencesPdf(rows,options,annotations,new Uint8Array(),new Date(),{signal:controller.signal,yieldControl})).rejects.toThrow('export_cancelled');
  expect(yieldControl).toHaveBeenCalledTimes(1);
});

it('writes one scene heading per chapter and original Sentence IDs into the actual PDF',async()=>{
 const font=readFileSync(`${process.cwd()}/assets/fonts/NotoSerifSC_600SemiBold.ttf`);
 const draw=jest.spyOn(PDFPage.prototype,'drawText');
 try {
  const sceneRows=[584,2,900,1,584].map((number,index)=>({...rows[index],card:{...rows[index].card,id:`sentence900-main-${String(number).padStart(3,'0')}`,taskTitle:'旧标题'}}));
  const result=await buildSentencesPdf(sceneRows,{...options,browseMode:'scene',scenes:['other','emergency','basic']},annotations,font);
  const pdf=await PDFDocument.load(result.bytes);
  expect(pdf.getTitle()).toBe('900句 · 按场景 · 我的学习资料');
  expect(result.sentenceCount).toBe(4);
  const labels=draw.mock.calls.map(call=>call[0]);
  expect(labels.filter(text=>/^Sentence\d+$/.test(text))).toEqual(['Sentence1','Sentence2','Sentence584','Sentence900']);
  // One heading per chapter; the summary is emitted as a separate combined run.
  for(const scene of ['基本通话术语','紧急情况通话术语','其它情况通话术语']) expect(labels.filter(text=>text===scene)).toHaveLength(1);
 } finally { draw.mockRestore(); }
},30000);

it('joins same-color words, preserves text layout, and overlaps only row tag dots', async () => {
 const font=readFileSync(`${process.cwd()}/assets/fonts/NotoSerifSC_600SemiBold.ttf`);
 const { contentFingerprint, tokenizeStudyText } = jest.requireActual('../annotations/text');
 const text='Request to terminate our approach. '.repeat(5)+'\nMaintain heading.';
 const definitions=[{id:'yellow',label:'记忆',color:'yellow'},{id:'red',label:'不懂',color:'red'}];
 const annotation={tagIds:['yellow','red'],note:'',highlights:tokenizeStudyText(text).filter((t: {wordIndex?:number})=>t.wordIndex!==undefined).map((t: {wordIndex:number;text:string})=>({wordIndex:t.wordIndex,quote:t.text,contentFingerprint:contentFingerprint(text),colorId:t.wordIndex===3?'red':'yellow'}))};
 const input=[{...rows[0],card:{...rows[0].card,audioText:text},annotation}] as unknown as ExportSentence[];
 const store={...annotations,tagDefinitions:definitions,highlightDefinitions:definitions} as unknown as QuestionBankAnnotationStore;
 const draw=jest.spyOn(PDFPage.prototype,'drawText');
 const rectangles=jest.spyOn(PDFPage.prototype,'drawRectangle');
 const circles=jest.spyOn(PDFPage.prototype,'drawCircle');
 try {
  const baseline=await buildSentencesPdf(input,{...options,tags:true},store,font);
  const positions=draw.mock.calls.map(([value,settings])=>[value,settings?.x,settings?.y]);
  draw.mockClear();circles.mockClear();rectangles.mockClear();
  const result=await buildSentencesPdf(input,{...options,tags:true,highlights:true},store,font);
  expect(result.pageCount).toBe(baseline.pageCount);
  expect(draw.mock.calls.map(([value,settings])=>[value,settings?.x,settings?.y])).toEqual(positions);
  const backgrounds=rectangles.mock.calls.map(([settings])=>settings!);
  // The first three words are one rectangle, followed by a separate red word.
  const latin=await (await PDFDocument.create()).embedFont('Times-Roman');
  expect(backgrounds[0].width).toBeCloseTo(latin.widthOfTextAtSize('Request to terminate',10.5));
  expect(backgrounds[1].x).toBeCloseTo(111+latin.widthOfTextAtSize('Request to terminate ',10.5));
  expect(backgrounds.length).toBeLessThan(annotation.highlights.length);
  expect(new Set(backgrounds.map(r=>r.y)).size).toBeGreaterThan(1);
  const dots=circles.mock.calls.map(([settings])=>settings!);
  expect(dots.slice(0,2).every(dot=>!dot.borderWidth)).toBe(true); // legend unchanged
  const rowDots=dots.slice(2);
  expect(rowDots).toHaveLength(2);
  expect(rowDots[1].x!-rowDots[0].x!).toBeLessThan(rowDots[0].size!*2);
  expect(rowDots.every(dot=>dot.borderWidth===.75)).toBe(true);
 } finally {draw.mockRestore();rectangles.mockRestore();circles.mockRestore();}
},30000);
