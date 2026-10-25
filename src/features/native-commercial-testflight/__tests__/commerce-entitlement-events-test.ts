import {
  beginCommerceEntitlementGeneration,
  getCommerceEntitlementSnapshot,
  publishCommerceEntitlementChange,
  resetCommerceEntitlementEventsForTests,
  subscribeCommerceEntitlementChanges,
} from '../commerce-entitlement-events';
import type { CommerceEntitlementChange } from '../commerce-runtime-types';

describe('commerce entitlement external-store contract', () => {
  beforeEach(() => resetCommerceEntitlementEventsForTests());

  it('replays a current snapshot and assigns monotonic revision across remount generations', () => {
    const accountId = '10000000-0000-4000-8000-000000000101';
    const observed: CommerceEntitlementChange[] = [];
    const unsubscribe = subscribeCommerceEntitlementChanges((event) => observed.push(event));

    const firstOwner = beginCommerceEntitlementGeneration(accountId);
    const firstSnapshot = publishCommerceEntitlementChange({
      accountId,
      environment: 'production',
      generation: firstOwner.generation,
      reason: 'manual-refresh',
    });
    const remountedOwner = beginCommerceEntitlementGeneration(accountId);

    expect(getCommerceEntitlementSnapshot()).toBe(remountedOwner);
    expect(firstOwner.revision).toBeLessThan(firstSnapshot!.revision);
    expect(firstSnapshot!.revision).toBeLessThan(remountedOwner.revision);
    expect(firstOwner.generation).toBeLessThan(remountedOwner.generation);
    expect(observed).toEqual([firstOwner, firstSnapshot, remountedOwner]);
    unsubscribe();
  });

  it('rejects a late publication from an old account generation', () => {
    const first = beginCommerceEntitlementGeneration(
      '10000000-0000-4000-8000-000000000101',
      'sandbox',
    );
    const second = beginCommerceEntitlementGeneration(
      '10000000-0000-4000-8000-000000000202',
      'production',
    );

    expect(publishCommerceEntitlementChange({
      accountId: first.accountId,
      environment: first.environment,
      generation: first.generation,
      reason: 'transaction-verification',
    })).toBe(second);
    expect(getCommerceEntitlementSnapshot()).toBe(second);
  });

  it('isolates a failing listener from other subscribers', () => {
    const observed = jest.fn();
    const unsubscribeFailing = subscribeCommerceEntitlementChanges(() => {
      throw new Error('downstream_failed');
    });
    const unsubscribeObserved = subscribeCommerceEntitlementChanges(observed);

    expect(() => beginCommerceEntitlementGeneration(
      '10000000-0000-4000-8000-000000000101',
    )).not.toThrow();
    expect(observed).toHaveBeenCalledWith(getCommerceEntitlementSnapshot());

    unsubscribeFailing();
    unsubscribeObserved();
  });
});


it('does not let a pre-purchase response overwrite a newer verified VIP snapshot', () => {
  resetCommerceEntitlementEventsForTests();
  const owner=beginCommerceEntitlementGeneration('account');
  const base={accountId:'account',generation:owner.generation,environment:'production' as const};
  const verified=publishCommerceEntitlementChange({...base,reason:'purchase',snapshot:{serverTime:'2026-10-25T06:00:01Z',membership:{active:true,expiresAt:'2026-11-25T00:00:00Z'}} as never});
  const late=publishCommerceEntitlementChange({...base,reason:'manual-refresh',snapshot:{serverTime:'2026-10-25T06:00:00Z',membership:{active:false,expiresAt:null}} as never});
  expect(late).toBe(verified);
  expect(getCommerceEntitlementSnapshot()?.snapshot?.membership.active).toBe(true);
});
