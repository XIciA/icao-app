import { useContext } from 'react';
import { act, render, waitFor } from '@testing-library/react-native';
import { AppState, Text, type AppStateStatus } from 'react-native';
import type { CommerceEntitlementSummary } from '@icao/contracts';
import type { WechatCheckout, WechatPayCatalog } from '@icao/contracts/wechat-pay';
import { AndroidCommerceRuntimeProvider } from '../android-commerce-runtime.android';
import { CommerceRuntimeContext } from '../commerce-runtime-context.native';
import { resetCommerceEntitlementEventsForTests, getCommerceEntitlementSnapshot } from '../commerce-entitlement-events';
import type { CommerceRuntimeValue } from '../commerce-runtime-types';

let mockAccountId = '10000000-0000-4000-8000-000000000001';
let mockAppStateHandler: ((state: AppStateStatus) => void) | undefined;
const mockCatalog = jest.fn();
const mockCreate = jest.fn();
const mockPending = jest.fn();
const mockQuery = jest.fn();
const mockCancel = jest.fn();
const mockLaunch = jest.fn();
const mockApi = jest.fn();
const mockWechatStatus = jest.fn();
const mockGetSession = jest.fn();
jest.mock('@/features/auth/auth-service', () => ({ getAuthService: () => ({ getSession: () => mockGetSession() }) }));
jest.mock('@/features/auth/wechat-native-auth', () => ({ getWechatNativeStatus: () => mockWechatStatus() }));
jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({
  accountReady: true, account: { accountId: mockAccountId }, session: { accessToken: `token:${mockAccountId}`, user: { id: `auth:${mockAccountId}` } },
}) }));
jest.mock('@/platform/api-client', () => ({ apiRequestWithAccessToken: (...args: unknown[]) => mockApi(...args) }));
jest.mock('@/features/question-bank/data/member-content-cache', () => ({ activateQuestionBankContentAccount: jest.fn(async () => undefined) }));
jest.mock('../commerce-environment', () => ({ activateNativeCommerceEnvironment: jest.fn(async () => undefined), deactivateNativeCommerceEnvironment: jest.fn() }));
jest.mock('../membership-expiry.native', () => ({ scheduleMembershipExpiry: jest.fn(() => jest.fn()) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => '90000000-0000-4000-8000-000000000001' }));
jest.mock('../wechat-pay-client.android', () => ({
  getWechatPayCatalog: (...args: unknown[]) => mockCatalog(...args),
  createWechatCheckout: (...args: unknown[]) => mockCreate(...args),
  getPendingWechatCheckout: (...args: unknown[]) => mockPending(...args),
  getWechatCheckout: (...args: unknown[]) => mockQuery(...args),
  cancelWechatCheckout: (...args: unknown[]) => mockCancel(...args),
  launchWechatCheckout: (...args: unknown[]) => mockLaunch(...args),
}));

const catalog: WechatPayCatalog = { available: true, products: [7, 31, 93].map((days) => ({
  productKey: `membership_${days}d_v1`, durationDays: days, amountFen: days * 100, title: `${days}天会员`, currency: 'CNY',
})) };
const checkout: WechatCheckout = {
  id: '80000000-0000-4000-8000-000000000001', productKey: 'membership_7d_v1', amountFen: 700, currency: 'CNY', state: 'pending',
  expiresAt: '2030-01-01T00:00:00Z', payment: { appId: 'wx-app', partnerId: 'merchant', prepayId: 'prepay',
    packageValue: 'Sign=WXPay', nonceStr: 'nonce', timeStamp: '1', sign: 'server-signature' },
};
function entitlement(active = false): CommerceEntitlementSummary {
  return { environment: 'production', serverTime: '2026-09-01T00:00:00Z', membership: { active, expiresAt: active ? '2030-01-01T00:00:00Z' : null },
    aiPoints: { available: 0, nextGrantAt: null } };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
let current: CommerceRuntimeValue;
function Probe() {
  current = useContext(CommerceRuntimeContext)!;
  return <Text testID="phase">{current.phase}</Text>;
}
function App() { return <AndroidCommerceRuntimeProvider><Probe /></AndroidCommerceRuntimeProvider>; }

beforeEach(() => {
  jest.clearAllMocks();
  resetCommerceEntitlementEventsForTests();
  mockAccountId = '10000000-0000-4000-8000-000000000001';
  mockAppStateHandler = undefined;
  jest.mocked(AppState.addEventListener).mockImplementation((type, listener) => {
    if (type === 'change') mockAppStateHandler = listener;
    return { remove: jest.fn() };
  });
  mockGetSession.mockImplementation(async () => ({ accessToken: `token:${mockAccountId}`, user: { id: `auth:${mockAccountId}` } }));
  mockCatalog.mockResolvedValue(catalog);
  mockWechatStatus.mockReturnValue({ configured: true, installed: true, supported: true });
  mockPending.mockResolvedValue(null);
  mockCreate.mockResolvedValue(checkout);
  mockQuery.mockResolvedValue(checkout);
  mockCancel.mockResolvedValue({ ...checkout, state: 'closed' });
  mockLaunch.mockResolvedValue({ state: 'returned' });
  mockApi.mockResolvedValue({ production: entitlement() });
});

it('grants membership only after the server verifies payment, not when the SDK returns', async () => {
  const returned = deferred<{ state: 'returned' }>();
  const verified = deferred<WechatCheckout>();
  mockLaunch.mockReturnValue(returned.promise);
  mockQuery.mockReturnValue(verified.promise);
  await render(<App />);
  await waitFor(() => expect(current.phase).toBe('ready'));
  let operation!: Promise<unknown>;
  await act(async () => { operation = current.purchase('membership_7d_v1'); });
  await waitFor(() => expect(mockLaunch).toHaveBeenCalledTimes(1));
  expect(current.entitlement?.membership.active).toBe(false);
  await act(async () => { returned.resolve({ state: 'returned' }); });
  expect(current.entitlement?.membership.active).toBe(false);
  await act(async () => { verified.resolve({ ...checkout, state: 'paid', entitlement: entitlement(true) }); await operation; });
  expect(current.entitlement?.membership.active).toBe(true);
  expect(getCommerceEntitlementSnapshot()?.snapshot?.membership.active).toBe(true);
  expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ productKey: 'membership_7d_v1', idempotencyKey: expect.any(String) }), `token:${mockAccountId}`);
});

it('recovers an existing order on startup and reconciles it on foreground without creating or launching another payment', async () => {
  mockPending.mockResolvedValue(checkout);
  await render(<App />);
  await waitFor(() => expect(current.phase).toBe('pending'));
  expect(current.canCancelPendingPurchase).toBe(true);
  mockQuery.mockResolvedValue({ ...checkout, state: 'paid', entitlement: entitlement(true) });
  mockApi.mockResolvedValue({ production: entitlement(true) });
  await act(async () => { mockAppStateHandler?.('active'); });
  await waitFor(() => expect(current.phase).toBe('ready'));
  expect(current.entitlement?.membership.active).toBe(true);
  expect(mockCreate).not.toHaveBeenCalled();
  expect(mockLaunch).not.toHaveBeenCalled();
});

it('verifies immediately on foreground even when WeChat does not deliver its callback', async () => {
  mockLaunch.mockImplementation((_checkout: WechatCheckout, signal: AbortSignal) => new Promise((resolve) => {
    signal.addEventListener('abort', () => resolve({ state: 'unknown' }), { once: true });
  }));
  mockQuery.mockResolvedValue({ ...checkout, state: 'paid', entitlement: entitlement(true) });
  await render(<App />);
  await waitFor(() => expect(current.phase).toBe('ready'));
  let operation!: Promise<unknown>;
  await act(async () => { operation = current.purchase('membership_7d_v1'); });
  await waitFor(() => expect(mockLaunch).toHaveBeenCalledTimes(1));
  await act(async () => { mockAppStateHandler?.('active'); await operation; });
  expect(current.entitlement?.membership.active).toBe(true);
  expect(mockQuery).toHaveBeenCalledWith(checkout.id, `token:${mockAccountId}`);
});

it('ignores a previous account payment return after an account switch', async () => {
  const returned = deferred<{ state: 'returned' }>();
  mockLaunch.mockReturnValue(returned.promise);
  const screen = await render(<App />);
  await waitFor(() => expect(current.phase).toBe('ready'));
  let operation!: Promise<unknown>;
  await act(async () => { operation = current.purchase('membership_7d_v1'); });
  await waitFor(() => expect(mockLaunch).toHaveBeenCalledTimes(1));
  mockAccountId = '10000000-0000-4000-8000-000000000002';
  await screen.rerender(<App />);
  await waitFor(() => expect(current.phase).toBe('ready'));
  await act(async () => { returned.resolve({ state: 'returned' }); await operation; });
  expect(mockQuery).not.toHaveBeenCalled();
  expect(getCommerceEntitlementSnapshot()?.accountId).toBe(mockAccountId);
  expect(current.entitlement?.membership.active).toBe(false);
});

it('offers cancellation for an unpaid order and keeps the original token fixed', async () => {
  mockPending.mockResolvedValue(checkout);
  await render(<App />);
  await waitFor(() => expect(current.phase).toBe('pending'));
  await act(async () => { await current.cancelPendingPurchase!(); });
  expect(mockCancel).toHaveBeenCalledWith(checkout.id, `token:${mockAccountId}`);
  expect(current.canCancelPendingPurchase).toBe(false);
  expect(current.phase).toBe('ready');
  expect(current.entitlement?.membership.active).toBe(false);
});

it('leaves purchase unavailable when the merchant configuration is absent', async () => {
  mockCatalog.mockResolvedValue({ available: false, products: [] });
  await render(<App />);
  await waitFor(() => expect(current.phase).toBe('unavailable'));
  await act(async () => { await current.purchase('membership_7d_v1'); });
  expect(current.offerings).toEqual([]);
  expect(mockCreate).not.toHaveBeenCalled();
  expect(mockLaunch).not.toHaveBeenCalled();
});

it('does not create an order when WeChat has been uninstalled', async () => {
  await render(<App />);
  await waitFor(() => expect(current.phase).toBe('ready'));
  mockWechatStatus.mockReturnValue({ configured: true, installed: false, supported: true });
  await act(async () => { expect(await current.purchase('membership_7d_v1')).toEqual({ ok: false, message: '请先安装微信，再使用微信支付。' }); });
  expect(mockCreate).not.toHaveBeenCalled();
  expect(current.phase).toBe('ready');
});

it('closes a cancelled SDK payment through the server and allows purchasing again', async () => {
  mockLaunch.mockResolvedValue({ state: 'cancelled' });
  await render(<App />);
  await waitFor(() => expect(current.phase).toBe('ready'));
  await act(async () => { await current.purchase('membership_7d_v1'); });
  expect(mockCancel).toHaveBeenCalledWith(checkout.id, `token:${mockAccountId}`);
  expect(current.phase).toBe('ready');
  expect(current.canCancelPendingPurchase).toBe(false);
  expect(current.entitlement?.membership.active).toBe(false);
});

it('grants a server-confirmed payment even when the SDK reports cancellation', async () => {
  mockLaunch.mockResolvedValue({ state: 'cancelled' });
  mockCancel.mockResolvedValue({ ...checkout, state: 'paid', entitlement: entitlement(true) });
  await render(<App />);
  await waitFor(() => expect(current.phase).toBe('ready'));
  await act(async () => { expect((await current.purchase('membership_7d_v1')).ok).toBe(true); });
  expect(current.entitlement?.membership.active).toBe(true);
});

it('keeps existing membership usable when a pending WeChat order cannot be queried', async () => {
  mockPending.mockResolvedValue(checkout);
  mockQuery.mockRejectedValue(new Error('provider temporarily unavailable'));
  mockApi.mockResolvedValue({ production: entitlement(true) });
  await render(<App />);
  await waitFor(() => expect(current.phase).toBe('error'));
  expect(current.entitlement?.membership.active).toBe(true);
});

it('refreshes an expired session for the captured auth user before checkout writes', async () => {
  await render(<App />);
  await waitFor(() => expect(current.phase).toBe('ready'));
  mockGetSession.mockResolvedValue({ accessToken: 'refreshed-token', user: { id: `auth:${mockAccountId}` } });
  await act(async () => { await current.purchase('membership_7d_v1'); });
  expect(mockPending).toHaveBeenLastCalledWith('refreshed-token');
  expect(mockCreate).toHaveBeenCalledWith(expect.anything(), 'refreshed-token');
  expect(mockQuery).toHaveBeenCalledWith(checkout.id, 'refreshed-token');
});

it('obtains a fresh same-user token after a long WeChat payment flow', async () => {
  await render(<App />);
  await waitFor(() => expect(current.phase).toBe('ready'));
  mockLaunch.mockImplementation(async () => {
    mockGetSession.mockResolvedValue({ accessToken: 'after-wechat-token', user: { id: `auth:${mockAccountId}` } });
    return { state: 'returned' };
  });
  await act(async () => { await current.purchase('membership_7d_v1'); });
  expect(mockCreate).toHaveBeenCalledWith(expect.anything(), `token:${mockAccountId}`);
  expect(mockQuery).toHaveBeenCalledWith(checkout.id, 'after-wechat-token');
});

it('does not create a checkout if persisted session now belongs to another auth user', async () => {
  await render(<App />);
  await waitFor(() => expect(current.phase).toBe('ready'));
  mockGetSession.mockResolvedValue({ accessToken: 'other-user-token', user: { id: 'another-auth-user' } });
  mockPending.mockClear();
  await act(async () => { await current.purchase('membership_7d_v1'); });
  expect(mockPending).not.toHaveBeenCalled();
  expect(mockCreate).not.toHaveBeenCalled();
  expect(mockLaunch).not.toHaveBeenCalled();
});

it('ignores a late session refresh when UI has switched to a different account', async () => {
  const session = deferred<{ accessToken: string; user: { id: string } }>();
  const screen = await render(<App />);
  await waitFor(() => expect(current.phase).toBe('ready'));
  const previousAccount = mockAccountId;
  mockGetSession.mockReturnValueOnce(session.promise);
  let operation!: Promise<unknown>;
  await act(async () => { operation = current.purchase('membership_7d_v1'); });
  mockAccountId = '10000000-0000-4000-8000-000000000002';
  await screen.rerender(<App />);
  await waitFor(() => expect(current.phase).toBe('ready'));
  await act(async () => { session.resolve({ accessToken: 'late-old-token', user: { id: `auth:${previousAccount}` } }); await operation; });
  expect(mockCreate).not.toHaveBeenCalled();
  expect(mockLaunch).not.toHaveBeenCalled();
  expect(getCommerceEntitlementSnapshot()?.accountId).toBe(mockAccountId);
});

it('refreshes a same-user expired token before reconciling membership', async () => {
  mockGetSession.mockResolvedValue({ accessToken: 'fresh-startup-token', user: { id: `auth:${mockAccountId}` } });
  await render(<App />);
  await waitFor(() => expect(current.phase).toBe('ready'));
  expect(mockCatalog).toHaveBeenCalledWith('fresh-startup-token');
  expect(mockApi).toHaveBeenCalledWith('/v1/commerce/entitlements/current', 'fresh-startup-token');
});

it('refreshes a same-user expired token before cancelling an unpaid order', async () => {
  mockPending.mockResolvedValue(checkout);
  await render(<App />);
  await waitFor(() => expect(current.phase).toBe('pending'));
  mockGetSession.mockResolvedValue({ accessToken: 'fresh-cancel-token', user: { id: `auth:${mockAccountId}` } });
  await act(async () => { await current.cancelPendingPurchase!(); });
  expect(mockCancel).toHaveBeenCalledWith(checkout.id, 'fresh-cancel-token');
  expect(current.phase).toBe('ready');
});
