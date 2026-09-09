import { act, render, waitFor } from '@testing-library/react-native';
import { AiAllowanceCard, allowanceCopy } from '../AiAllowanceCard.native';
import type { AiAllowanceResponse, AiAllowanceSummary } from '@icao/contracts/commerce-rules';

let mockAccountId = 'account-a';
let mockEnvironment = { accountId: 'account-a', environment: 'production', status: 'active', generation: 1 };
const mockApiRequest = jest.fn();
const mockListeners = new Set<() => void>();
jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => (() => void) | undefined) => jest.requireActual('react').useEffect(effect, [effect]),
}));
jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ accountReady: true, account: { accountId: mockAccountId } }) }));
jest.mock('@/platform/api-client', () => ({ apiRequest: (...args: unknown[]) => mockApiRequest(...args) }));
jest.mock('@/features/native-commercial-testflight/commerce-environment.native', () => ({
  getNativeCommerceEnvironmentState: () => mockEnvironment,
  subscribeNativeCommerceEnvironment: (listener: () => void) => { mockListeners.add(listener); return () => mockListeners.delete(listener); },
}));
jest.mock('@/features/native-commercial-testflight/commerce-entitlement-events', () => ({
  subscribeCommerceEntitlementChanges: () => () => undefined,
}));

function response(remainingPercent: number, mode: AiAllowanceSummary['mode'] = 'trial'): AiAllowanceResponse {
  return { environment: 'production', serverTime: '2026-09-10T10:00:00Z', allowance: {
    mode, remainingPercent, membershipExpiresAt: null, resetAt: null, ruleVersion: 'one',
  } };
}
beforeEach(() => {
  mockAccountId = 'account-a';
  mockEnvironment = { accountId: 'account-a', environment: 'production', status: 'active', generation: 1 };
  mockApiRequest.mockReset();
});

it('never shows the previous account allowance while the next owner loads, including late responses', async () => {
  let resolveOld!: (value: AiAllowanceResponse) => void;
  let resolveNew!: (value: AiAllowanceResponse) => void;
  mockApiRequest.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }))
    .mockImplementationOnce(() => new Promise((resolve) => { resolveNew = resolve; }));
  const screen = await render(<AiAllowanceCard />);
  expect(screen.queryByRole('progressbar')).toBeNull();
  mockAccountId = 'account-b';
  mockEnvironment = { ...mockEnvironment, accountId: mockAccountId, generation: 2 };
  await screen.rerender(<AiAllowanceCard />);
  await act(async () => { resolveOld(response(84)); });
  expect(screen.queryByText('84%')).toBeNull();
  await act(async () => { resolveNew(response(20)); });
  expect(screen.getByText('20%')).toBeTruthy();
  expect(screen.queryByRole('button')).toBeNull();
});

it('shows unavailable on failure, without fabricating a balance or manual refresh button', async () => {
  mockApiRequest.mockRejectedValue(new Error('offline'));
  const screen = await render(<AiAllowanceCard />);
  await waitFor(() => expect(screen.getByText('暂时无法读取')).toBeTruthy());
  expect(screen.queryByRole('progressbar')).toBeNull();
  expect(screen.queryByRole('button')).toBeNull();
});

it('keeps a positive sub-one-percent amount visible and ends a partial week at membership expiry', () => {
  expect(allowanceCopy(response(0.4).allowance).value).toBe('不足1%');
  const value = { ...response(10, 'weekly').allowance, resetAt: '2026-09-17T10:00:00Z', membershipExpiresAt: '2026-09-12T10:00:00Z' };
  expect(allowanceCopy(value).detail).toMatch(/^会员到期：9月12日/u);
  expect(allowanceCopy({ ...value, mode: 'expired' }).value).toBe('会员已到期');
  expect(allowanceCopy({ ...value, mode: 'expired' }).detail).toBe('');
});
