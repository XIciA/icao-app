import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { AppUpdatePrompt } from '../AppUpdatePrompt';
import { checkAppUpdate } from '../app-updates.native';
let mockPath='/';
let mockOwner:string|undefined;
let mockExpiry:string|undefined;
const mockStorage=new Map<string,string>();
const mockPush=jest.fn();
jest.mock('expo-router',()=>({usePathname:()=>mockPath,useRouter:()=>({push:mockPush})}));
jest.mock('@/features/auth/AuthProvider',()=>({useAuth:()=>({account:{accountId:'old-account'}})}));
jest.mock('@/features/native-commercial-testflight/CommerceRuntimeProvider',()=>({useCommerceRuntime:()=>({phase:'ready',entitlement:{environment:'production',membership:{expiresAt:mockExpiry}}})}));
jest.mock('@/platform/storage',()=>({__esModule:true,default:{getItem:jest.fn(async(key:string)=>mockStorage.get(key)??null),setItem:jest.fn(async(key:string,value:string)=>{mockStorage.set(key,value);})}}));
jest.mock('@/platform/audio',()=>({audioSessionOrchestrator:{getActiveOwner:()=>mockOwner}}));
jest.mock('../app-updates.native',()=>({checkAppUpdate:jest.fn(async()=>undefined),dismissAppUpdate:jest.fn(async()=>{}),openAppUpdate:jest.fn(async()=>{})}));
jest.mock('@/components/ui',()=>{
 const {Text,View,Pressable}=jest.requireActual('react-native');
 return {AppText:({children}:any)=><Text>{children}</Text>,BottomSheet:({children}:any)=><View>{children}</View>,Button:({children,onPress}:any)=><Pressable onPress={onPress}><Text>{children}</Text></Pressable>};
});
beforeEach(()=>{jest.clearAllMocks();mockStorage.clear();mockPath='/';mockOwner=undefined;mockExpiry=new Date(Date.now()+86400000).toISOString();});
it('shows a membership reminder once per expiry and gives it priority over app updates',async()=>{
 const view=await render(<AppUpdatePrompt/>);
 await waitFor(()=>expect(view.getByText('会员即将到期')).toBeTruthy());
 expect(checkAppUpdate).not.toHaveBeenCalled();
 await fireEvent.press(view.getByText('暂时不用'));
 mockPath='/account';await view.rerender(<AppUpdatePrompt/>);mockPath='/';await view.rerender(<AppUpdatePrompt/>);
 await act(async()=>{});expect(view.queryByText('会员即将到期')).toBeNull();
 expect([...mockStorage.keys()][0]).toContain('old-account.production');
});
it('does not interrupt practice routes or an active audio owner',async()=>{
 mockPath='/question-bank/listening/study/c/t';const view=await render(<AppUpdatePrompt/>);await act(async()=>{});
 expect(mockStorage.size).toBe(0);expect(checkAppUpdate).not.toHaveBeenCalled();
 mockPath='/';mockOwner='study';await view.rerender(<AppUpdatePrompt/>);await act(async()=>{});
 expect(view.queryByText('会员即将到期')).toBeNull();expect(mockStorage.size).toBe(0);expect(checkAppUpdate).not.toHaveBeenCalled();
});
it('opens renewal without clearing learning data and invalidates an old reminder after renewal',async()=>{
 const view=await render(<AppUpdatePrompt/>);await waitFor(()=>expect(view.getByText('去续费')).toBeTruthy());
 await fireEvent.press(view.getByText('去续费'));expect(mockPush).toHaveBeenCalledWith('/account/membership');
 mockExpiry=new Date(Date.now()+30*86400000).toISOString();await view.rerender(<AppUpdatePrompt/>);expect(view.queryByText('会员即将到期')).toBeNull();
});
