import {
  TESTFLIGHT_COMMERCE_DISABLED_CODE,
  TESTFLIGHT_COMMERCE_UNAVAILABLE_RESULT,
} from '../commerce-provider.native';
import { createTestFlightCommerceProvider } from '../disabled-commerce-provider.native';

describe('disabled TestFlight native commerce provider', () => {
  it('fails closed with one stable non-payment result for every commerce action', async () => {
    const provider = createTestFlightCommerceProvider();

    const results = await Promise.all([
      provider.listOfferings(),
      provider.purchase({
        offeringKey: 'membership_31d_v1',
        applicationAccountToken: '00000000-0000-0000-0000-000000000000',
      }),
      provider.restorePurchases(),
      provider.finishTransaction({ transactionReference: 'not-a-transaction' }),
    ]);

    expect(results).toEqual([
      TESTFLIGHT_COMMERCE_UNAVAILABLE_RESULT,
      TESTFLIGHT_COMMERCE_UNAVAILABLE_RESULT,
      TESTFLIGHT_COMMERCE_UNAVAILABLE_RESULT,
      TESTFLIGHT_COMMERCE_UNAVAILABLE_RESULT,
    ]);
    expect(results.every((result) => result === TESTFLIGHT_COMMERCE_UNAVAILABLE_RESULT)).toBe(true);
    expect(TESTFLIGHT_COMMERCE_UNAVAILABLE_RESULT).toEqual({
      ok: false,
      state: 'unavailable',
      code: TESTFLIGHT_COMMERCE_DISABLED_CODE,
      charged: false,
      retryable: false,
    });
  });

  it('has no channel construction or channel-call surface', () => {
    const provider = createTestFlightCommerceProvider();

    expect(Object.keys(provider).sort()).toEqual([]);
    expect(Object.getOwnPropertyNames(Object.getPrototypeOf(provider)).sort()).toEqual([
      'constructor',
      'finishTransaction',
      'listOfferings',
      'purchase',
      'restorePurchases',
    ]);
  });
});
