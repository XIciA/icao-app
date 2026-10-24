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
