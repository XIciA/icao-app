import { act, renderHook } from '@testing-library/react-native';
import { NavigationContext } from '@react-navigation/native';
import { Platform } from 'react-native';
import { useAppRouter } from '../useAppRouter.native';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockRouter = { push: mockPush, back: mockBack };
let mockLegacy = false;
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('@/config/web-runtime', () => ({ isVercelLegacyWeb: () => mockLegacy }));

const originalPlatform = Platform.OS;
beforeEach(() => { Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' }); mockLegacy = false; jest.clearAllMocks(); });
afterEach(() => { Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform }); });

it('protects formal web controls sharing a screen, ignores late actions, and unlocks on return', async () => {
  let focused = true;
  const listeners = new Map<string, () => void>();
  const navigation = { isFocused: () => focused, addListener: (name: string, callback: () => void) => { listeners.set(name, callback); return () => listeners.delete(name); } };
  const wrapper = ({ children }: { children: React.ReactNode }) => <NavigationContext.Provider value={navigation as never}>{children}</NavigationContext.Provider>;
  const hook = await renderHook(() => ({ first: useAppRouter(), second: useAppRouter() }), { wrapper });
  await act(() => { hook.result.current.first.push('/info/guide'); hook.result.current.second.back(); });
  expect(mockPush).toHaveBeenCalledTimes(1);
  expect(mockBack).not.toHaveBeenCalled();
  focused = false;
  await act(() => { listeners.get('focus')?.(); hook.result.current.second.push('/info/feedback'); });
  expect(mockPush).toHaveBeenCalledTimes(1);
  focused = true;
  await act(() => { listeners.get('focus')?.(); hook.result.current.second.back(); });
  expect(mockBack).toHaveBeenCalledTimes(1);
  expect(listeners.has('transitionStart')).toBe(false);
});

it('retains the original legacy router unchanged', async () => {
  mockLegacy = true;
  const hook = await renderHook(() => useAppRouter());
  expect(hook.result.current).toBe(mockRouter);
});
