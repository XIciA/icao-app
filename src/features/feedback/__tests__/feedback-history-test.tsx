import { useEffect as mockUseEffect } from 'react';
import { useRouter as mockUseRouter } from 'expo-router';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { FeedbackHistory } from '../FeedbackHistory.native';
const mockList=jest.fn(),mockDetail=jest.fn(),mockRead=jest.fn(),mockPush=jest.fn();
let mockAccount='account-a';
let mockParams: { ticket?: string } = {};
const mockBack = jest.fn();
jest.mock('@/features/auth/AuthProvider',()=>({useAuth:()=>({accountReady:true,account:{accountId:mockAccount}})}));
jest.mock('expo-router',()=>({useRouter:()=>({back:mockBack,canGoBack:()=>true,push:mockPush}),useLocalSearchParams:()=>mockParams,useFocusEffect:(fn:any)=>{mockUseEffect(fn,[fn]);}}));
jest.mock('@/components/navigation/useAppRouter',()=>({useAppRouter:()=>mockUseRouter()}));
jest.mock('../feedback-history-client.native',()=>({listMyFeedback:(...args:any[])=>mockList(...args),getMyFeedback:(...args:any[])=>mockDetail(...args),markFeedbackRead:(...args:any[])=>mockRead(...args)}));
const item={ticketNumber:'FB-261019-00000001',category:'other',description:'我的反馈内容',status:'processing',createdAt:'2026-10-19T00:00:00Z',replies:[{id:'r1',text:'正在修复问题',createdAt:'2026-10-19T01:00:00Z'}],unread:true};
const screen=()=> <SafeAreaProvider initialMetrics={{frame:{x:0,y:0,width:390,height:844},insets:{top:0,left:0,right:0,bottom:0}}}><FeedbackHistory/></SafeAreaProvider>;
beforeEach(()=>{jest.clearAllMocks();mockAccount='account-a';mockParams={};mockList.mockResolvedValue({items:[item],nextCursor:null,unread:true});mockDetail.mockResolvedValue({...item,attachments:[]});mockRead.mockResolvedValue({read:true});});
it('opens the submitted feedback with public replies and acknowledges only the displayed reply',async()=>{
 const view=await render(screen());await waitFor(()=>expect(view.getByText('我的反馈内容')).toBeTruthy());
 await fireEvent.press(view.getByText('我的反馈内容'));
 expect(mockPush).toHaveBeenCalledWith({pathname:'/info/[slug]',params:{slug:'feedback',ticket:item.ticketNumber}});
 mockParams={ticket:item.ticketNumber};await view.rerender(screen());await waitFor(()=>expect(view.getByText('处理回复')).toBeTruthy());
 expect(view.getByText('正在修复问题')).toBeTruthy();expect(mockRead).toHaveBeenCalledWith(item.ticketNumber,'r1',expect.anything());
});
it('clears previous content on account switch and does not expose it if the new read fails',async()=>{
 const view=await render(screen());await waitFor(()=>expect(view.getByText('我的反馈内容')).toBeTruthy());
 mockAccount='account-b';mockList.mockRejectedValue(new Error('offline'));await view.rerender(screen());
 await waitFor(()=>expect(view.getByText('反馈记录读取失败，请重试。')).toBeTruthy());expect(view.queryByText('我的反馈内容')).toBeNull();
});
it('provides a submission action outside the scrollable empty history',async()=>{
 mockList.mockResolvedValue({items:[],nextCursor:null,unread:false});const view=await render(screen());await waitFor(()=>expect(view.getByText('暂无反馈记录')).toBeTruthy());
 await fireEvent.press(view.getByText('提交反馈'));expect(mockPush).toHaveBeenCalledWith(expect.objectContaining({params:expect.objectContaining({compose:'1'})}));
});
it('renders existing short records and replies without requiring new fields or resubmission',async()=>{
 const resolved={...item,category:'feature_suggestion',description:'测试1025',status:'resolved',replies:[{id:'r-existing',text:'haode',createdAt:item.createdAt}]};
 const pending={...item,ticketNumber:'FB-existing-pending',category:'feature_suggestion',description:'测试界面功能',status:'received',replies:[],unread:false};
 mockList.mockResolvedValue({items:[resolved,pending],nextCursor:null,unread:true});
 const view=await render(screen());
 await waitFor(()=>expect(view.getByText('测试1025')).toBeTruthy());
 expect(view.getByText('测试界面功能')).toBeTruthy();expect(view.getByText('haode')).toBeTruthy();
 expect(view.getByText('已处理')).toBeTruthy();expect(view.getByText('待处理')).toBeTruthy();
 expect(view.queryByText('我的反馈')).toBeNull();expect(view.queryByText('3 条记录')).toBeNull();
 expect(view.getByText('· 新回复')).toBeTruthy();expect(mockRead).not.toHaveBeenCalled();
});
it('preserves paginated records and opens pending feedback without marking a nonexistent reply read',async()=>{
 const pending={...item,ticketNumber:'FB-existing-pending',description:'测试界面功能',status:'received',replies:[],unread:false};
 mockList.mockResolvedValueOnce({items:[item],nextCursor:'next-page',unread:true}).mockResolvedValueOnce({items:[item,pending],nextCursor:null,unread:false});
 mockDetail.mockResolvedValue({...pending,attachments:[{id:'existing-image',url:'https://example.test/feedback.png'}]});
 const view=await render(screen());await waitFor(()=>expect(view.getByText('查看更多')).toBeTruthy());
 await fireEvent.press(view.getByText('查看更多'));await waitFor(()=>expect(view.getByText('测试界面功能')).toBeTruthy());
 expect(mockList).toHaveBeenLastCalledWith('next-page',expect.anything());expect(view.getAllByText('我的反馈内容')).toHaveLength(1);
 await fireEvent.press(view.getByText('测试界面功能'));mockParams={ticket:pending.ticketNumber};await view.rerender(screen());
 await waitFor(()=>expect(view.getByText('暂无回复，可稍后在这里查看。')).toBeTruthy());
 expect(view.getByLabelText('反馈图片')).toBeTruthy();expect(mockRead).not.toHaveBeenCalled();
 await fireEvent.press(view.getByLabelText('返回'));expect(mockBack).toHaveBeenCalled();
});
