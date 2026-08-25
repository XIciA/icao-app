import {
  AppStoreServerAPIClient,
  Environment,
  type GetTransactionHistoryVersion,
  type HistoryResponse,
  type SendTestNotificationResponse,
  type TransactionHistoryRequest,
  type TransactionInfoResponse,
} from '@apple/app-store-server-library';

import type { ApiConfig } from '../config';
import type { CommerceEnvironment } from './product-catalog';

export const APPLE_STORE_SERVER_API_CLIENT_FACTORY = Symbol(
  'APPLE_STORE_SERVER_API_CLIENT_FACTORY',
);

export interface AppleStoreServerApiClient {
  getTransactionInfo(transactionId: string): Promise<TransactionInfoResponse>;
  getTransactionHistory(
    transactionId: string,
    revision: string | null,
    request: TransactionHistoryRequest,
    version?: GetTransactionHistoryVersion,
  ): Promise<HistoryResponse>;
  requestTestNotification(): Promise<SendTestNotificationResponse>;
}

export interface AppleStoreServerApiClientFactory {
  forEnvironment(environment: CommerceEnvironment): AppleStoreServerApiClient;
}

type ClientCreator = (
  signingKey: string,
  keyId: string,
  issuerId: string,
  bundleId: string,
  environment: Environment,
) => AppleStoreServerApiClient;

type OfficialFactoryOptions = Readonly<{
  bundleId: string;
  issuerId: string;
  keyId: string;
  privateKey: string;
}>;

export class OfficialAppleStoreServerApiClientFactory
implements AppleStoreServerApiClientFactory {
  private readonly clients = new Map<CommerceEnvironment, AppleStoreServerApiClient>();

  constructor(
    private readonly options: OfficialFactoryOptions,
    private readonly createClient: ClientCreator = (...input) => new AppStoreServerAPIClient(...input),
  ) {
    if (!options.bundleId) throw new Error('apple_iap_server_bundle_id_required');
    if (!options.issuerId) throw new Error('apple_iap_server_issuer_id_required');
    if (!options.keyId) throw new Error('apple_iap_server_key_id_required');
    if (!options.privateKey) throw new Error('apple_iap_server_private_key_required');
  }

  forEnvironment(environment: CommerceEnvironment) {
    const existing = this.clients.get(environment);
    if (existing) return existing;
    const appleEnvironment = environment === 'production'
      ? Environment.PRODUCTION
      : Environment.SANDBOX;
    const client = this.createClient(
      this.options.privateKey,
      this.options.keyId,
      this.options.issuerId,
      this.options.bundleId,
      appleEnvironment,
    );
    this.clients.set(environment, client);
    return client;
  }
}

class UnconfiguredAppleStoreServerApiClientFactory
implements AppleStoreServerApiClientFactory {
  forEnvironment(): never {
    throw new Error('apple_iap_server_api_not_configured');
  }
}

export function configuredAppleStoreServerApiClientFactory(
  config: Pick<
    ApiConfig,
    | 'appleIapBundleId'
    | 'appleIapServerIssuerId'
    | 'appleIapServerKeyId'
    | 'appleIapServerPrivateKey'
  >,
): AppleStoreServerApiClientFactory {
  if (
    !config.appleIapServerIssuerId
    || !config.appleIapServerKeyId
    || !config.appleIapServerPrivateKey
  ) return new UnconfiguredAppleStoreServerApiClientFactory();
  return new OfficialAppleStoreServerApiClientFactory({
    bundleId: config.appleIapBundleId,
    issuerId: config.appleIapServerIssuerId,
    keyId: config.appleIapServerKeyId,
    privateKey: config.appleIapServerPrivateKey,
  });
}
