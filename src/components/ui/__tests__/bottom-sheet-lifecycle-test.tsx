import { act, fireEvent, render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { BottomSheet } from '../BottomSheet';
jest.mock('@/components/platform/AppModal',()=>{
  const {View,Text,Pressable}=jest.requireActual('react-native');
  return {AppModal:({visible,onShow,children}:{visible:boolean;onShow:()=>void;children:React.ReactNode})=><View><Text>{visible?'modal-open':'modal-closed'}</Text><Pressable accessibilityLabel="present-modal" onPress={onShow}/>{visible?children:null}</View>};
});
jest.mock('react-native-safe-area-context',()=>jest.requireActual('react-native-safe-area-context/jest/mock').default);
it('keeps the modal mounted through close animation and supports reopening before dismissal', async()=>{
  jest.useFakeTimers();
  try {
    const tree=(visible:boolean)=><BottomSheet visible={visible} onClose={()=>undefined}><Text>题库列表</Text></BottomSheet>;
    const screen=await render(tree(true));
    await fireEvent.press(screen.getByLabelText('present-modal'));
    await act(async()=>{jest.advanceTimersByTime(300);});
    await screen.rerender(tree(false));
    expect(screen.getByText('modal-open')).toBeTruthy();
    await screen.rerender(tree(true));
    await act(async()=>{jest.advanceTimersByTime(300);});
    expect(screen.getByText('modal-open')).toBeTruthy();
    await screen.rerender(tree(false));
    await act(async()=>{jest.advanceTimersByTime(300);});
    expect(screen.getByText('modal-closed')).toBeTruthy();
    await screen.unmount();
  } finally {jest.useRealTimers();}
});
