import { act, render } from '@testing-library/react-native';
import { Platform, View } from 'react-native';
import { AppRuntime } from '../AppRuntime';
let mockUpdateProps: {startup:boolean;onStartupComplete:()=>void};
const mockDownloads=jest.fn();
jest.mock('@/features/app-updates/AppUpdatePrompt',()=>({AppUpdatePrompt:(props:any)=>{mockUpdateProps=props;return null;}}));
jest.mock('@/components/states/StartupBrandScreen',()=>({StartupBrandScreen:()=>{const {View}=jest.requireActual('react-native');return <View testID="startup"/>;}}));
jest.mock('@/features/auth/AuthProvider',()=>({useAuth:()=>({canAccessApp:false})}));
jest.mock('@/features/question-bank/downloads/DownloadRuntime',()=>({DownloadRuntime:()=>{mockDownloads();return null;}}));
jest.mock('@/features/ai/NativeAiRecovery.native',()=>({NativeAiRecovery:()=>null}));
jest.mock('@/features/question-bank/recording/recording-repository',()=>({recordingRepository:{cleanupExpired:jest.fn()}}));
jest.mock('@/platform/diagnostics/safe-diagnostic-store',()=>({purgeExpiredSafeDiagnostics:async()=>undefined}));
jest.mock('@/features/native-commercial-testflight/CommerceRuntimeProvider',()=>({CommerceRuntimeProvider:({children}:any)=>children}));
jest.mock('@/features/radio-player/RadioPlayerProvider',()=>({RadioPlayerProvider:({children}:any)=>children}));
jest.mock('@/features/radio-player/RadioMiniPlayer',()=>({RadioMiniPlayer:()=>null}));
const originalOS=Platform.OS;
afterEach(()=>{Object.defineProperty(Platform,'OS',{configurable:true,value:originalOS});jest.clearAllMocks();});
it('checks Android updates before mounting login or business pages even for a guest',async()=>{
 Object.defineProperty(Platform,'OS',{configurable:true,value:'android'});
 const view=await render(<AppRuntime><View testID="business"/></AppRuntime>);
 expect(mockUpdateProps.startup).toBe(true);expect(view.queryByTestId('business')).toBeNull();expect(view.getByTestId('startup')).toBeTruthy();expect(mockDownloads).not.toHaveBeenCalled();
 await act(async()=>{mockUpdateProps.onStartupComplete();});
 expect(view.getByTestId('business')).toBeTruthy();expect(view.queryByTestId('startup')).toBeNull();expect(mockUpdateProps.startup).toBe(false);
});
it('does not introduce the Android startup gate into iOS',async()=>{
 Object.defineProperty(Platform,'OS',{configurable:true,value:'ios'});
 const view=await render(<AppRuntime><View testID="business"/></AppRuntime>);
 expect(mockUpdateProps.startup).toBe(false);expect(view.getByTestId('business')).toBeTruthy();
});
