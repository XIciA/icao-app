import { act, renderHook } from '@testing-library/react-native';
import { useLoginEntry } from '../use-login-entry';

const mockPush = jest.fn();
const mockRemember = jest.fn();
let mockCanAccess = false;
let mockPathname = '/';
let mockAccountState: Record<string, unknown> = {};
jest.mock('@/components/navigation/useAppRouter', () => ({ useAppRouter: () => ({ push: mockPush }) }));
jest.mock('expo-router', () => ({ usePathname: () => mockPathname }));
jest.mock('../AuthProvider', () => ({ useAuth: () => ({ canAccessApp: mockCanAccess, rememberPendingPath: mockRemember, ...mockAccountState }) }));

beforeEach(() => { jest.clearAllMocks(); mockCanAccess = false; mockPathname = '/'; mockAccountState = {}; });

it('remembers the selected question bank before opening login from the catalogue', async () => {
  const { result } = await renderHook(() => useLoginEntry());
  await act(() => result.current('/question-bank/listening', '登录后进入题库学习'));
  expect(mockRemember).toHaveBeenCalledWith('/question-bank/listening');
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/auth/[slug]', params: { slug: 'login', next: '/question-bank/listening', returnTo: '/', reason: '登录后进入题库学习' } });
  expect(mockRemember.mock.invocationCallOrder[0]).toBeLessThan(mockPush.mock.invocationCallOrder[0]);
});

it('returns a cancelled discovery login to discovery', async () => {
  mockPathname = '/discover';
  const { result } = await renderHook(() => useLoginEntry());
  await act(() => result.current('/content/radio'));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/auth/[slug]', params: { slug: 'login', next: '/content/radio', returnTo: '/discover' } });
});

it('takes authenticated users directly to the same feature', async () => {
  mockCanAccess = true;
  const { result } = await renderHook(() => useLoginEntry());
  await act(() => result.current('/content/radio'));
  expect(mockPush).toHaveBeenCalledWith('/content/radio');
  expect(mockRemember).not.toHaveBeenCalled();
});


it.each([
  { restoring: true },
  { accountRestoreUnavailable: true },
  { accountDeletionPending: true },
  { session: { user: { id: 'existing' } }, accountReady: true },
])('uses the protected account gate instead of a new login form for %j', async (state) => {
  mockAccountState = state;
  const { result } = await renderHook(() => useLoginEntry());
  await act(() => result.current('/question-bank/listening'));
  expect(mockRemember).toHaveBeenCalledWith('/question-bank/listening');
  expect(mockPush).toHaveBeenCalledWith('/question-bank/listening');
});
