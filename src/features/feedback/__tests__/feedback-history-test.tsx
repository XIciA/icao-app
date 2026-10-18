import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { FeedbackHistory } from '../FeedbackHistory.native';
const mockList=jest.fn(),mockDetail=jest.fn(),mockRead=jest.fn(),mockPush=jest.fn();
let mockAccount='account-a';
jest.mock('@/features/auth/AuthProvider',()=>({useAuth:()=>({accountReady:true,account:{accountId:mockAccount}})}));
jest.mock('expo-router',()=>({useRouter:()=>({back:jest.fn(),push:mockPush}),useFocusEffect:(fn:any)=>{require('react').useEffect(fn,[fn]);}}));
jest.mock('../feedback-history-client.native',()=>({listMyFeedback:(...args:any[])=>mockList(...args),getMyFeedback:(...args:any[])=>mockDetail(...args),markFeedbackRead:(...args:any[])=>mockRead(...args)}));
const item={ticketNumber:'FB-261019-00000001',category:'other',description:'我的反馈内容',status:'processing',createdAt:'2026-10-19T00:00:00Z',replies:[{id:'r1',text:'正在修复问题',createdAt:'2026-10-19T01:00:00Z'}],unread:true};
const screen=()=> <SafeAreaProvider initialMetrics={{frame:{x:0,y:0,width:390,height:844},insets:{top:0,left:0,right:0,bottom:0}}}><FeedbackHistory/></SafeAreaProvider>;
beforeEach(()=>{jest.clearAllMocks();mockAccount='account-a';mockList.mockResolvedValue({items:[item],nextCursor:null,unread:true});mockDetail.mockResolvedValue({...item,attachments:[]});mockRead.mockResolvedValue({read:true});});
it('opens the submitted feedback with public replies and acknowledges only the displayed reply',async()=>{
 const view=await render(screen());await waitFor(()=>expect(view.getByText('我的反馈内容')).toBeTruthy());
 await fireEvent.press(view.getByText('我的反馈内容'));await waitFor(()=>expect(view.getByText('处理回复')).toBeTruthy());
 expect(view.getByText('正在修复问题')).toBeTruthy();expect(mockRead).toHaveBeenCalledWith(item.ticketNumber,'r1',expect.anything());
});
it('clears previous content on account switch and does not expose it if the new read fails',async()=>{
 const view=await render(screen());await waitFor(()=>expect(view.getByText('我的反馈内容')).toBeTruthy());
 mockAccount='account-b';mockList.mockRejectedValue(new Error('offline'));await view.rerender(screen());
 await waitFor(()=>expect(view.getByText('反馈记录读取失败，请重试。')).toBeTruthy());expect(view.queryByText('我的反馈内容')).toBeNull();
});
it('provides the submission form above an empty history',async()=>{
 mockList.mockResolvedValue({items:[],nextCursor:null,unread:false});const view=await render(screen());await waitFor(()=>expect(view.getByText('暂无反馈记录')).toBeTruthy());
 await fireEvent.press(view.getByText('＋ 提交反馈'));expect(mockPush).toHaveBeenCalledWith(expect.objectContaining({params:expect.objectContaining({compose:'1'})}));
});
