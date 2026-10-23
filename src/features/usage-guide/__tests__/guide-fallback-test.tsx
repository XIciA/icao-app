import { act, fireEvent, render } from '@testing-library/react-native';
import { GuideOverlay } from '../GuideOverlay';

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));

it('keeps unanchored teaching readable, collapsible and completable without blocking the page', async () => {
  jest.useFakeTimers();
  const next = jest.fn(), skip = jest.fn();
  try {
    const screen = await render(<GuideOverlay layer="root" topLayer="root" nodes={new Map()} prompt={{target:'study-open',title:'题库学习',text:'选择题库和题目。',index:0,total:1,next,skip,exit:skip}} />);
    await fireEvent(screen.getByTestId('guide-overlay'), 'layout', {nativeEvent:{layout:{x:0,y:0,width:390,height:844}}});
    await act(async () => { jest.advanceTimersByTime(550); });
    expect(screen.getByText('选择题库和题目。')).toBeTruthy();
    expect(screen.queryByTestId('guide-hint')).toBeNull();
    await fireEvent.press(screen.getByRole('button', {name:'收起教学提示'}));
    expect(screen.queryByText('选择题库和题目。')).toBeNull();
    await fireEvent.press(screen.getByRole('button', {name:'展开教学提示'}));
    await fireEvent.press(screen.getByText('知道了'));
    expect(next).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole('button', {name:'跳过教学'}));
    expect(skip).toHaveBeenCalledTimes(1);
    await screen.unmount();
  } finally { jest.useRealTimers(); }
});
