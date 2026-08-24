import {
  TESTFLIGHT_COMMERCE_DISABLED_CODE,
  TESTFLIGHT_COMMERCE_UNAVAILABLE_RESULT,
  type CommerceServerVerifiedAcknowledgement,
} from '../commerce-provider.native';
import { createTestFlightCommerceProvider } from '../disabled-commerce-provider.native';

describe('disabled TestFlight native commerce provider', () => {
  it('fails closed with one stable non-payment result for every commerce action', async () => {
    const provider = createTestFlightCommerceProvider();

    const results = await Promise.all([
      provider.listOfferings(),
      provider.purchase({
        offeringKey: 'membership_31d_v1',
        applicationAccountToken: '12345678-1234-4234-8234-123456789abc',
      }),
      provider.drainTransactionInbox(),
      provider.reconcileTransactions(),
      provider.restorePurchases(),
      provider.markServerVerified({
        transactionReference: 'not-a-transaction',
        signedTransaction: 'not-a-jws',
      }),
      provider.finishTransaction({
        acknowledgement: {
          transactionReference: 'not-a-transaction',
        } as CommerceServerVerifiedAcknowledgement,
      }),
    ]);

    await provider.dispose();

    expect(results).toEqual(Array(7).fill(TESTFLIGHT_COMMERCE_UNAVAILABLE_RESULT));
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
      'dispose',
      'drainTransactionInbox',
      'finishTransaction',
      'listOfferings',
      'markServerVerified',
      'purchase',
      'reconcileTransactions',
      'restorePurchases',
    ]);
  });
});
