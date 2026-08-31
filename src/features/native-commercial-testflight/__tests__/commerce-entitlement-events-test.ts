import {
  publishCommerceEntitlementChange,
  subscribeCommerceEntitlementChanges,
} from '../commerce-entitlement-events';
import type { CommerceEntitlementChange } from '../commerce-runtime-types';

describe('commerce entitlement event contract', () => {
  const change = (overrides: Partial<CommerceEntitlementChange> = {}): CommerceEntitlementChange => ({
    accountId: '10000000-0000-4000-8000-000000000101',
    environment: 'production',
    revision: 1,
    reason: 'manual-refresh',
    ...overrides,
  });

  it('delivers account, environment and monotonic revision and supports cleanup', () => {
    const observed: CommerceEntitlementChange[] = [];
    const unsubscribe = subscribeCommerceEntitlementChanges((event) => observed.push(event));

    publishCommerceEntitlementChange(change());
    publishCommerceEntitlementChange(change({
      accountId: '10000000-0000-4000-8000-000000000202',
      environment: 'sandbox',
      revision: 2,
      reason: 'account-change',
    }));
    unsubscribe();
    publishCommerceEntitlementChange(change({ revision: 3 }));

    expect(observed).toEqual([
      expect.objectContaining({
        accountId: '10000000-0000-4000-8000-000000000101',
        environment: 'production',
        revision: 1,
      }),
      expect.objectContaining({
        accountId: '10000000-0000-4000-8000-000000000202',
        environment: 'sandbox',
        revision: 2,
      }),
    ]);
  });

  it('isolates a failing listener from other subscribers', () => {
    const observed = jest.fn();
    const unsubscribeFailing = subscribeCommerceEntitlementChanges(() => {
      throw new Error('downstream_failed');
    });
    const unsubscribeObserved = subscribeCommerceEntitlementChanges(observed);

    expect(() => publishCommerceEntitlementChange(change())).not.toThrow();
    expect(observed).toHaveBeenCalledWith(change());

    unsubscribeFailing();
    unsubscribeObserved();
  });
});
