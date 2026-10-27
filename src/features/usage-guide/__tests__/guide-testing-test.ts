import { Platform } from 'react-native';
import { isGuideTestingAvailable } from '../guide-testing';
let mockEnvironment='production', mockApplicationId='com.readyoufife.app', mockAcceptance=false;
jest.mock('@icao/distribution-environment',()=>({getIcaoDistributionEnvironment:()=>mockEnvironment}));
jest.mock('expo-application',()=>({get applicationId(){return mockApplicationId;}}));
jest.mock('@/features/auth/ui-acceptance-mode',()=>({get UI_ACCEPTANCE_MODE_AVAILABLE(){return mockAcceptance;}}));
const development=__DEV__, platform=Platform.OS;
beforeEach(()=>{Object.defineProperty(globalThis,'__DEV__',{configurable:true,value:false});mockEnvironment='production';mockApplicationId='com.readyoufife.app';mockAcceptance=false;});
afterEach(()=>{Object.defineProperty(globalThis,'__DEV__',{configurable:true,value:development});Object.defineProperty(Platform,'OS',{configurable:true,value:platform});});
it.each(['ios','android','web'] as const)('does not expose the reset utility in production %s',os=>{
 Object.defineProperty(Platform,'OS',{configurable:true,value:os});expect(isGuideTestingAvailable()).toBe(false);
});
it('uses the existing distribution source for TestFlight and the Android test package identity',()=>{
 Object.defineProperty(Platform,'OS',{configurable:true,value:'ios'});mockEnvironment='sandbox';expect(isGuideTestingAvailable()).toBe(true);
 Object.defineProperty(Platform,'OS',{configurable:true,value:'android'});expect(isGuideTestingAvailable()).toBe(false);
 mockApplicationId='com.readyoufife.app.test';expect(isGuideTestingAvailable()).toBe(true);
 Object.defineProperty(Platform,'OS',{configurable:true,value:'web'});expect(isGuideTestingAvailable()).toBe(false);
 mockAcceptance=true;expect(isGuideTestingAvailable()).toBe(true);
});
