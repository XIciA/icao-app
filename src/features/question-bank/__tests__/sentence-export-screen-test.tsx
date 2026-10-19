import { GuideBindingContext, type GuideBinding } from '@/features/usage-guide/GuideBindings';
import { generateSentencesPdf } from '../export/pdf-generator';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SentenceExportScreen } from '../export/SentenceExportScreen';
jest.mock('../annotations/card-index.native',()=>({questionBankCardTargetKey:()=> 'card'}));
const mockPreview=jest.fn(),mockShare=jest.fn();
jest.mock('@/features/sync/learning-sync.native',()=>({captureLearningWriteContext:()=>undefined,assertLearningWriteContext:jest.fn()}));
jest.mock('../data/repository.native',()=>({questionBankRepository:{getTopic:jest.fn().mockResolvedValue({id:'topic',cards:[{id:'one',kind:'sentence'}]})}}));
jest.mock('../annotations/annotation-store.native',()=>({readAnnotationStore:jest.fn().mockResolvedValue({entries:{},tagDefinitions:[]})}));
jest.mock('../platform/learning-store.native',()=>({sqliteLearningStore:{getTopicStates:jest.fn().mockResolvedValue({})}}));
jest.mock('../export/pdf-platform',()=>({exportFontBytes:jest.fn(),storePdf:jest.fn().mockResolvedValue('file:///test.pdf'),releasePdf:jest.fn(),previewPdf:()=>mockPreview(),sharePdf:()=>mockShare()}));
jest.mock('../export/pdf-generator',()=>({generateSentencesPdf:jest.fn().mockResolvedValue({bytes:new Uint8Array(),pageCount:1,sentenceCount:1})}));
const dataset={id:'sentences900',categories:[{id:'main',name:'3级',topics:[{id:'topic',cards:[]}]}]} as never;
it('clears an actual preview failure when returning to options and permits another export',async()=>{
 mockPreview.mockRejectedValue(new Error('file_opening_failed'));mockShare.mockResolvedValue(undefined);
 const view=await render(<SafeAreaProvider initialMetrics={{frame:{x:0,y:0,width:390,height:844},insets:{top:0,left:0,right:0,bottom:0}}}><SentenceExportScreen dataset={dataset} onBack={jest.fn()}/></SafeAreaProvider>);
 await waitFor(()=>expect(view.getByText('已选择 1 句')).toBeTruthy());await fireEvent.press(view.getByText('生成 PDF'));
 await waitFor(()=>expect(view.getByText('PDF 已生成')).toBeTruthy());await fireEvent.press(view.getByText('预览 PDF'));
 await waitFor(()=>expect(view.getByText('PDF 预览未能打开，请重试或选择保存。')).toBeTruthy());
 await fireEvent.press(view.getByLabelText('返回'));expect(view.queryByText('PDF 预览未能打开，请重试或选择保存。')).toBeNull();
 await fireEvent.press(view.getByText('生成 PDF'));await waitFor(()=>expect(view.getByText('PDF 已生成')).toBeTruthy());
 await fireEvent.press(view.getByText('保存或分享 PDF'));await waitFor(()=>expect(mockShare).toHaveBeenCalled());
});

it('advances the export tour only after a file is ready and keeps a failed attempt retryable',async()=>{
 const event=jest.fn(); let reject!: (error:Error)=>void;
 jest.mocked(generateSentencesPdf).mockImplementationOnce(()=>new Promise((_resolve,no)=>{reject=no;}));
 const view=await render(<SafeAreaProvider initialMetrics={{frame:{x:0,y:0,width:390,height:844},insets:{top:0,left:0,right:0,bottom:0}}}><GuideBindingContext.Provider value={{event,register:jest.fn()} as unknown as GuideBinding}><SentenceExportScreen dataset={dataset} onBack={jest.fn()}/></GuideBindingContext.Provider></SafeAreaProvider>);
 await waitFor(()=>expect(view.getByText('已选择 1 句')).toBeTruthy());await fireEvent.press(view.getByText('生成 PDF'));
 expect(view.getByText('正在生成 PDF…')).toBeTruthy();expect(event).not.toHaveBeenCalledWith('export-generate');
 reject(new Error('test generation failure'));
 await waitFor(()=>expect(view.getByText('PDF 生成失败，请重试。学习笔记和进度不会受到影响。')).toBeTruthy());
 expect(event).not.toHaveBeenCalledWith('export-generate');
 await fireEvent.press(view.getByText('生成 PDF'));await waitFor(()=>expect(view.getByText('PDF 已生成')).toBeTruthy());
 expect(event).toHaveBeenCalledTimes(1);expect(event).toHaveBeenCalledWith('export-generate');
});
