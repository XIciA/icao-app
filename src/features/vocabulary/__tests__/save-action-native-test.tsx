import { act, fireEvent, render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { useSaveAction } from '../use-save-action.native';
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
let mockOwner = 0;
jest.mock('@/features/sync/learning-sync.native', () => ({
  captureLearningWriteContext: () => mockOwner,
  assertLearningWriteContext: (owner: number) => { if (owner !== mockOwner) throw new Error('account_changed'); },
}));
let save!: ReturnType<typeof useSaveAction>;
function Page() { save = useSaveAction(); return save.wrap(<Text>原学习页面</Text>); }
beforeEach(() => { mockOwner = 0; });
it('keeps the screen, retries a failed save, and advances only after success', async () => {
  const write = jest.fn().mockRejectedValueOnce(new Error('disk')).mockResolvedValueOnce(undefined);
  const advance = jest.fn();
  const screen = await render(<Page />);
  await act(async () => { await save.run(write, advance); });
  expect(advance).not.toHaveBeenCalled();
  expect(screen.getByText('保存尚未完成')).toBeTruthy();
  await fireEvent.press(screen.getByText('重试保存'));
  expect(write).toHaveBeenCalledTimes(2);
  expect(advance).toHaveBeenCalledTimes(1);
});
it('blocks duplicate submissions and prevents retry into a different account', async () => {
  let reject!: (reason: Error) => void;
  const write = jest.fn(() => new Promise((_, fail) => { reject = fail; }));
  const advance = jest.fn();
  const screen = await render(<Page />);
  let first!: Promise<void>;
  await act(async () => { first = save.run(write, advance); await save.run(write, advance); });
  expect(write).toHaveBeenCalledTimes(1);
  await act(async () => { reject(new Error('disk')); await first; });
  mockOwner++;
  await fireEvent.press(screen.getByText('重试保存'));
  expect(write).toHaveBeenCalledTimes(1);
  expect(advance).not.toHaveBeenCalled();
});

it('keeps successful routine saves on the page without opening a saving modal', async () => {
  let complete!: () => void;
  const screen=await render(<Page/>);
  let pending!: Promise<void>;
  await act(async()=>{pending=save.run(()=>new Promise<void>(resolve=>{complete=resolve;}));});
  expect(save.saving).toBe(true);expect(save.isPending()).toBe(true);
  expect(screen.queryByText('正在保存')).toBeNull();expect(screen.getByText('原学习页面')).toBeTruthy();
  await act(async()=>{complete();await pending;});
  expect(save.saving).toBe(false);
});
