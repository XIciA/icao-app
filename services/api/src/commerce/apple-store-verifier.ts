import { createHash } from 'node:crypto';

import {
  Environment,
  SignedDataVerifier,
  Type,
  VerificationException,
  VerificationStatus,
  type JWSTransactionDecodedPayload,
  type ResponseBodyV2DecodedPayload,
} from '@apple/app-store-server-library';

import type { VerifiedAppleNotification, VerifiedAppleTransaction } from './commerce-domain';
import type { CommerceEnvironment } from './product-catalog';
import type { ApiConfig } from '../config';

export const APPLE_STORE_VERIFIER = Symbol('APPLE_STORE_VERIFIER');

export interface AppleStoreVerifier {
  verifyTransaction(signedTransaction: string): Promise<VerifiedAppleTransaction>;
  verifyNotification(signedPayload: string): Promise<VerifiedAppleNotification>;
}

export type OfficialAppleStoreVerifierOptions = Readonly<{
  appleRootCertificates: readonly Buffer[];
  bundleId: string;
  appAppleId: number;
  enableOnlineChecks?: boolean;
}>;

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function requireString(value: unknown, errorCode: string) {
  if (typeof value !== 'string' || value.length === 0) throw new Error(errorCode);
  return value;
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function requireUuid(value: unknown, errorCode: string) {
  const uuid = requireString(value, errorCode);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid)) {
    throw new Error(errorCode);
  }
  return uuid;
}

function optionalUuid(value: unknown, errorCode: string) {
  return value === undefined ? undefined : requireUuid(value, errorCode);
}

function requireDate(value: unknown, errorCode: string) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(errorCode);
  const result = new Date(value);
  if (Number.isNaN(result.getTime())) throw new Error(errorCode);
  return result;
}

function optionalDate(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const result = new Date(value);
  return Number.isNaN(result.getTime()) ? undefined : result;
}

function normalizeEnvironment(value: unknown): CommerceEnvironment {
  if (value === Environment.SANDBOX || value === 'Sandbox') return 'sandbox';
  if (value === Environment.PRODUCTION || value === 'Production') return 'production';
  throw new Error('unsupported_apple_environment');
}

function jsonRecord(value: object): Readonly<Record<string, unknown>> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function normalizeTransaction(
  payload: JWSTransactionDecodedPayload,
  signedTransaction: string,
  verifiedEnvironment: CommerceEnvironment,
): VerifiedAppleTransaction {
  const environment = normalizeEnvironment(payload.environment);
  if (environment !== verifiedEnvironment) throw new Error('apple_transaction_environment_mismatch');
  if (payload.type !== Type.NON_RENEWING_SUBSCRIPTION) {
    throw new Error('apple_transaction_type_invalid');
  }
  if (payload.quantity !== 1) throw new Error('apple_transaction_quantity_invalid');
  return {
    environment,
    transactionId: requireString(payload.transactionId, 'apple_transaction_id_missing'),
    originalTransactionId: requireString(
      payload.originalTransactionId,
      'apple_original_transaction_id_missing',
    ),
    productId: requireString(payload.productId, 'apple_product_id_missing'),
    bundleId: requireString(payload.bundleId, 'apple_bundle_id_missing'),
    appAccountToken: optionalUuid(payload.appAccountToken, 'apple_app_account_token_invalid'),
    purchaseDate: requireDate(payload.purchaseDate, 'apple_purchase_date_missing'),
    signedDate: requireDate(payload.signedDate, 'apple_signed_date_missing'),
    revocationDate: optionalDate(payload.revocationDate),
    revocationReason: typeof payload.revocationReason === 'number' ? payload.revocationReason : undefined,
    storefront: optionalString(payload.storefront),
    currency: optionalString(payload.currency),
    priceMilliunits: typeof payload.price === 'number' ? payload.price : undefined,
    productType: 'non_renewing_subscription',
    quantity: 1,
    signedPayloadHash: sha256(signedTransaction),
    decodedPayload: jsonRecord(payload),
  };
}

export class OfficialAppleStoreVerifier implements AppleStoreVerifier {
  private readonly verifiers: Record<CommerceEnvironment, SignedDataVerifier>;

  constructor(options: OfficialAppleStoreVerifierOptions) {
    if (options.appleRootCertificates.length === 0) throw new Error('apple_root_certificates_required');
    if (!options.bundleId) throw new Error('apple_bundle_id_required');
    if (!Number.isSafeInteger(options.appAppleId) || options.appAppleId <= 0) {
      throw new Error('apple_app_id_required');
    }
    const roots = options.appleRootCertificates.map((certificate) => Buffer.from(certificate));
    const enableOnlineChecks = options.enableOnlineChecks ?? true;
    this.verifiers = {
      sandbox: new SignedDataVerifier(
        roots,
        enableOnlineChecks,
        Environment.SANDBOX,
        options.bundleId,
      ),
      production: new SignedDataVerifier(
        roots,
        enableOnlineChecks,
        Environment.PRODUCTION,
        options.bundleId,
        options.appAppleId,
      ),
    };
  }

  async verifyTransaction(
    signedTransaction: string,
  ): Promise<VerifiedAppleTransaction> {
    return this.verifyAcrossEnvironments(async (environment, verifier) => {
      const payload = await verifier.verifyAndDecodeTransaction(signedTransaction);
      return normalizeTransaction(payload, signedTransaction, environment);
    });
  }

  async verifyNotification(
    signedPayload: string,
  ): Promise<VerifiedAppleNotification> {
    return this.verifyAcrossEnvironments(async (environment, verifier) => {
      const payload = await verifier.verifyAndDecodeNotification(signedPayload);
      const payloadEnvironment = normalizeEnvironment(
        payload.data?.environment
        ?? (environment === 'sandbox' ? Environment.SANDBOX : Environment.PRODUCTION),
      );
      if (payloadEnvironment !== environment) throw new Error('apple_notification_environment_mismatch');
      const signedTransaction = payload.data?.signedTransactionInfo;
      const transaction = signedTransaction
        ? normalizeTransaction(
          await verifier.verifyAndDecodeTransaction(signedTransaction),
          signedTransaction,
          environment,
        )
        : undefined;
      return this.normalizeNotification(payload, signedPayload, environment, transaction);
    });
  }

  private async verifyAcrossEnvironments<T>(
    operation: (
      environment: CommerceEnvironment,
      verifier: SignedDataVerifier,
    ) => Promise<T>,
  ): Promise<T> {
    try {
      return await operation('production', this.verifiers.production);
    } catch (error) {
      if (!isAppleEnvironmentMismatch(error)) throw error;
    }
    return operation('sandbox', this.verifiers.sandbox);
  }

  private normalizeNotification(
    payload: ResponseBodyV2DecodedPayload,
    signedPayload: string,
    environment: CommerceEnvironment,
    transaction?: VerifiedAppleTransaction,
  ): VerifiedAppleNotification {
    return {
      environment,
      notificationUuid: requireUuid(payload.notificationUUID, 'apple_notification_uuid_missing'),
      notificationType: requireString(payload.notificationType, 'apple_notification_type_missing'),
      subtype: optionalString(payload.subtype),
      signedDate: requireDate(payload.signedDate, 'apple_notification_signed_date_missing'),
      signedPayloadHash: sha256(signedPayload),
      decodedPayload: jsonRecord(payload),
      transaction,
    };
  }
}

class UnconfiguredAppleStoreVerifier implements AppleStoreVerifier {
  async verifyTransaction(): Promise<never> {
    throw new Error('apple_commerce_not_configured');
  }

  async verifyNotification(): Promise<never> {
    throw new Error('apple_commerce_not_configured');
  }
}

export function configuredAppleStoreVerifier(config: ApiConfig): AppleStoreVerifier {
  if (!config.appleIapAppAppleId || config.appleIapRootCertificates.length === 0) {
    return new UnconfiguredAppleStoreVerifier();
  }
  return new OfficialAppleStoreVerifier({
    appleRootCertificates: config.appleIapRootCertificates,
    bundleId: config.appleIapBundleId,
    appAppleId: config.appleIapAppAppleId,
    enableOnlineChecks: true,
  });
}

function isAppleEnvironmentMismatch(error: unknown) {
  return error instanceof VerificationException
    && error.status === VerificationStatus.INVALID_ENVIRONMENT;
}

export function isRetryableAppleVerificationError(error: unknown) {
  return error instanceof VerificationException
    && error.status === VerificationStatus.RETRYABLE_VERIFICATION_FAILURE;
}
