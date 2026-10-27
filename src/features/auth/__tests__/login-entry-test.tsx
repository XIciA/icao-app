import { act, renderHook } from '@testing-library/react-native';
import { useLoginEntry } from '../use-login-entry';

let mockIncomingUrl: string | null = null;
jest.mock('expo-linking', () => ({ useURL: () => mockIncomingUrl }));
const mockPush = jest.fn();
const mockRemember = jest.fn();
let mockCanAccess = false;
let mockPathname = '/';
let mockAccountState: Record<string, unknown> = {};
jest.mock('@/components/navigation/useAppRouter', () => ({ useAppRouter: () => ({ push: mockPush }) }));
jest.mock('expo-router', () => ({ usePathname: () => mockPathname }));
jest.mock('../AuthProvider', () => ({ useAuth: () => ({ canAccessApp: mockCanAccess, rememberPendingPath: mockRemember, ...mockAccountState }) }));

beforeEach(() => { jest.clearAllMocks(); mockIncomingUrl = null; mockCanAccess = false; mockPathname = '/'; mockAccountState = {}; });

it('remembers the selected question bank before opening login from the catalogue', async () => {
  const { result } = await renderHook(() => useLoginEntry());
  await act(() => result.current('/question-bank/listening', '登录后进入题库学习'));
  expect(mockRemember).toHaveBeenCalledWith('/question-bank/listening');
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/auth/[slug]', params: { slug: 'login', next: '/question-bank/listening', returnTo: '/' } });
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

it('retains an incoming public study link through the login entry', async () => {
  mockPathname = '/question-bank/listening/study/cat/topic';
  mockIncomingUrl = 'readyoufife://question-bank/listening/study/cat/topic?cardId=2';
  const { result } = await renderHook(() => useLoginEntry());
  await act(() => result.current(`${mockPathname}?cardId=2`));
  expect(mockPush).toHaveBeenCalledWith(expect.objectContaining({ params: expect.objectContaining({ intent: 'external', next: `${mockPathname}?cardId=2` }) }));
});
