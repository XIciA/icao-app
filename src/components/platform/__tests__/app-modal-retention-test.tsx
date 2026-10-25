import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { fireEvent } from '@testing-library/react-native';
import { render } from '@testing-library/react-native';
import { Text, View } from 'react-native';
import { AppModal } from '../AppModal';
jest.mock('react-native',()=>{
 const actual=jest.requireActual('react-native');
 const Modal=({children}:{children:React.ReactNode})=><actual.View>{children}</actual.View>;
 return Object.create(actual,{Modal:{value:Modal}});
});
jest.mock('@/features/usage-guide/GuideBindings',()=>({useGuide:()=>null,GuideModalScope:({children}:{children:React.ReactNode})=>children}));
it('preserves the last shown native modal content and coordinates while dismissing',async()=>{
 const tree=(visible:boolean,text:string)=><SafeAreaProvider initialMetrics={{frame:{x:0,y:0,width:390,height:844},insets:{top:0,bottom:0,left:0,right:0}}}><AppModal visible={visible} animationType="fade"><View accessibilityLabel="positioned menu" style={{top:visible?180:0}}><Text>{text}</Text></View></AppModal></SafeAreaProvider>;
 const screen=await render(tree(true,'speed options'));
 await screen.rerender(tree(false,'empty menu'));
 expect(screen.getByText('speed options',{includeHiddenElements:true})).toBeTruthy();expect(screen.queryByText('speed options')).toBeNull();expect(screen.queryByText('empty menu')).toBeNull();
 expect(screen.getByLabelText('positioned menu',{includeHiddenElements:true}).props.style.top).toBe(180);
 await screen.rerender(tree(true,'different options'));expect(screen.getByText('different options')).toBeTruthy();
 await screen.unmount();
});

it('measures a modal safe area separately from the presenting screen',async()=>{
 function Insets(){const insets=useSafeAreaInsets();return <Text>top:{insets.top}</Text>;}
 const screen=await render(<SafeAreaProvider initialMetrics={{frame:{x:0,y:0,width:390,height:844},insets:{top:0,bottom:0,left:0,right:0}}}><AppModal visible><Insets/></AppModal></SafeAreaProvider>);
 let provider=screen.getByText('top:0').parent;
 while(provider && provider.type !== 'RNCSafeAreaProvider') provider=provider.parent;
 expect(provider).toBeTruthy();
 await fireEvent(provider!,'insetsChange',{nativeEvent:{frame:{x:0,y:0,width:390,height:844},insets:{top:59,bottom:34,left:0,right:0}}});
 expect(screen.getByText('top:59')).toBeTruthy();
});
