import { act, fireEvent, render } from '@testing-library/react-native';
import { StartupBrandScreen } from '../StartupBrandScreen';
jest.mock('expo-splash-screen', () => ({ hideAsync: jest.fn().mockResolvedValue(undefined) }));

describe('startup brand handoff', () => {
  it('keeps the same composition and dimensions when the delayed hint appears', async () => {
    jest.useFakeTimers();
    const screen = await render(<StartupBrandScreen />);
    const before = screen.getByTestId('startup-brand').props;
    expect(before.source).toBe(require('../../../../assets/images/startup-brand.png'));
    expect(screen.queryByText('正在准备学习空间…')).toBeNull();
    await act(async () => { jest.advanceTimersByTime(1500); });
    const after = screen.getByTestId('startup-brand').props;
    expect(after.style).toEqual(before.style);
    expect(after.source).toBe(before.source);
    expect(screen.getByText('正在打开…')).toBeTruthy();
    await screen.unmount();
    jest.clearAllTimers();
    jest.useRealTimers();
  });
  it('keeps recovery actionable without marking it as a pending loading surface', async () => {
    const retry = jest.fn();
    const screen = await render(<StartupBrandScreen error="暂时无法确认账号状态" onRetry={retry} />);
    expect(screen.queryByTestId('global-loading-screen')).toBeNull();
    expect(screen.getByTestId('startup-brand')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: '重新尝试' }));
    expect(retry).toHaveBeenCalledTimes(1);
    await screen.unmount();
  });

});
