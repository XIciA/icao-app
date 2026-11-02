import { fireEvent, render } from '@testing-library/react-native';
import { CenteredState } from '../CenteredState';
const mockBack = jest.fn();
const mockReplace = jest.fn();
jest.mock('@/components/navigation/useAppRouter', () => ({ useAppRouter: () => ({ canGoBack: () => true, back: mockBack, replace: mockReplace }) }));
beforeEach(() => jest.clearAllMocks());
it('offers only retry and the local exit, preserving their distinct actions', async () => {
  const retry = jest.fn(), exit = jest.fn();
  const view = await render(<CenteredState kind="failure" onAction={retry} onReturn={exit} />);
  expect(view.getAllByRole('button')).toHaveLength(2);
  await fireEvent.press(view.getByText('重试'));
  expect(retry).toHaveBeenCalledTimes(1);
  expect(exit).not.toHaveBeenCalled();
  await fireEvent.press(view.getByText('返回'));
  expect(exit).toHaveBeenCalledTimes(1);
  expect(mockBack).not.toHaveBeenCalled();
});
it('account recovery replaces the default return action rather than adding a third button', async () => {
  const signOut = jest.fn();
  const view = await render(<CenteredState kind="account" actionLabel="重新检查" onAction={jest.fn()} secondaryLabel="退出登录" onSecondary={signOut} />);
  expect(view.getAllByRole('button')).toHaveLength(2);
  expect(view.queryByText('返回')).toBeNull();
  await fireEvent.press(view.getByText('退出登录'));
  expect(signOut).toHaveBeenCalledTimes(1);
});
it('a content-unavailable prompt has one actionable exit and no invented retry', async () => {
  const view = await render(<CenteredState kind="unavailable" />);
  expect(view.getAllByRole('button')).toHaveLength(1);
  expect(view.queryByText('重试')).toBeNull();
  await fireEvent.press(view.getByText('返回'));
  expect(mockBack).toHaveBeenCalledTimes(1);
});
