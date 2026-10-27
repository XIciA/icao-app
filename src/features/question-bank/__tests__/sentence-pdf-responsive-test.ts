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
