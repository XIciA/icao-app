import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { AiAllowanceCard, allowanceCopy } from '../AiAllowanceCard.native';
import type { AiAllowanceResponse, AiAllowanceSummary } from '@icao/contracts/commerce-rules';
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);

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

it('explains repeat-registration eligibility without presenting a network failure or a fake balance', async () => {
  const value = response(0, 'unavailable');
  value.allowance.reason = 'trial_already_claimed';
  mockApiRequest.mockResolvedValue(value);
  const screen = await render(<AiAllowanceCard />);
  await waitFor(() => expect(screen.getByText('体验额度已领取')).toBeTruthy());
  expect(screen.getByText('注销后重新注册不再赠送')).toBeTruthy();
  expect(screen.queryByText('暂时无法读取')).toBeNull();
  expect(screen.queryByRole('progressbar')).toBeNull();
});

it('does not invent prior eligibility for an unavailable response, or hide active membership', () => {
  expect(allowanceCopy(response(0, 'unavailable').allowance).value).toBe('暂时无法读取');
  expect(allowanceCopy({ ...response(80, 'weekly').allowance, reason: 'trial_already_claimed' }).value).toBe('剩余 80%');
});

it.each(['unavailable', 'expired'] as const)('shows positive gifts before %s or a prior trial claim without duplicate copy', async (mode) => {
  const value = response(0, mode);
  value.allowance.reason = 'trial_already_claimed';
  value.allowance.bonus = { available: 50, expiresAt: '2026-09-15T10:00:00Z' };
  mockApiRequest.mockResolvedValue(value);
  const screen = await render(<AiAllowanceCard />);
  await waitFor(() => expect(screen.getByText('赠送额度可用')).toBeTruthy());
  expect(screen.getAllByText(/^最早到期：/u)).toHaveLength(1);
  expect(screen.queryByText(/^额外赠送额度可用/u)).toBeNull();
  expect(screen.queryByText('体验额度已领取')).toBeNull();
  expect(screen.queryByText('会员已到期')).toBeNull();
  expect(screen.queryByText('暂时无法读取')).toBeNull();
  expect(screen.queryByRole('progressbar')).toBeNull();
});

it.each(['weekly', 'trial'] as const)('retains %s percentage and a single separate bonus explanation', async (mode) => {
  const value = response(20, mode);
  value.allowance.bonus = { available: 50, expiresAt: null };
  mockApiRequest.mockResolvedValue(value);
  const screen = await render(<AiAllowanceCard />);
  await waitFor(() => expect(screen.getByText(mode === 'weekly' ? '剩余 20%' : '20%')).toBeTruthy());
  expect(screen.getByRole('progressbar')).toBeTruthy();
  expect(screen.getAllByText('额外赠送额度可用')).toHaveLength(1);
  expect(screen.queryByText('赠送额度可用')).toBeNull();
});

it('does not let an exhausted gift obscure the original trial eligibility reason', () => {
  expect(allowanceCopy({ ...response(0, 'unavailable').allowance,
    reason: 'trial_already_claimed', bonus: { available: 0, expiresAt: null } }).value).toBe('体验额度已领取');
});

it('keeps the profile allowance in one row and shows reset time only in details', async () => {
  const weekly = response(68, 'weekly'); weekly.allowance.resetAt = '2026-10-26T00:00:00Z';
  mockApiRequest.mockResolvedValue(weekly);
  const screen = await render(<AiAllowanceCard compact />);
  await waitFor(() => expect(screen.getByText('剩余 68%')).toBeTruthy());
  expect(screen.queryByRole('progressbar')).toBeNull();
  expect(screen.queryByText(/重置时间/)).toBeNull();
  await fireEvent.press(screen.getByLabelText('本周 AI 额度'));
  expect(screen.getByText(/重置时间/)).toBeTruthy();
});
