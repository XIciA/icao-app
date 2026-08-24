import {
  TESTFLIGHT_COMMERCE_UNAVAILABLE_RESULT,
  type CommerceCatalog,
  type CommerceFinish,
  type CommerceFinishRequest,
  type CommercePurchase,
  type CommercePurchaseRequest,
  type CommerceRestore,
  type CommerceResult,
  type CommerceServerVerifiedAcknowledgement,
  type CommerceServerVerificationRequest,
  type CommerceTransactionInbox,
  type NativeCommerceProvider,
} from './commerce-provider.native';

/**
 * Fail-closed provider for TestFlight. It owns no StoreKit, Alipay, WeChat,
 * network, URL, product, or order dependency, so calling it cannot reach a
 * payment channel.
 */
export class DisabledTestFlightCommerceProvider implements NativeCommerceProvider {
  async listOfferings(): Promise<CommerceResult<CommerceCatalog>> {
    return TESTFLIGHT_COMMERCE_UNAVAILABLE_RESULT;
  }

  async purchase(_request: CommercePurchaseRequest): Promise<CommerceResult<CommercePurchase>> {
    return TESTFLIGHT_COMMERCE_UNAVAILABLE_RESULT;
  }

  async drainTransactionInbox(): Promise<CommerceResult<CommerceTransactionInbox>> {
    return TESTFLIGHT_COMMERCE_UNAVAILABLE_RESULT;
  }

  async reconcileTransactions(): Promise<CommerceResult<CommerceTransactionInbox>> {
    return TESTFLIGHT_COMMERCE_UNAVAILABLE_RESULT;
  }

  async restorePurchases(): Promise<CommerceResult<CommerceRestore>> {
    return TESTFLIGHT_COMMERCE_UNAVAILABLE_RESULT;
  }

  async markServerVerified(
    _request: CommerceServerVerificationRequest,
  ): Promise<CommerceResult<CommerceServerVerifiedAcknowledgement>> {
    return TESTFLIGHT_COMMERCE_UNAVAILABLE_RESULT;
  }

  async finishTransaction(_request: CommerceFinishRequest): Promise<CommerceResult<CommerceFinish>> {
    return TESTFLIGHT_COMMERCE_UNAVAILABLE_RESULT;
  }

  async dispose(): Promise<void> {}
}

export function createTestFlightCommerceProvider(): NativeCommerceProvider {
  return new DisabledTestFlightCommerceProvider();
}
