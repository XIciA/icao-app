import type { AppleStoreVerifier } from './apple-store-verifier';
import type { CommerceDomainService, CommerceDomainState } from './commerce-domain';
import type { CommerceEnvironment } from './product-catalog';

/**
 * The application boundary for Apple input. Only values returned by the verifier
 * are allowed to reach the commerce domain.
 */
export class AppleCommerceIngestionService {
  constructor(
    private readonly verifier: AppleStoreVerifier,
    private readonly commerce: CommerceDomainService,
  ) {}

  async ingestTransaction(
    state: CommerceDomainState,
    signedTransaction: string,
    expectedEnvironment: CommerceEnvironment,
  ) {
    const transaction = await this.verifier.verifyTransaction(signedTransaction, expectedEnvironment);
    return this.commerce.recordApplePurchase(state, transaction);
  }

  async ingestNotification(
    state: CommerceDomainState,
    signedPayload: string,
    expectedEnvironment: CommerceEnvironment,
  ) {
    const notification = await this.verifier.verifyNotification(signedPayload, expectedEnvironment);
    return this.commerce.recordAppleNotification(state, notification);
  }
}
