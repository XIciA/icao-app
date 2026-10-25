import { act, fireEvent, render } from '@testing-library/react-native';
import { GuideOverlay } from '../GuideOverlay';
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));
it('never flashes or advances an unmeasured fallback card and always allows leaving', async () => {
  jest.useFakeTimers();
  const next = jest.fn(), skip = jest.fn();
  try {
    const screen = await render(<GuideOverlay layer="root" topLayer="root" nodes={new Map()} prompt={{target:'study-open',title:'题库学习',text:'等待真实题目。',index:0,total:1,next,skip,exit:skip}} />);
    await fireEvent(screen.getByTestId('guide-overlay'), 'layout', {nativeEvent:{layout:{x:0,y:0,width:390,height:844}}});
    await act(async () => { jest.advanceTimersByTime(600); });
    expect(screen.queryByText('等待真实题目。')).toBeNull();
    expect(screen.queryByTestId('guide-compact-hint')).toBeNull();
    expect(screen.queryByTestId('guide-hint')).toBeNull();
    await act(async () => { jest.advanceTimersByTime(8000); });
    expect(screen.getByText('当前目标尚未就绪，可返回重试或跳过教学。')).toBeTruthy();
    expect(screen.queryByText('继续')).toBeNull(); expect(next).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', {name:'跳过教学'}));
    expect(skip).toHaveBeenCalledTimes(1);
    await screen.unmount();
  } finally { jest.useRealTimers(); }
});

it('keeps one full-height backdrop through step changes, keyboard events, scoring and navigation', async () => {
  const { Keyboard, StyleSheet } = jest.requireActual('react-native') as typeof import('react-native');
  const listeners = new Map<string,(event: import('react-native').KeyboardEvent)=>void>();
  const addListener = Keyboard.addListener.bind(Keyboard);
  const subscription = jest.spyOn(Keyboard,'addListener').mockImplementation((name, callback) => {
    listeners.set(name,callback); return addListener(name,callback);
  });
  const base={target:'sentence-play',title:'题库学习',text:'点播放',index:0,total:2,skip:jest.fn(),exit:jest.fn()};
  try {
    const tree=(changes:object={})=><GuideOverlay layer="root" topLayer="root" nodes={new Map()} prompt={{...base,...changes}}/>;
    const screen=await render(tree());
    await fireEvent(screen.getByTestId('guide-overlay'),'layout',{nativeEvent:{layout:{x:0,y:0,width:390,height:844}}});
    const check=()=>{
      expect(screen.getByTestId('guide-mask').props.height).toBe(844);
      const style=StyleSheet.flatten(screen.getByRole('button',{name:'跳过教学'}).props.style);
      expect(style.width).toBe(112);expect(style.right).toBeUndefined();
      expect(screen.getByTestId('guide-backdrop')).toBeTruthy();
    };
    check();
    await act(async()=>listeners.get('keyboardDidShow')?.({duration:0,easing:'keyboard',endCoordinates:{screenY:480,screenX:0,width:390,height:364}})); check();
    await screen.rerender(tree({identity:'next',target:'sentence-text'})); check();
    await act(async()=>listeners.get('keyboardDidHide')?.({duration:0,easing:'keyboard',endCoordinates:{screenY:844,screenX:0,width:390,height:0}})); check();
    await screen.rerender(tree({activity:'waiting',next:jest.fn(),nextLabel:'暂不评分，继续教学'})); check();
    expect(screen.getByText('暂不评分，继续教学')).toBeTruthy();
    await screen.rerender(tree({transitioning:true})); check();
    expect(screen.queryByTestId('guide-hint')).toBeNull();
    await screen.unmount();
  } finally { subscription.mockRestore(); }
});


it('retains the page backdrop behind a native modal without a second set of actions', async () => {
  const prompt={target:'export-levels',text:'选择范围',index:0,total:2,skip:jest.fn(),exit:jest.fn()};
  const tree=(topLayer:string)=><GuideOverlay layer="root" topLayer={topLayer} nodes={new Map()} prompt={prompt}/>;
  const screen=await render(tree('root'));
  expect(screen.getByRole('button',{name:'跳过教学'})).toBeTruthy();
  await screen.rerender(tree('sheet'));
  expect(screen.getByTestId('guide-backdrop')).toBeTruthy();
  expect(screen.queryByRole('button',{name:'跳过教学'})).toBeNull();
  await screen.rerender(tree('root'));
  expect(screen.getByTestId('guide-backdrop')).toBeTruthy();
  expect(screen.getByRole('button',{name:'跳过教学'})).toBeTruthy();
  await screen.unmount();
});
