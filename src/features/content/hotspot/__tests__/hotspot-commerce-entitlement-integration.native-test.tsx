import { act, renderHook, waitFor } from '@testing-library/react-native';

import {
  beginCommerceEntitlementGeneration,
  getCommerceEntitlementSnapshot,
  publishCommerceEntitlementChange,
  resetCommerceEntitlementEventsForTests,
} from '@/features/native-commercial-testflight/commerce-entitlement-events';
import type { CommerceEntitlementChangeReason } from '@/features/native-commercial-testflight/commerce-runtime-types';

import { loadHotspotAccess } from '../access-loader.native';
import type { HotspotAccessResult } from '../access-state.native';
import { loadHotspotBriefs } from '../repository';
import { useHotspotAccess } from '../use-hotspot-access.native';

jest.mock('../access-loader.native', () => ({ loadHotspotAccess: jest.fn() }));

const ACCOUNT_ID = '00000000-0000-4000-8000-000000000001';
const mockLoadHotspotAccess = jest.mocked(loadHotspotAccess);
const brief = loadHotspotBriefs()[0];
const ready = {
  status: 'ready',
  brief,
  topics: [],
  session: {},
} as unknown as HotspotAccessResult;

function entitlement(active: boolean) {
  return {
    environment: 'production' as const,
    serverTime: '2026-09-01T00:00:00.000Z',
    membership: {
      active,
      expiresAt: active ? '2026-10-01T00:00:00.000Z' : null,
    },
    aiPoints: { available: 0, nextGrantAt: null },
  };
}

function activate(active: boolean) {
  const owner = beginCommerceEntitlementGeneration(ACCOUNT_ID);
  publishCommerceEntitlementChange({
    accountId: ACCOUNT_ID,
    environment: 'production',
    generation: owner.generation,
    reason: 'startup-reconciliation',
    snapshot: entitlement(active),
  });
  return owner.generation;
}

function publish(generation: number, active: boolean, reason: CommerceEntitlementChangeReason) {
  publishCommerceEntitlementChange({
    accountId: ACCOUNT_ID,
    environment: 'production',
    generation,
    reason,
    snapshot: entitlement(active),
  });
}

describe('hotspot entitlement integration', () => {
  beforeEach(() => {
    resetCommerceEntitlementEventsForTests();
    jest.clearAllMocks();
    mockLoadHotspotAccess.mockImplementation(async () => (
      getCommerceEntitlementSnapshot()?.snapshot?.membership.active
        ? ready
        : { status: 'membership-required', brief }
    ));
  });

  it.each(['purchase', 'restore'] as const)(
    'reloads locked hotspot access to ready after a real %s entitlement publication',
    async (reason) => {
      const generation = activate(false);
      const hook = await renderHook(() => useHotspotAccess(brief.id));
      await waitFor(() => expect(hook.result.current.state.status).toBe('membership-required'));

      await act(async () => { publish(generation, true, reason); });

      await waitFor(() => expect(hook.result.current.state.status).toBe('ready'));
      expect(mockLoadHotspotAccess).toHaveBeenCalledTimes(2);
      await hook.unmount();
    },
  );

  it('relocks ready hotspot access after a same-environment refund/manual refresh', async () => {
    const generation = activate(true);
    const hook = await renderHook(() => useHotspotAccess(brief.id));
    await waitFor(() => expect(hook.result.current.state.status).toBe('ready'));

    await act(async () => { publish(generation, false, 'manual-refresh'); });

    await waitFor(() => expect(hook.result.current.state.status).toBe('membership-required'));
    expect(mockLoadHotspotAccess).toHaveBeenCalledTimes(2);
    await hook.unmount();
  });
});
