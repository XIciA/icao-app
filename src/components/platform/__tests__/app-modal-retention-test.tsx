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
 const tree=(visible:boolean,text:string)=><AppModal visible={visible} animationType="fade"><View accessibilityLabel="positioned menu" style={{top:visible?180:0}}><Text>{text}</Text></View></AppModal>;
 const screen=await render(tree(true,'speed options'));
 await screen.rerender(tree(false,'empty menu'));
 expect(screen.getByText('speed options',{includeHiddenElements:true})).toBeTruthy();expect(screen.queryByText('speed options')).toBeNull();expect(screen.queryByText('empty menu')).toBeNull();
 expect(screen.getByLabelText('positioned menu',{includeHiddenElements:true}).props.style.top).toBe(180);
 await screen.rerender(tree(true,'different options'));expect(screen.getByText('different options')).toBeTruthy();
 await screen.unmount();
});
