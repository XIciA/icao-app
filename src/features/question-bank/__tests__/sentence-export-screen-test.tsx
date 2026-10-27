jest.mock('react-native-safe-area-context',()=>jest.requireActual('react-native-safe-area-context/jest/mock').default);
import { GuideBindingContext, type GuideBinding } from '@/features/usage-guide/GuideBindings';
import { selectedSentences } from '../export/export-model';
import { generateSentencesPdf } from '../export/pdf-generator';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SentenceExportScreen } from '../export/SentenceExportScreen.native';
jest.mock('@react-navigation/native', () => ({ ...jest.requireActual('@react-navigation/native'), usePreventRemove: jest.fn() }));
jest.mock('../annotations/card-index.native',()=>({questionBankCardTargetKey:()=> 'card'}));
const mockPreview=jest.fn(),mockShare=jest.fn();
jest.mock('@/features/sync/learning-sync.native',()=>({captureLearningWriteContext:()=>undefined,assertLearningWriteContext:jest.fn()}));
jest.mock('../data/repository.native',()=>({questionBankRepository:{getTopic:jest.fn().mockResolvedValue({id:'topic',cards:[{id:'one',kind:'sentence'}]})}}));
jest.mock('../annotations/annotation-store.native',()=>({readAnnotationStore:jest.fn().mockResolvedValue({entries:{},tagDefinitions:[]})}));
jest.mock('../platform/learning-store.native',()=>({sqliteLearningStore:{getTopicStates:jest.fn().mockResolvedValue({})}}));
jest.mock('../export/pdf-platform',()=>({exportFontBytes:jest.fn(),storePdf:jest.fn().mockResolvedValue('file:///test.pdf'),releasePdf:jest.fn(),previewPdf:()=>mockPreview(),sharePdf:()=>mockShare()}));
jest.mock('../export/pdf-generator',()=>({generateSentencesPdf:jest.fn().mockResolvedValue({bytes:new Uint8Array(),pageCount:1,sentenceCount:1})}));
const dataset={id:'sentences900',categories:[{id:'main',name:'3级',topics:[{id:'topic',cards:[],scopeCardIds:{all:['one'],selected:[],crash:[]}}]}]} as never;
it('clears an actual preview failure when returning to options and permits another export',async()=>{
 mockPreview.mockRejectedValue(new Error('file_opening_failed'));mockShare.mockResolvedValue(undefined);
 const view=await render(<SafeAreaProvider initialMetrics={{frame:{x:0,y:0,width:390,height:844},insets:{top:0,left:0,right:0,bottom:0}}}><SentenceExportScreen dataset={dataset} onBack={jest.fn()}/></SafeAreaProvider>);
 await waitFor(()=>expect(view.getByRole('button',{name:'生成 PDF'})).toBeEnabled());await fireEvent.press(view.getByText('生成 PDF'));
 await waitFor(()=>expect(view.getByText('PDF 已生成')).toBeTruthy());await fireEvent.press(view.getByText('预览 PDF'));
 await waitFor(()=>expect(view.getByText('PDF 预览未能打开，请重试或选择保存。')).toBeTruthy());
 await fireEvent.press(view.getByLabelText('返回'));expect(view.queryByText('PDF 预览未能打开，请重试或选择保存。')).toBeNull();
 await fireEvent.press(view.getByText('生成 PDF'));await waitFor(()=>expect(view.getByText('PDF 已生成')).toBeTruthy());
 await fireEvent.press(view.getByText('保存或分享 PDF'));await waitFor(()=>expect(mockShare).toHaveBeenCalled());
});

it('advances the export tour only after a file is ready and keeps a failed attempt retryable',async()=>{
 jest.mocked(generateSentencesPdf).mockClear();
 const event=jest.fn(); let reject!: (error:Error)=>void;
 jest.mocked(generateSentencesPdf).mockImplementationOnce(()=>new Promise((_resolve,no)=>{reject=no;}));
 const view=await render(<SafeAreaProvider initialMetrics={{frame:{x:0,y:0,width:390,height:844},insets:{top:0,left:0,right:0,bottom:0}}}><GuideBindingContext.Provider value={{event,register:jest.fn()} as unknown as GuideBinding}><SentenceExportScreen dataset={dataset} onBack={jest.fn()}/></GuideBindingContext.Provider></SafeAreaProvider>);
 await waitFor(()=>expect(view.getByRole('button',{name:'生成 PDF'})).toBeEnabled());await fireEvent.press(view.getByText('生成 PDF'));
 expect(view.getByText('正在导出，请稍等')).toBeTruthy();expect(view.getByRole('button', {name:'取消导出'})).toBeTruthy();expect(view.queryByText('正在处理 PDF，内容较多时请稍候…')).toBeNull();expect(view.getByText('导出设置')).toBeTruthy();expect(view.queryByText(/将导出.*句/u)).toBeNull();expect(event).not.toHaveBeenCalledWith('export-generate');
 expect(view.queryByRole('button', {name:'生成 PDF'})).toBeNull();expect(generateSentencesPdf).toHaveBeenCalledTimes(1);
 reject(new Error('test generation failure'));
 await waitFor(()=>expect(view.getByText('PDF 生成失败，请重试。学习笔记和进度不会受到影响。')).toBeTruthy());
 expect(event).not.toHaveBeenCalledWith('export-generate');
 await fireEvent.press(view.getByText('生成 PDF'));await waitFor(()=>expect(view.getByText('PDF 已生成')).toBeTruthy());
 expect(event).toHaveBeenCalledTimes(1);expect(event).toHaveBeenCalledWith('export-generate');
});

it('preserves the generated PDF when teaching is restarted or stopped',async()=>{
 const binding={current:'export',step:'export-generate',event:jest.fn(),register:jest.fn()} as unknown as GuideBinding;
 const tree=(value:GuideBinding)=><SafeAreaProvider initialMetrics={{frame:{x:0,y:0,width:390,height:844},insets:{top:0,left:0,right:0,bottom:0}}}><GuideBindingContext.Provider value={value}><SentenceExportScreen dataset={dataset} onBack={jest.fn()}/></GuideBindingContext.Provider></SafeAreaProvider>;
 const view=await render(tree(binding));
 await waitFor(()=>expect(view.getByRole('button',{name:'生成 PDF'})).toBeEnabled());await fireEvent.press(view.getByText('生成 PDF'));
 await waitFor(()=>expect(view.getByText('PDF 已生成')).toBeTruthy());
 await view.rerender(tree({...binding,step:'export-scope'}));
 expect(view.getByText('PDF 已生成')).toBeTruthy();
 await view.rerender(tree({...binding,current:undefined}));
 expect(view.getByText('PDF 已生成')).toBeTruthy();
});

it('waits for the multi-select scope sheet to close before advancing teaching', async () => {
 const event = jest.fn();
 const binding = { current:'export', step:'export-levels', event, register:jest.fn(), surface:()=>null } as unknown as GuideBinding;
 const view = await render(<SafeAreaProvider initialMetrics={{frame:{x:0,y:0,width:390,height:844},insets:{top:0,left:0,right:0,bottom:0}}}><GuideBindingContext.Provider value={binding}><SentenceExportScreen dataset={dataset} onBack={jest.fn()}/></GuideBindingContext.Provider></SafeAreaProvider>);
 await waitFor(() => expect(view.getByRole('button', {name:'生成 PDF'})).toBeEnabled());
 await fireEvent.press(view.getByText('范围'));
 await fireEvent.press(view.getByRole('checkbox', { name:'3级' }));
 expect(event).not.toHaveBeenCalled();
 await fireEvent.press(view.getByText('全选'));
 expect(event).not.toHaveBeenCalled();
 await fireEvent.press(view.getByText('完成'));
 expect(event).toHaveBeenCalledTimes(1); expect(event).toHaveBeenCalledWith('export-levels');
 expect(view.queryByText('导出范围')).toBeNull();
 event.mockClear();
 await fireEvent.press(view.getByText('范围'));
 await fireEvent.press(view.getByRole('checkbox', { name:'3级' }));
 await fireEvent.press(view.getByText('完成'));
 expect(event).not.toHaveBeenCalled();
 await fireEvent.press(view.getByText('范围'));
 await fireEvent.press(view.getByText('全选'));
 await fireEvent.press(view.getByLabelText('关闭弹层'));
 expect(event).not.toHaveBeenCalled();
});


it('keeps an in-flight PDF job alive when teaching exits and releases it on page unmount', async () => {
  let complete!: (value: {bytes:Uint8Array;pageCount:number;sentenceCount:number}) => void;
  jest.mocked(generateSentencesPdf).mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
  const event=jest.fn();
  const guide={current:'export',step:'export-generate',event,register:jest.fn(),surface:()=>null} as unknown as GuideBinding;
  const tree=(value:GuideBinding)=><SafeAreaProvider initialMetrics={{frame:{x:0,y:0,width:390,height:844},insets:{top:0,left:0,right:0,bottom:0}}}><GuideBindingContext.Provider value={value}><SentenceExportScreen dataset={dataset} onBack={jest.fn()}/></GuideBindingContext.Provider></SafeAreaProvider>;
  const view=await render(tree(guide));
  await waitFor(()=>expect(view.getByRole('button',{name:'生成 PDF'})).toBeEnabled());
  await fireEvent.press(view.getByText('生成 PDF'));
  await waitFor(()=>expect(generateSentencesPdf).toHaveBeenCalled());
  const call=jest.mocked(generateSentencesPdf).mock.calls.at(-1)!;
  const signal=call[5]?.signal;
  await view.rerender(tree({...guide,current:undefined}));
  expect(signal?.aborted).toBe(false);
  await act(async()=>complete({bytes:new Uint8Array(),pageCount:1,sentenceCount:1}));
  await waitFor(()=>expect(view.getByText('PDF 已生成')).toBeTruthy());
  await view.unmount();
  expect(signal?.aborted).toBe(true);
});

function pending<T>() {
 let resolve!: (value:T)=>void;
 const promise=new Promise<T>(done=>{resolve=done;});
 return {promise,resolve};
}
const pdfResult={bytes:new Uint8Array(),pageCount:1,sentenceCount:1};
it('cancels without an error and ignores the old completion while a new export is running', async()=>{
 const first=pending<typeof pdfResult>(),second=pending<typeof pdfResult>();
 jest.mocked(generateSentencesPdf).mockImplementationOnce(()=>first.promise).mockImplementationOnce(()=>second.promise);
 const platform=jest.requireMock('../export/pdf-platform') as {storePdf:jest.Mock};
 platform.storePdf.mockClear();
 const view=await render(<SentenceExportScreen dataset={dataset} onBack={jest.fn()}/>);
 await waitFor(()=>expect(view.getByRole('button',{name:'生成 PDF'})).toBeEnabled());
 await fireEvent.press(view.getByText('生成 PDF'));
 await waitFor(()=>expect(jest.mocked(generateSentencesPdf).mock.calls.at(-1)?.[5]?.signal).toBeDefined());
 const signal=jest.mocked(generateSentencesPdf).mock.calls.at(-1)![5]!.signal!;
 await fireEvent.press(view.getByText('取消导出'));
 expect(signal.aborted).toBe(true);
 await fireEvent.press(view.getByText('生成 PDF'));
 await act(async()=>first.resolve(pdfResult));
 expect(view.queryByText('PDF 已生成')).toBeNull();
 expect(view.getByText('取消导出')).toBeTruthy();
 expect(platform.storePdf).not.toHaveBeenCalled();
 await act(async()=>second.resolve(pdfResult));
 expect(view.getByText('PDF 已生成')).toBeTruthy();
 expect(platform.storePdf).toHaveBeenCalledTimes(1);
});
it('releases a file saved after cancellation without advancing teaching',async()=>{
 const platform=jest.requireMock('../export/pdf-platform') as {storePdf:jest.Mock;releasePdf:jest.Mock};
 const saved=pending<string>();platform.storePdf.mockClear();platform.storePdf.mockImplementationOnce(()=>saved.promise);
 const event=jest.fn();
 const view=await render(<GuideBindingContext.Provider value={{event,register:jest.fn()} as unknown as GuideBinding}><SentenceExportScreen dataset={dataset} onBack={jest.fn()}/></GuideBindingContext.Provider>);
 await waitFor(()=>expect(view.getByRole('button',{name:'生成 PDF'})).toBeEnabled());
 await fireEvent.press(view.getByText('生成 PDF'));
 await waitFor(()=>expect(platform.storePdf).toHaveBeenCalled());
 await fireEvent.press(view.getByText('取消导出'));
 await act(async()=>saved.resolve('file:///cancelled.pdf'));
 expect(platform.releasePdf).toHaveBeenCalledWith('file:///cancelled.pdf');
 expect(view.queryByText('PDF 已生成')).toBeNull();
 expect(view.getByText('生成 PDF')).toBeTruthy();
 expect(event).not.toHaveBeenCalled();
});
it('lets back cancel an active job and return without waiting for completion',async()=>{
 const job=pending<typeof pdfResult>();jest.mocked(generateSentencesPdf).mockImplementationOnce(()=>job.promise);
 const onBack=jest.fn();const view=await render(<SentenceExportScreen dataset={dataset} onBack={onBack}/>);
 await waitFor(()=>expect(view.getByRole('button',{name:'生成 PDF'})).toBeEnabled());await fireEvent.press(view.getByText('生成 PDF'));
 await fireEvent.press(view.getByLabelText('返回'));expect(onBack).toHaveBeenCalledTimes(1);
 await act(async()=>job.resolve(pdfResult));expect(view.queryByText('PDF 已生成')).toBeNull();
});

it('starts from browsing mode, keeps each selection independent and never hydrates outside the supplied scope',async()=>{
 const ids=['sentence900-main-002','sentence900-main-584'];
 const scoped={id:'sentences900',categories:[{id:'main',name:'4级',topics:[{id:'topic',cards:[],scopeCardIds:{all:ids,selected:[],crash:[]}}]}]} as never;
 const repo=jest.requireMock('../data/repository.native').questionBankRepository;
 repo.getTopic.mockResolvedValueOnce({id:'topic',cards:[...ids,'sentence900-main-900'].map(id=>({id,kind:'text'}))});
 const view=await render(<SentenceExportScreen dataset={scoped} initialBrowseMode="scene" onBack={jest.fn()}/>);
 await waitFor(()=>expect(view.getByRole('button',{name:'生成 PDF'})).toBeEnabled());
 expect(view.getByText('按场景')).toBeTruthy();
 await fireEvent.press(view.getByText('范围'));
 expect(view.queryByRole('checkbox',{name:'其它情况通话术语'})).toBeNull();
 await fireEvent.press(view.getByRole('checkbox',{name:'基本通话术语'}));
 await fireEvent.press(view.getByText('完成'));
 expect(view.queryByText(/将导出.*句/u)).toBeNull();
 await fireEvent.press(view.getByText('分组方式'));
 await fireEvent.press(view.getByRole('checkbox',{name:'按等级'}));
 expect(view.queryByText(/将导出.*句/u)).toBeNull();
 await fireEvent.press(view.getByText('范围'));
 await fireEvent.press(view.getByRole('checkbox',{name:'4级'}));
 await fireEvent.press(view.getByText('完成'));
 expect(view.getByRole('button',{name:'生成 PDF'})).toBeDisabled();
 await fireEvent.press(view.getByText('分组方式'));
 await fireEvent.press(view.getByRole('checkbox',{name:'按场景'}));
 expect(view.queryByText(/将导出.*句/u)).toBeNull();
 await fireEvent.press(view.getByText('生成 PDF'));
 await waitFor(()=>expect(view.getByText('PDF 已生成')).toBeTruthy());
 const call=jest.mocked(generateSentencesPdf).mock.calls.at(-1)!;
 expect(call[0].map(row=>row.card.id)).toEqual(ids);
 expect(call[1]).toMatchObject({browseMode:'scene',levels:[]});
 expect(call[1].scenes).not.toContain('basic');
 expect(selectedSentences(call[0],call[1])).toHaveLength(1);
});

it('uses the same export form for Web and Native',()=>{
 expect(jest.requireActual('../export/SentenceExportScreen.tsx').SentenceExportScreen).toBe(SentenceExportScreen);
});

it('animates the existing wait state, changes copy after 10 seconds and resets after cancellation', async () => {
 const first=pending<typeof pdfResult>(),second=pending<typeof pdfResult>();
 jest.mocked(generateSentencesPdf).mockImplementationOnce(()=>first.promise).mockImplementationOnce(()=>second.promise);
 const view=await render(<SentenceExportScreen dataset={dataset} onBack={jest.fn()}/>);
 await waitFor(()=>expect(view.getByRole('button',{name:'生成 PDF'})).toBeEnabled());
 expect(view.queryByText(/合并导出|将导出|PDF · A4/u)).toBeNull();
 jest.useFakeTimers();
 try {
  await fireEvent.press(view.getByText('生成 PDF'));
  expect(view.getByRole('progressbar', {name:'导出进度'})).toBeTruthy();
  await act(async()=>jest.advanceTimersByTime(9_999));
  expect(view.getByText('正在导出，请稍等')).toBeTruthy();
  await act(async()=>jest.advanceTimersByTime(1));
  expect(view.getByText('导出时间可能稍长，请稍等')).toBeTruthy();
  await fireEvent.press(view.getByText('取消导出'));
  expect(view.queryByText('导出时间可能稍长，请稍等')).toBeNull();
  await fireEvent.press(view.getByText('生成 PDF'));
  expect(view.getByText('正在导出，请稍等')).toBeTruthy();
  await act(async()=>second.resolve(pdfResult));
  expect(view.getByText('PDF 已生成')).toBeTruthy();
  await act(async()=>first.resolve(pdfResult));
 } finally { jest.useRealTimers(); }
});
