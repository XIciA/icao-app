import { useContext } from 'react';
import { act, render, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import { WebEntitlementProvider } from '../WebEntitlementProvider';
import { CommerceRuntimeContext } from '../commerce-runtime-context.native';
import { getCommerceEntitlementSnapshot, resetCommerceEntitlementEventsForTests } from '../commerce-entitlement-events';
import type { CommerceRuntimeValue } from '../commerce-runtime-types';

let mockAccountId: string | undefined = 'account-a';
const mockApi = jest.fn();
jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ accountReady: true,
  account: mockAccountId ? { accountId: mockAccountId } : undefined, session: { accessToken: `token:${mockAccountId}` },
}) }));
jest.mock('@/platform/api-client', () => ({ apiRequest: (...args: unknown[]) => mockApi(...args) }));
jest.mock('@/features/question-bank/data/member-content-cache', () => ({ activateQuestionBankContentAccount: jest.fn(async () => undefined) }));
jest.mock('../commerce-environment.native', () => ({ activateNativeCommerceEnvironment: jest.fn(async () => undefined), deactivateNativeCommerceEnvironment: jest.fn() }));
jest.mock('../membership-expiry.native', () => ({ scheduleMembershipExpiry: jest.fn(() => jest.fn()) }));
let current: CommerceRuntimeValue;
function Probe() { current = useContext(CommerceRuntimeContext)!; return <Text>{current.phase}</Text>; }
function App() { return <WebEntitlementProvider><Probe /></WebEntitlementProvider>; }
const response = (active: boolean) => ({ production: { environment: 'production', serverTime: '2026-09-18T00:00:00Z',
  membership: { active, expiresAt: active ? '2030-01-01T00:00:00Z' : null }, aiPoints: { available: 10, nextGrantAt: null } } });
beforeEach(() => {
  jest.clearAllMocks(); resetCommerceEntitlementEventsForTests(); mockAccountId = 'account-a'; mockApi.mockResolvedValue(response(true));
  window.addEventListener = jest.fn(); window.removeEventListener = jest.fn();
});

it('reads production membership while exposing no browser checkout', async () => {
  await render(<App />);
  await waitFor(() => expect(current.phase).toBe('ready'));
  expect(current.entitlement?.membership.active).toBe(true);
  expect(current.supported).toBe(false);
  expect(current.offerings).toEqual([]);
  expect((await current.purchase('membership_7d_v1')).ok).toBe(false);
  expect(mockApi).toHaveBeenCalledTimes(1);
  expect(mockApi).toHaveBeenCalledWith('/v1/commerce/entitlements/current');
});

it('does not publish a delayed response belonging to the previous account', async () => {
  let resolve!: (value: ReturnType<typeof response>) => void;
  mockApi.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
  const view = await render(<App />);
  await waitFor(() => expect(mockApi).toHaveBeenCalledTimes(1));
  mockAccountId = 'account-b'; mockApi.mockResolvedValue(response(false));
  await view.rerender(<App />);
  await waitFor(() => expect(current.phase).toBe('ready'));
  await act(async () => resolve(response(true)));
  expect(current.entitlement?.membership.active).toBe(false);
  expect(getCommerceEntitlementSnapshot()?.accountId).toBe('account-b');
  expect(getCommerceEntitlementSnapshot()?.snapshot?.membership.active).toBe(false);
});

it('shows a recoverable network error without replacing an existing member with a false nonmember', async () => {
  await render(<App />); await waitFor(() => expect(current.phase).toBe('ready'));
  mockApi.mockRejectedValueOnce(new Error('offline'));
  await act(async () => current.refresh());
  expect(current.phase).toBe('error'); expect(current.message).toContain('网络');
  expect(current.entitlement?.membership.active).toBe(true);
  mockApi.mockResolvedValue(response(false));
  await act(async () => current.refresh());
  expect(current.phase).toBe('ready'); expect(current.message).toBeUndefined();
  expect(current.entitlement?.membership.active).toBe(false);
});

it('clears membership immediately after logout', async () => {
  const view = await render(<App />); await waitFor(() => expect(current.phase).toBe('ready'));
  mockAccountId = undefined; await view.rerender(<App />);
  expect(current.entitlement).toBeUndefined(); expect(current.phase).toBe('unavailable');
  expect(getCommerceEntitlementSnapshot()?.snapshot).toBeUndefined();
});
