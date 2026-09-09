import { fireEvent, render } from '@testing-library/react-native';
import { useEffect } from 'react';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NativeScreenBoundary } from '../NativeScreenBoundary.native';

const mockBack = jest.fn();
const mockReplace = jest.fn();
let mockCanGoBack = true;
let fail = false;
const cleanup = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ back: mockBack, replace: mockReplace, canGoBack: () => mockCanGoBack }) }));

function Page() {
  useEffect(() => cleanup, []);
  if (fail) throw new Error('render_failure_with_private_details');
  return <Text>原页面</Text>;
}
function screen(props: Partial<React.ComponentProps<typeof NativeScreenBoundary>> = {}) {
  return <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, bottom: 34, left: 0, right: 0 } }}>
    <NativeScreenBoundary title="学习记录" fallbackHref="/(tabs)/profile" {...props}><Page /></NativeScreenBoundary>
  </SafeAreaProvider>;
}
let consoleError: jest.SpyInstance;
beforeEach(() => { jest.clearAllMocks(); fail = false; mockCanGoBack = true; consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined); });
afterEach(() => { consoleError.mockRestore(); });

it('unmounts failed page effects and provides a return path without exposing error details', async () => {
  const view = await render(screen());
  expect(view.getByText('原页面')).toBeTruthy();
  fail = true;
  await view.rerender(screen());
  expect(cleanup).toHaveBeenCalled();
  expect(view.getByText('页面暂时无法显示')).toBeTruthy();
  expect(view.queryByText(/private_details/)).toBeNull();
  await fireEvent.press(view.getByText('返回'));
  expect(mockBack).toHaveBeenCalledTimes(1);
});

it('returns a deep-linked failed screen to its safe parent when no back stack exists', async () => {
  fail = true; mockCanGoBack = false;
  const view = await render(screen());
  await fireEvent.press(view.getByLabelText('返回'));
  expect(mockReplace).toHaveBeenCalledWith('/(tabs)/profile');
});

it('prefers the existing inline history return callback and can retry the original screen', async () => {
  fail = true; const onExit = jest.fn();
  const view = await render(screen({ onExit }));
  await fireEvent.press(view.getByText('返回'));
  expect(onExit).toHaveBeenCalledTimes(1); expect(mockBack).not.toHaveBeenCalled();
  fail = false;
  await fireEvent.press(view.getByText('重新加载'));
  expect(view.getByText('原页面')).toBeTruthy();
  expect(view.queryByText('页面暂时无法显示')).toBeNull();
});

it('does not carry the error state to another route identity', async () => {
  fail = true;
  const view = await render(screen({ resetKey: 'old-topic' }));
  fail = false;
  await view.rerender(screen({ resetKey: 'new-topic' }));
  expect(view.getByText('原页面')).toBeTruthy();
});

it('never offers an exit that bypasses required login', async () => {
  fail = true;
  const view = await render(screen({ allowExit: false }));
  expect(view.queryByText('返回')).toBeNull();
  expect(view.queryByLabelText('返回')).toBeNull();
  fail = false;
  await fireEvent.press(view.getByText('重新加载'));
  expect(view.getByText('原页面')).toBeTruthy();
  expect(mockBack).not.toHaveBeenCalled(); expect(mockReplace).not.toHaveBeenCalled();
});
