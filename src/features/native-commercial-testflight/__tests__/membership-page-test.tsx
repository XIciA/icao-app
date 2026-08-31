/* eslint-disable import/first */
import { act, fireEvent, render } from '@testing-library/react-native';

const mockBack = jest.fn();
const mockPurchase = jest.fn(async () => ({ ok: true, message: '购买成功' }));
const mockRefresh = jest.fn(async () => undefined);
const mockRestore = jest.fn(async () => ({ ok: true, message: '恢复成功' }));
const mockUseCommerceRuntime = jest.fn();

jest.mock('expo-router', () => ({ useRouter: () => ({ back: mockBack }) }));
jest.mock('../CommerceRuntimeProvider', () => ({
  useCommerceRuntime: () => mockUseCommerceRuntime(),
}));

import { MembershipPage } from '../MembershipPage';

describe('<MembershipPage />', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseCommerceRuntime.mockReturnValue({
      supported: true,
      phase: 'ready',
      offerings: [
        {
          productKey: 'membership_7d_v1',
          displayName: '7天会员',
          durationDays: 7,
          recommended: false,
          localizedPrice: '¥18.00',
          currencyCode: 'CNY',
        },
        {
          productKey: 'membership_31d_v1',
          displayName: '31天会员',
          durationDays: 31,
          recommended: true,
          localizedPrice: '¥58.00',
          currencyCode: 'CNY',
        },
      ],
      entitlementEnvironment: 'sandbox',
      entitlement: {
        environment: 'sandbox',
        serverTime: '2026-08-24T08:00:00.000Z',
        membership: { active: true, expiresAt: '2026-09-24T08:00:00.000Z' },
        aiPoints: { available: 100, nextGrantAt: null },
      },
      purchase: mockPurchase,
      refresh: mockRefresh,
      restorePurchases: mockRestore,
    });
  });

  it('uses StoreKit localized prices and states the non-renewing duration rules', async () => {
    const screen = await render(<MembershipPage />);

    expect(screen.getByText('TestFlight 沙盒')).toBeTruthy();
    expect(screen.getByText('¥18.00')).toBeTruthy();
    expect(screen.getByText('¥58.00')).toBeTruthy();
    expect(screen.getByText('购买后增加 31 天使用时间；重复购买会顺延。')).toBeTruthy();
    expect(screen.getByText(/所有档位均为非自动续期商品/u)).toBeTruthy();

    await act(async () => { fireEvent.press(screen.getByText('¥58.00')); });
    expect(mockPurchase).toHaveBeenCalledWith('membership_31d_v1');
  });

  it('exposes refresh and explicit Restore Purchases actions', async () => {
    const screen = await render(<MembershipPage />);

    await act(async () => { fireEvent.press(screen.getByText('刷新会员与点数')); });
    await act(async () => { fireEvent.press(screen.getByText('恢复购买')); });

    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(mockRestore).toHaveBeenCalledTimes(1);
  });

  it('disables every product while a purchase remains unconfirmed', async () => {
    mockUseCommerceRuntime.mockReturnValue({
      ...mockUseCommerceRuntime(),
      phase: 'pending',
      message: '上一笔购买仍在核对。',
    });
    const screen = await render(<MembershipPage />);

    for (const button of screen.getAllByText('等待确认')) fireEvent.press(button);

    expect(mockPurchase).not.toHaveBeenCalled();
    expect(screen.getByText('上一笔购买仍在核对。')).toBeTruthy();
  });

  it.each(['loading', 'reconciling', 'restoring'] as const)(
    'disables purchase, refresh and restore during %s',
    async (phase) => {
      mockUseCommerceRuntime.mockReturnValue({
        ...mockUseCommerceRuntime(),
        phase,
      });
      const screen = await render(<MembershipPage />);

      fireEvent.press(screen.getByText('¥58.00'));
      const refreshLabel = phase === 'reconciling'
        ? '正在核对会员与点数…'
        : '刷新会员与点数';
      fireEvent.press(screen.getByText(refreshLabel));
      fireEvent.press(screen.getByText(phase === 'restoring' ? '正在恢复购买…' : '恢复购买'));

      expect(mockPurchase).not.toHaveBeenCalled();
      expect(mockRefresh).not.toHaveBeenCalled();
      expect(mockRestore).not.toHaveBeenCalled();
    },
  );

  it.each(['pending', 'error'] as const)(
    'keeps safe recovery actions available but purchase disabled during %s',
    async (phase) => {
      mockUseCommerceRuntime.mockReturnValue({
        ...mockUseCommerceRuntime(),
        phase,
      });
      const screen = await render(<MembershipPage />);

      const purchaseLabel = phase === 'pending' ? '等待确认' : '¥58.00';
      fireEvent.press(
        phase === 'pending'
          ? screen.getAllByText(purchaseLabel)[0]
          : screen.getByText(purchaseLabel),
      );
      await act(async () => { fireEvent.press(screen.getByText('刷新会员与点数')); });
      await act(async () => { fireEvent.press(screen.getByText('恢复购买')); });

      expect(mockPurchase).not.toHaveBeenCalled();
      expect(mockRefresh).toHaveBeenCalledTimes(1);
      expect(mockRestore).toHaveBeenCalledTimes(1);
    },
  );

  it('renders the public structured error without exposing internal StoreKit codes', async () => {
    mockUseCommerceRuntime.mockReturnValue({
      ...mockUseCommerceRuntime(),
      phase: 'error',
      offerings: [],
      message: 'internal_should_not_render',
      error: {
        code: 'catalog-invalid',
        operation: 'catalog',
        userMessage: 'App Store 商品信息尚未完全同步，请稍后再查看。',
        retryable: false,
        chargeStatus: 'not-applicable',
      },
    });
    const screen = await render(<MembershipPage />);

    expect(screen.getByText('App Store 商品配置正在同步')).toBeTruthy();
    expect(screen.getByText('App Store 商品信息尚未完全同步，请稍后再查看。')).toBeTruthy();
    expect(screen.queryByText('internal_should_not_render')).toBeNull();
  });
});
