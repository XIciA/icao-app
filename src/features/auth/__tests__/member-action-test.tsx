import { act, renderHook } from '@testing-library/react-native';
import { useMemberAction } from '../use-member-action';
const mockPush = jest.fn();
let mockCanAccess = false;
let mockCommerce: {phase:string;entitlement?:{membership:{active:boolean;expiresAt?:string}}};
jest.mock('@/components/navigation/useAppRouter', () => ({useAppRouter:()=>({push:mockPush})}));
jest.mock('../AuthProvider', () => ({useAuth:()=>({canAccessApp:mockCanAccess})}));
jest.mock('@/features/native-commercial-testflight/CommerceRuntimeProvider', () => ({useCommerceRuntime:()=>mockCommerce}));
beforeEach(()=>{jest.clearAllMocks();mockCanAccess=false;mockCommerce={phase:'ready'};});
it.each([false,true])('routes a guest or confirmed non-member to purchase: signed in %s', async signedIn => {
  mockCanAccess=signedIn;mockCommerce.entitlement={membership:{active:false}};
  const hook=await renderHook(useMemberAction);
  await act(()=>hook.result.current('/content/hotspot/day/study?center=Beijing'));
  expect(mockPush).toHaveBeenCalledWith('/account/membership?next=%2Fcontent%2Fhotspot%2Fday%2Fstudy%3Fcenter%3DBeijing');
});
it('opens active membership and lets the destination gate handle an unknown entitlement',async()=>{
  mockCanAccess=true;mockCommerce.entitlement={membership:{active:true}};
  const hook=await renderHook(useMemberAction);
  await act(()=>hook.result.current('/content/mock-exam'));
  expect(mockPush).toHaveBeenLastCalledWith('/content/mock-exam');
  mockCommerce={phase:'error'};await hook.rerender();
  await act(()=>hook.result.current('/content/mock-exam'));
  expect(mockPush).toHaveBeenLastCalledWith('/content/mock-exam');
});
