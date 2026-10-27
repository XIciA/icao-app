import { act, fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { StudyScopeSelector } from '../components/StudyScopeSelector';

let mockProfile = { studyScope: 'selected' };
const mockUpdate = jest.fn(async (_patch: object) => undefined);
let mockModal: {visible:boolean;onRequestClose:()=>void};
jest.mock('@/features/account/profile-store.native', () => ({useProfile:()=>mockProfile,updateProfile:(patch:object)=>mockUpdate(patch)}));
jest.mock('react-native', () => {
 const actual=jest.requireActual('react-native'), React=jest.requireActual('react');
 const Pressable=React.forwardRef((props:object,ref:unknown)=>{
  React.useImperativeHandle(ref,()=>({measureInWindow:(callback:(...values:number[])=>void)=>callback(180,140,160,44)}));
  return <actual.Pressable {...props}/>;
 });
 Pressable.displayName='MeasuredPressable';
 const Modal=({children,...props}:{children:React.ReactNode;visible:boolean;onRequestClose:()=>void})=>{mockModal=props;return <actual.View>{children}</actual.View>;};
 return Object.create(actual,{Modal:{value:Modal},Pressable:{value:Pressable}});
});
function position(screen: Awaited<ReturnType<typeof render>>) {
 return StyleSheet.flatten(screen.getByLabelText('题库范围选项').props.style);
}
async function open(screen: Awaited<ReturnType<typeof render>>) {
 await fireEvent.press(screen.getByLabelText(/切换题库范围，当前/));
 expect(mockModal.visible).toBe(true);
}
async function setup() {
 mockProfile={studyScope:'selected'};mockUpdate.mockReset().mockResolvedValue(undefined);
 return render(<StudyScopeSelector/>);
}
it('retains the measured menu position throughout cancel, re-open, and native dismissal',async()=>{
 const screen=await setup();await open(screen);
 const measured=position(screen);expect(measured.top).toBe(190);
 await fireEvent.press(screen.getByLabelText('关闭题库范围菜单', {includeHiddenElements:true}));
 expect(mockModal.visible).toBe(false);expect(position(screen)).toEqual(measured);expect(mockUpdate).not.toHaveBeenCalled();
 await open(screen);await act(async()=>mockModal.onRequestClose());
 expect(mockModal.visible).toBe(false);expect(position(screen)).toEqual(measured);
});
it('closes a repeated selection without writing or shifting the fading menu',async()=>{
 const screen=await setup();await open(screen);const measured=position(screen);
 await fireEvent.press(screen.getByLabelText('选择精选题库'));
 expect(mockUpdate).not.toHaveBeenCalled();expect(mockModal.visible).toBe(false);expect(position(screen)).toEqual(measured);
});
it('saves an actual switch once and leaves a failed switch open for recovery',async()=>{
 const screen=await setup();await open(screen);const measured=position(screen);
 let complete!:(value:undefined)=>void;
 mockUpdate.mockImplementationOnce(()=>new Promise(resolve=>{complete=resolve;}));
 await fireEvent.press(screen.getByLabelText('选择最全题库'));await fireEvent.press(screen.getByLabelText('选择最全题库'));
 expect(mockUpdate).toHaveBeenCalledTimes(1);expect(mockModal.visible).toBe(true);
 await act(async()=>complete(undefined));expect(mockModal.visible).toBe(false);expect(position(screen)).toEqual(measured);
 await open(screen);mockUpdate.mockRejectedValueOnce(new Error('disk full'));
 await fireEvent.press(screen.getByLabelText('选择最全题库'));
 expect(screen.getByText('切换未保存，请重试')).toBeTruthy();expect(mockModal.visible).toBe(true);expect(position(screen)).toEqual(measured);
 await fireEvent.press(screen.getByLabelText('选择最全题库'));expect(mockModal.visible).toBe(false);
});
