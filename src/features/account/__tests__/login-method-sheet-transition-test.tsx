import { act, fireEvent, render } from '@testing-library/react-native';
import { LoginMethodSheet } from '../LoginMethodSheet.native';
const mockChange=jest.fn(async (..._args:unknown[])=>undefined);
const mockAuthorize=jest.fn(async()=> 'test-grant');
jest.mock('@/features/auth/AuthProvider',()=>({useAuth:()=>({account:{providers:['phone','apple'],hasPassword:true,phoneBound:true},changeLoginMethod:(...args:unknown[])=>mockChange(...args),authorizePhoneBinding:()=>mockAuthorize()})}));
jest.mock('@/components/ui',()=>{
 const actual=jest.requireActual('@/components/ui');const {View,Text,Pressable}=jest.requireActual('react-native');
 return {...actual,BottomSheet:({visible,children,onClosed}:{visible:boolean;children:React.ReactNode;onClosed:()=>void})=><View><Text>{visible?'sheet-open':'sheet-closing'}</Text>{children}<Pressable accessibilityLabel="finish-sheet-exit" onPress={onClosed}/></View>};
});
it('waits for visual exit before allowing the parent to unmount a cancelled login-method sheet',async()=>{
 const close=jest.fn();const screen=await render(<LoginMethodSheet provider="apple" bound onClose={close}/>);
 await fireEvent.press(screen.getByText('取消'));
 expect(screen.getByText('sheet-closing')).toBeTruthy();expect(close).not.toHaveBeenCalled();expect(mockChange).not.toHaveBeenCalled();
 await fireEvent.press(screen.getByLabelText('finish-sheet-exit'));expect(close).toHaveBeenCalledTimes(1);
});
it('retains successful phone verification until its exit transition completes',async()=>{
 const close=jest.fn();let complete!:()=>void;
 const verified=jest.fn(()=>new Promise<void>(resolve=>{complete=resolve;}));
 const screen=await render(<LoginMethodSheet provider="phone" bound onClose={close} onVerified={verified}/>);
 await fireEvent.changeText(screen.getByLabelText('登录密码'),'test-password');
 await fireEvent.press(screen.getByText('验证并继续'));
 expect(mockAuthorize).toHaveBeenCalledTimes(1);expect(verified).toHaveBeenCalledWith('test-grant');expect(close).not.toHaveBeenCalled();
 await act(async()=>complete());expect(screen.getByText('sheet-closing')).toBeTruthy();
 await fireEvent.press(screen.getByLabelText('finish-sheet-exit'));expect(close).toHaveBeenCalledTimes(1);
});
