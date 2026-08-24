import type { AppleStoreVerifier } from './apple-store-verifier';
import type { CommerceDomainState, CommerceFoundationModel } from './commerce-domain';
import type { CommerceEnvironment } from './product-catalog';

/**
 * Foundation-only boundary for verified Apple input. This class has no Nest
 * decorators or persistence and must not be wired into AppModule.
 * Real certificate/JWS fixtures and active App Store history reconciliation
 * belong to the later persistence/integration phase; this boundary does not
 * simulate either one.
 */
export class AppleCommerceFoundationBoundary {
  constructor(
    private readonly verifier: AppleStoreVerifier,
    private readonly commerce: CommerceFoundationModel,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async ingestTransaction(
    state: CommerceDomainState,
    signedTransaction: string,
    expectedEnvironment: CommerceEnvironment,
  ) {
    const transaction = await this.verifier.verifyTransaction(signedTransaction, expectedEnvironment);
    return this.commerce.recordApplePurchase(state, transaction, this.now());
  }

  async ingestNotification(
    state: CommerceDomainState,
    signedPayload: string,
    expectedEnvironment: CommerceEnvironment,
  ) {
    const notification = await this.verifier.verifyNotification(signedPayload, expectedEnvironment);
    return this.commerce.recordAppleNotification(state, notification, this.now());
  }
}
