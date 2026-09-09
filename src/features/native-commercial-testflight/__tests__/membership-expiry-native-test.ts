import type { CommerceEntitlementSummary } from '@icao/contracts';

import { scheduleMembershipExpiry } from '../membership-expiry.native';

function membership(days: number): CommerceEntitlementSummary {
  const serverTime = Date.UTC(2026, 8, 10);
  return { environment: 'sandbox', serverTime: new Date(serverTime).toISOString(),
    membership: { active: true, expiresAt: new Date(serverTime + days * 86400000).toISOString() },
    aiPoints: { available: 0, nextGrantAt: null } };
}

describe('single-owner membership deadline', () => {
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });

  it('uses the server duration even when the phone clock is far ahead', () => {
    jest.setSystemTime(new Date('2032-01-01'));
    const expired = jest.fn();
    scheduleMembershipExpiry(membership(7), expired);
    jest.advanceTimersByTime(7 * 86400000 - 1);
    expect(expired).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(expired).toHaveBeenCalledTimes(1);
  });

  it('does not prematurely expire a 93-day purchase at the native timer limit', () => {
    const expired = jest.fn();
    scheduleMembershipExpiry(membership(93), expired);
    jest.advanceTimersByTime(2_147_483_647);
    expect(expired).not.toHaveBeenCalled();
    jest.advanceTimersByTime(93 * 86400000 - 2_147_483_647);
    expect(expired).toHaveBeenCalledTimes(1);
  });

  it('cancels the old deadline when another account or renewal replaces it', () => {
    const expired = jest.fn();
    const cancel = scheduleMembershipExpiry(membership(7), expired);
    cancel();
    jest.advanceTimersByTime(7 * 86400000);
    expect(expired).not.toHaveBeenCalled();
  });
});
