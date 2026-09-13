import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { SafeAreaProvider } from 'react-native-safe-area-context';

import { MembershipPage } from '../MembershipPage.native';

const mockBack = jest.fn();
const mockPurchase = jest.fn();
const mockRefresh = jest.fn();
const mockRestore = jest.fn();
let mockParams: { from?: string } = {};
let mockCommerce: ReturnType<typeof runtimeValue>;
function runtimeValue(overrides: Record<string, unknown> = {}) {
  return {
    supported: true, phase: 'ready',
    offerings: [7, 31, 93].map((days) => ({ productKey: `membership_${days}d_v1`, displayName: `${days}天会员`, durationDays: days,
      recommended: false, localizedPrice: `HK$${days}.00`, currencyCode: 'HKD' })),
    entitlement: { environment: 'sandbox', membership: { active: false, expiresAt: null }, aiPoints: { available: 999 } },
    purchase: mockPurchase, refresh: mockRefresh, restorePurchases: mockRestore, ...overrides,
  };
}
jest.mock('expo-router', () => ({ useLocalSearchParams: () => mockParams,
  useRouter: () => ({ back: mockBack, canGoBack: () => true, replace: jest.fn() }) }));
jest.mock('../CommerceRuntimeProvider', () => ({ useCommerceRuntime: () => mockCommerce }));

function Page() { return <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, bottom: 34, left: 0, right: 0 } }}><MembershipPage /></SafeAreaProvider>; }

describe('Native membership purchase page', () => {
  beforeEach(() => {
    jest.clearAllMocks(); mockParams = {};
    mockPurchase.mockResolvedValue({ ok: true }); mockRefresh.mockResolvedValue(undefined); mockRestore.mockResolvedValue({ ok: true });
    mockCommerce = runtimeValue();
  });

  it('shows seven read-only benefits, three equal choices and one button with the selected StoreKit price', async () => {
    const screen = await render(<Page />);
    for (const title of ['解锁会员题库', '每周 AI 学习额度', '单词学习', '随身听', '模拟考试', 'OPI 热点', '资源分享']) expect(screen.getByText(title)).toBeTruthy();
    expect(screen.getByText('会员权益')).toBeTruthy();
    expect(screen.queryByText('权益相同，仅时长不同')).toBeNull();
    expect(screen.queryByText(/到期不自动续费/u)).toBeNull();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(screen.getByRole('radio', { name: '31天会员' }).props.accessibilityState.selected).toBe(true);
    expect(screen.queryByText('推荐')).toBeNull();
    expect(screen.queryByText('可用 AI 点数')).toBeNull();
    expect(screen.queryByText('刷新会员与点数')).toBeNull();
    expect(screen.getByText('开通31天会员 · HK$31.00')).toBeTruthy();
    await fireEvent.press(screen.getByRole('radio', { name: '93天会员' }));
    expect(mockPurchase).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('membership-purchase'));
    expect(mockPurchase).toHaveBeenCalledWith('membership_93d_v1');
  });

  it('keeps purchase terms and Apple restore accessible without a normal manual refresh button', async () => {
    const screen = await render(<Page />);
    await fireEvent.press(screen.getByText('恢复购买'));
    expect(mockRestore).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByText('购买须知'));
    expect(screen.getByText(/有效期内续费将顺延会员时间/u)).toBeTruthy();
    expect(screen.getAllByText(/到期不自动续费/u)).toHaveLength(1);
    expect(screen.queryByText(/权益相同/u)).toBeNull();
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it.each(['purchasing', 'restoring', 'loading', 'reconciling', 'pending'])('blocks another purchase while %s', async (phase) => {
    mockCommerce = runtimeValue({ phase });
    const screen = await render(<Page />);
    await fireEvent.press(screen.getByTestId('membership-purchase'));
    expect(mockPurchase).not.toHaveBeenCalled();
    if (phase === 'pending') {
      await fireEvent.press(screen.getByText('恢复购买'));
      expect(mockRestore).toHaveBeenCalledTimes(1);
    }
  });

  it('offers pending-result recheck without enabling another purchase', async () => {
    mockCommerce = runtimeValue({ phase: 'pending', error: { retryable: false, userMessage: '购买结果确认中，权益到账后会自动更新，你可以继续使用。' } });
    const screen = await render(<Page />);
    expect(screen.getByText(/你可以继续使用/u)).toBeTruthy();
    await fireEvent.press(screen.getByText('检查购买结果'));
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByTestId('membership-purchase'));
    expect(mockPurchase).not.toHaveBeenCalled();
  });

  it('offers a retry only after a retryable failure and never invents a price', async () => {
    mockCommerce = runtimeValue({ phase: 'error', offerings: [], error: { retryable: true, userMessage: '商品暂时无法读取' } });
    const screen = await render(<Page />);
    expect(screen.getAllByText('—')).toHaveLength(3);
    await fireEvent.press(screen.getByTestId('membership-purchase'));
    expect(mockPurchase).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('重新检查'));
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it('shows renewal dates in the same page and does not return a My-page visitor automatically', async () => {
    mockCommerce = runtimeValue({ entitlement: { membership: { active: true, expiresAt: '2027-01-01T00:00:00Z' } } });
    const screen = await render(<Page />);
    expect(screen.getByText('会员续费')).toBeTruthy();
    expect(screen.getByText('会员权益')).toBeTruthy();
    expect(screen.queryByText(/权益相同|到期不自动续费/u)).toBeNull();
    expect(screen.getByText(/续费后预计至/u)).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('returns to the requesting learning page after the shared entitlement becomes active', async () => {
    mockParams = { from: 'learning' };
    const screen = await render(<Page />);
    expect(mockBack).not.toHaveBeenCalled();
    mockCommerce = runtimeValue({ entitlement: { membership: { active: true, expiresAt: '2027-01-01T00:00:00Z' } } });
    await screen.rerender(<Page />);
    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
  });
});
