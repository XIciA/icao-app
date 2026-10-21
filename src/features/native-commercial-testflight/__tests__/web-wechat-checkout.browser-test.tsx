import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { ApiClientError } from '@/platform/api-client';
import { WebWechatCheckout } from '../WebWechatCheckout.browser';

const mockUuid = jest.fn();
jest.mock('expo-crypto', () => ({ randomUUID: () => mockUuid() }));
let mockAccount = 'account-a';
let mockUser = 'user-a';
const mockApi = jest.fn();
const mockRefresh = jest.fn(async () => undefined);
jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ accountReady: Boolean(mockAccount), account: { accountId: mockAccount }, session: { user: { id: mockUser } } }) }));
jest.mock('@/features/auth/auth-service', () => ({ getAuthService: () => ({ getSession: async () => ({ user: { id: mockUser }, accessToken: `token:${mockUser}` }) }) }));
jest.mock('@/platform/api-client', () => ({ ...jest.requireActual('@/platform/api-client'), apiRequestWithAccessToken: (...args: unknown[]) => mockApi(...args) }));
jest.mock('../CommerceRuntimeProvider', () => ({ useCommerceRuntime: () => ({ refresh: mockRefresh }) }));
jest.mock('@/components/ui', () => {
  const { Text, View, Pressable } = require('react-native');
  return { AppText: ({ children, ...props }: any) => <Text {...props}>{children}</Text>, Card: View,
    Button: ({ children, ...props }: any) => <Pressable accessibilityRole="button" {...props}><Text>{children}</Text></Pressable> };
});
const product = { productKey: 'membership_7d_v1', title: '7天会员', amountFen: 6800, durationDays: 7, currency: 'CNY' };
const checkout = () => ({ id: '80000000-0000-4000-8000-000000000001', channel: 'NATIVE', productKey: product.productKey,
  amountFen: 6800, currency: 'CNY', state: 'pending', expiresAt: new Date(Date.now() + 60_000).toISOString(), codeUrl: 'weixin://wxpay/bizpayurl?pr=fixture' });
let mockPending: ReturnType<typeof checkout> | null;
beforeEach(() => {
  jest.clearAllMocks(); mockUuid.mockReturnValueOnce('80000000-0000-4000-8000-000000000099').mockReturnValue('80000000-0000-4000-8000-000000000100'); mockAccount = 'account-a'; mockUser = 'user-a'; mockPending = null;
  window.addEventListener = jest.fn(); window.removeEventListener = jest.fn();
  mockApi.mockImplementation(async (path: string, _token: string, options?: RequestInit) => {
    if (path.includes('/catalog')) return { available: true, products: [product] };
    if (path.endsWith('/pending')) return mockPending;
    if (options?.method === 'POST' && path.endsWith('/checkouts')) { mockPending = checkout(); return mockPending; }
    if (path.endsWith('/cancel')) { const result = { ...mockPending, state: 'closed', codeUrl: undefined }; mockPending = null; return result; }
    return mockPending;
  });
});

it('never creates an order on page load and pins a Native purchase to the captured user token', async () => {
  const view = await render(<WebWechatCheckout />);
  await waitFor(() => expect(view.getByText('7天会员 · ¥68.00')).toBeTruthy());
  expect(mockApi.mock.calls.every(([, , options]) => !options)).toBe(true);
  await fireEvent.press(view.getByText('7天会员 · ¥68.00'));
  await waitFor(() => expect(view.getByLabelText('微信支付二维码，请使用另一台设备的微信扫一扫')).toBeTruthy());
  const call = mockApi.mock.calls.find(([, , options]) => options?.method === 'POST')!;
  expect(call[1]).toBe('token:user-a');
  expect(JSON.parse(call[2].body)).toEqual({ productKey: product.productKey, channel: 'NATIVE', idempotencyKey: expect.stringMatching(/^[a-f0-9-]{36}$/) });
  expect(mockRefresh).not.toHaveBeenCalled();
});

it('restores a pending QR after reload and refreshes shared entitlements only after server-confirmed payment', async () => {
  mockPending = checkout();
  const view = await render(<WebWechatCheckout />);
  await waitFor(() => expect(view.getByLabelText('微信支付二维码，请使用另一台设备的微信扫一扫')).toBeTruthy());
  mockPending = { ...mockPending, state: 'paid', codeUrl: undefined } as any;
  await fireEvent.press(view.getByText('重新检查订单'));
  await waitFor(() => expect(mockRefresh).toHaveBeenCalledTimes(1));
  expect(view.queryByLabelText('微信支付二维码，请使用另一台设备的微信扫一扫')).toBeNull();
  expect(view.getByText('支付成功，正在同步会员权益。')).toBeTruthy();
});

it('cancels an unpaid order through the server before enabling another purchase', async () => {
  mockPending = checkout(); const view = await render(<WebWechatCheckout />);
  await waitFor(() => expect(view.getByText('取消未支付订单')).toBeTruthy());
  await fireEvent.press(view.getByText('取消未支付订单'));
  await waitFor(() => expect(view.getByText('未支付订单已关闭，可以重新选择套餐。')).toBeTruthy());
  expect(mockApi).toHaveBeenCalledWith(expect.stringContaining('/cancel'), 'token:user-a', { method: 'POST' });
  expect(view.queryByLabelText('微信支付二维码，请使用另一台设备的微信扫一扫')).toBeNull();
});

it('does not expose APP payment credentials as a web QR', async () => {
  mockPending = { ...checkout(), channel: 'APP', codeUrl: undefined } as any;
  const view = await render(<WebWechatCheckout />);
  await waitFor(() => expect(view.getByText('你有一笔 APP 订单，请在 APP 完成付款，或取消后重新下单。')).toBeTruthy());
  expect(view.queryByLabelText('微信支付二维码，请使用另一台设备的微信扫一扫')).toBeNull();
});

it('keeps an uncertain creation key stable and requires reconciliation before retrying', async () => {
  const normal = mockApi.getMockImplementation()!; let input: any; let fail = true;
  mockApi.mockImplementation(async (...args: any[]) => {
    if (args[2]?.method === 'POST' && args[0].endsWith('/checkouts') && fail) {
      fail = false; input = JSON.parse(args[2].body); throw new ApiClientError('network_failure', 503);
    }
    return normal(...args);
  });
  const view = await render(<WebWechatCheckout />);
  await waitFor(() => expect(view.getByText('7天会员 · ¥68.00')).toBeTruthy());
  await fireEvent.press(view.getByText('7天会员 · ¥68.00'));
  await waitFor(() => expect(view.getByText('订单结果尚未确认，请先重新检查；请勿重复付款。')).toBeTruthy());
  await fireEvent.press(view.getByText('重新检查订单'));
  await waitFor(() => expect(view.queryByText('订单结果尚未确认，请先重新检查；请勿重复付款。')).toBeNull());
  await fireEvent.press(view.getByText('7天会员 · ¥68.00'));
  await waitFor(() => expect(view.getByLabelText('微信支付二维码，请使用另一台设备的微信扫一扫')).toBeTruthy());
  const writes = mockApi.mock.calls.filter(([, , options]) => options?.method === 'POST');
  expect(JSON.parse(writes[1]![2].body)).toEqual(input);
  expect(mockUuid).toHaveBeenCalledTimes(1);
});

it('discards a delayed QR from a previous account and does not refresh the new account', async () => {
  let resolve!: (order: ReturnType<typeof checkout>) => void;
  const normal = mockApi.getMockImplementation()!;
  mockApi.mockImplementation((path, token, options) => path.endsWith('/checkouts') && options?.method === 'POST'
    ? new Promise((done) => { resolve = done; }) : normal(path, token, options));
  const view = await render(<WebWechatCheckout />);
  await waitFor(() => expect(view.getByText('7天会员 · ¥68.00')).toBeTruthy());
  await fireEvent.press(view.getByText('7天会员 · ¥68.00'));
  await waitFor(() => expect(resolve).toBeDefined());
  mockAccount = 'account-b'; mockUser = 'user-b'; await view.rerender(<WebWechatCheckout />);
  await act(async () => resolve(checkout()));
  expect(view.queryByLabelText('微信支付二维码，请使用另一台设备的微信扫一扫')).toBeNull();
  expect(mockRefresh).not.toHaveBeenCalled();
});
