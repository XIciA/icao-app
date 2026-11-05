import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { AppUpdatePrompt } from '../AppUpdatePrompt';
import { Platform } from 'react-native';
import { downloadAndroidUpdate, installAndroidUpdate } from '../android-update.native';
import { openAppUpdate } from '../app-updates.native';
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
jest.mock('../android-update.native', () => ({ downloadAndroidUpdate: jest.fn(), installAndroidUpdate: jest.fn() }));
jest.mock('../app-updates.native',()=>({checkAppUpdate:jest.fn(async()=>undefined),dismissAppUpdate:jest.fn(async()=>{}),openAppUpdate:jest.fn(async()=>{})}));
jest.mock('@/components/ui',()=>{
 const {Text,View,Pressable}=jest.requireActual('react-native');
 return {AppText:({children}:any)=><Text>{children}</Text>,BottomSheet:({children,visible}:any)=>visible?<View>{children}</View>:null,Button:({children,onPress}:any)=><Pressable onPress={onPress}><Text>{children}</Text></Pressable>};
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

const release = { channel: 'android-apk' as const, version: '1.2.1', build: 200, available: true as const,
 url: 'https://cloud.readyoufife.com/storage/v1/object/public/app-releases/android/app-200.apk',
 notes: '更新', publishedAt: '2026-10-21T00:00:00Z' };
const originalOS = Platform.OS;
afterEach(() => Object.defineProperty(Platform, 'OS', { configurable: true, value: originalOS }));
it('downloads once, explains unknown-source permission and reuses the file when continuing installation', async () => {
 Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
 jest.mocked(checkAppUpdate).mockResolvedValueOnce(release);
 jest.mocked(downloadAndroidUpdate).mockImplementationOnce(async (_update, progress) => { progress(0.5); return 'file:///cache/app-updates/a.apk'; });
 jest.mocked(installAndroidUpdate).mockResolvedValueOnce('permission-required').mockResolvedValueOnce('installer-opened');
 const view = await render(<AppUpdatePrompt manual />);
 await fireEvent.press(view.getByText('检查更新'));
 await waitFor(() => expect(view.getByText('下载并安装')).toBeTruthy());
 await fireEvent.press(view.getByText('下载并安装'));
 await waitFor(() => expect(view.getByText('请允许安装此来源的应用，返回后点击“继续安装”。')).toBeTruthy());
 await fireEvent.press(view.getByText('继续安装'));
 await waitFor(() => expect(installAndroidUpdate).toHaveBeenCalledTimes(2));
 expect(downloadAndroidUpdate).toHaveBeenCalledTimes(1);
 expect(openAppUpdate).not.toHaveBeenCalled();
});
it('allows retry after a failed Android download', async () => {
 Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
 jest.mocked(checkAppUpdate).mockResolvedValueOnce(release);
 jest.mocked(downloadAndroidUpdate).mockRejectedValueOnce(new Error('offline'));
 const view = await render(<AppUpdatePrompt manual />);
 await fireEvent.press(view.getByText('检查更新'));
 await waitFor(() => expect(view.getByText('下载并安装')).toBeTruthy());
 await fireEvent.press(view.getByText('下载并安装'));
 await waitFor(() => expect(view.getAllByText('下载或安装未完成，请检查网络、存储空间和安装权限后重试。').length).toBeGreaterThan(0));
 expect(view.getByText('下载并安装')).toBeTruthy();
 expect(installAndroidUpdate).not.toHaveBeenCalled();
});
it('keeps iOS updates on the App Store / TestFlight link flow', async () => {
 Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
 const iosRelease = { ...release, channel: 'ios-app-store' as const, url: 'https://apps.apple.com/cn/app/id6800583111' };
 jest.mocked(checkAppUpdate).mockResolvedValueOnce(iosRelease);
 const view = await render(<AppUpdatePrompt manual />);
 await fireEvent.press(view.getByText('检查更新'));
 await waitFor(() => expect(view.getByText('去更新')).toBeTruthy());
 await fireEvent.press(view.getByText('去更新'));
 expect(openAppUpdate).toHaveBeenCalledWith(iosRelease);
 expect(downloadAndroidUpdate).not.toHaveBeenCalled();
});
