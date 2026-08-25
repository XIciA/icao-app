import { Inject, Injectable } from '@nestjs/common';
import {
  APIException,
  Environment,
  GetTransactionHistoryVersion,
  Order,
  ProductType,
  type TransactionHistoryRequest,
} from '@apple/app-store-server-library';

import { API_CONFIG, type ApiConfig } from '../config';
import {
  APPLE_STORE_VERIFIER,
  type AppleStoreVerifier,
} from './apple-store-verifier';
import {
  APPLE_STORE_SERVER_API_CLIENT_FACTORY,
  type AppleStoreServerApiClientFactory,
} from './apple-store-server-api-client';
import type { VerifiedAppleTransaction } from './commerce-domain';
import {
  requireMembershipProductByAppleId,
  type CommerceEnvironment,
  type MembershipProductKey,
} from './product-catalog';

export const DEFAULT_APPLE_HISTORY_MAX_PAGES = 10;
export const DEFAULT_APPLE_HISTORY_MAX_TRANSACTIONS = 200;
export const MAX_APPLE_HISTORY_PAGES = 25;
export const MAX_APPLE_HISTORY_TRANSACTIONS = 500;

type AppleServerApiServiceConfig = Pick<
  ApiConfig,
  'appleIapAppAppleId' | 'appleIapBundleId'
>;

type VerifiedServerTransaction = Readonly<{
  accountId: string;
  productKey: MembershipProductKey;
  signedTransaction: string;
  transaction: VerifiedAppleTransaction;
}>;

export type AppleServerTransactionSummary = Readonly<{
  accountId: string;
  environment: CommerceEnvironment;
  productKey: MembershipProductKey;
  purchaseDate: string;
  revoked: boolean;
  signedDate: string;
  transactionId: string;
}>;

export type AppleServerHistoryResult = Readonly<{
  accountId: string;
  environment: CommerceEnvironment;
  pages: number;
  transactions: readonly AppleServerTransactionSummary[];
}>;

export class AppleStoreServerApiRequestError extends Error {
  constructor(
    readonly operation: 'history' | 'test_notification' | 'transaction_info',
    readonly httpStatusCode?: number,
    readonly apiError?: number,
  ) {
    super(`apple_iap_server_${operation}_failed`);
  }
}

function normalizeResponseEnvironment(value: unknown): CommerceEnvironment {
  if (value === Environment.PRODUCTION || value === 'Production') return 'production';
  if (value === Environment.SANDBOX || value === 'Sandbox') return 'sandbox';
  throw new Error('apple_iap_server_response_environment_invalid');
}

function normalizeApiError(
  operation: AppleStoreServerApiRequestError['operation'],
  error: unknown,
) {
  if (error instanceof AppleStoreServerApiRequestError) return error;
  if (error instanceof Error && error.message.startsWith('apple_iap_server_')) return error;
  if (error instanceof APIException) {
    return new AppleStoreServerApiRequestError(
      operation,
      error.httpStatusCode,
      typeof error.apiError === 'number' ? error.apiError : undefined,
    );
  }
  return new AppleStoreServerApiRequestError(operation);
}

@Injectable()
export class AppleStoreServerApiService {
  constructor(
    @Inject(API_CONFIG) private readonly config: AppleServerApiServiceConfig,
    @Inject(APPLE_STORE_SERVER_API_CLIENT_FACTORY)
    private readonly clients: AppleStoreServerApiClientFactory,
    @Inject(APPLE_STORE_VERIFIER) private readonly verifier: AppleStoreVerifier,
  ) {}

  async transactionHistory(
    environment: CommerceEnvironment,
    transactionId: string,
    options: Readonly<{
      maxPages?: number;
      maxTransactions?: number;
    }> = {},
  ): Promise<AppleServerHistoryResult> {
    const loaded = await this.loadTransactionHistory(environment, transactionId, options);
    return {
      accountId: loaded.accountId,
      environment,
      pages: loaded.pages,
      transactions: loaded.transactions.map(({ productKey, transaction }) => ({
        accountId: loaded.accountId,
        environment,
        productKey,
        purchaseDate: transaction.purchaseDate.toISOString(),
        revoked: Boolean(transaction.revocationDate),
        signedDate: transaction.signedDate.toISOString(),
        transactionId: transaction.transactionId,
      })),
    };
  }

  async requestTestNotification(environment: CommerceEnvironment) {
    try {
      const response = await this.clients.forEnvironment(environment).requestTestNotification();
      if (!response.testNotificationToken) {
        throw new Error('apple_iap_server_test_notification_token_missing');
      }
      return {
        environment,
        testNotificationToken: response.testNotificationToken,
      } as const;
    } catch (error) {
      throw normalizeApiError('test_notification', error);
    }
  }

  async loadTransactionHistory(
    environment: CommerceEnvironment,
    transactionId: string,
    options: Readonly<{
      maxPages?: number;
      maxTransactions?: number;
    }> = {},
  ): Promise<Readonly<{
    accountId: string;
    pages: number;
    transactions: readonly VerifiedServerTransaction[];
  }>> {
    const maxPages = options.maxPages ?? DEFAULT_APPLE_HISTORY_MAX_PAGES;
    const maxTransactions = options.maxTransactions ?? DEFAULT_APPLE_HISTORY_MAX_TRANSACTIONS;
    if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > MAX_APPLE_HISTORY_PAGES) {
      throw new Error('apple_iap_server_history_max_pages_invalid');
    }
    if (
      !Number.isInteger(maxTransactions)
      || maxTransactions < 1
      || maxTransactions > MAX_APPLE_HISTORY_TRANSACTIONS
    ) throw new Error('apple_iap_server_history_max_transactions_invalid');

    const client = this.clients.forEnvironment(environment);
    let anchorSignedTransaction: string;
    try {
      const response = await client.getTransactionInfo(transactionId);
      if (!response.signedTransactionInfo) {
        throw new Error('apple_iap_server_transaction_info_missing');
      }
      anchorSignedTransaction = response.signedTransactionInfo;
    } catch (error) {
      throw normalizeApiError('transaction_info', error);
    }
    const anchor = await this.verifyServerTransaction(
      anchorSignedTransaction,
      environment,
    );
    if (
      anchor.transaction.transactionId !== transactionId
      && anchor.transaction.originalTransactionId !== transactionId
    ) throw new Error('apple_iap_server_transaction_query_mismatch');

    const request: TransactionHistoryRequest = {
      sort: Order.ASCENDING,
      productTypes: [ProductType.NON_RENEWABLE],
    };
    const byTransactionId = new Map<string, VerifiedServerTransaction>();
    this.mergeTransactionVersion(byTransactionId, anchor);
    let revision: string | null = null;
    const seenRevisions = new Set<string>();
    let pages = 0;
    let hasMoreAfterLastPage = false;
    while (pages < maxPages) {
      let response;
      try {
        response = await client.getTransactionHistory(
          transactionId,
          revision,
          request,
          GetTransactionHistoryVersion.V2,
        );
      } catch (error) {
        throw normalizeApiError('history', error);
      }
      pages += 1;
      this.assertHistoryEnvelope(response, environment, revision);
      hasMoreAfterLastPage = response.hasMore;
      for (const signedTransaction of response.signedTransactions) {
        const candidate = await this.verifyServerTransaction(signedTransaction, environment);
        if (candidate.accountId !== anchor.accountId) {
          throw new Error('apple_iap_server_history_account_mismatch');
        }
        this.mergeTransactionVersion(byTransactionId, candidate);
        if (byTransactionId.size > maxTransactions) {
          throw new Error('apple_iap_server_history_transaction_limit_exceeded');
        }
      }
      if (!response.hasMore) break;
      if (!response.revision || seenRevisions.has(response.revision)) {
        throw new Error('apple_iap_server_history_revision_invalid');
      }
      seenRevisions.add(response.revision);
      revision = response.revision;
    }
    if (hasMoreAfterLastPage) throw new Error('apple_iap_server_history_page_limit_exceeded');
    const transactions = [...byTransactionId.values()].sort((left, right) => (
      left.transaction.purchaseDate.getTime() - right.transaction.purchaseDate.getTime()
      || left.transaction.transactionId.localeCompare(right.transaction.transactionId)
    ));
    return { accountId: anchor.accountId, pages, transactions };
  }

  private assertHistoryEnvelope(
    response: Readonly<{
      appAppleId?: number;
      bundleId?: string;
      environment?: string;
      hasMore?: boolean;
      revision?: string;
      signedTransactions?: string[];
    }>,
    environment: CommerceEnvironment,
    requestedRevision: string | null,
  ): asserts response is Readonly<{
    appAppleId?: number;
    bundleId: string;
    environment: string;
    hasMore: boolean;
    revision?: string;
    signedTransactions: string[];
  }> {
    if (normalizeResponseEnvironment(response.environment) !== environment) {
      throw new Error('apple_iap_server_history_environment_mismatch');
    }
    if (response.bundleId !== this.config.appleIapBundleId) {
      throw new Error('apple_iap_server_history_bundle_mismatch');
    }
    if (
      environment === 'production'
      && (
        !this.config.appleIapAppAppleId
        || response.appAppleId !== this.config.appleIapAppAppleId
      )
    ) throw new Error('apple_iap_server_history_app_id_mismatch');
    if (
      environment === 'sandbox'
      && response.appAppleId !== undefined
      && this.config.appleIapAppAppleId !== undefined
      && response.appAppleId !== this.config.appleIapAppAppleId
    ) throw new Error('apple_iap_server_history_app_id_mismatch');
    if (typeof response.hasMore !== 'boolean') {
      throw new Error('apple_iap_server_history_has_more_invalid');
    }
    if (
      !Array.isArray(response.signedTransactions)
      || response.signedTransactions.some((item) => typeof item !== 'string' || item.length === 0)
    ) throw new Error('apple_iap_server_history_transactions_invalid');
    if (
      response.revision !== undefined
      && (typeof response.revision !== 'string' || response.revision.length === 0)
    ) throw new Error('apple_iap_server_history_revision_invalid');
    if (
      response.hasMore
      && (!response.revision || response.revision === requestedRevision)
    ) throw new Error('apple_iap_server_history_revision_invalid');
  }

  private async verifyServerTransaction(
    signedTransaction: string,
    environment: CommerceEnvironment,
  ): Promise<VerifiedServerTransaction> {
    const transaction = await this.verifier.verifyTransaction(signedTransaction);
    if (
      !(transaction.signedDate instanceof Date)
      || !Number.isFinite(transaction.signedDate.getTime())
    ) throw new Error('apple_iap_server_transaction_signed_date_invalid');
    if (transaction.environment !== environment) {
      throw new Error('apple_iap_server_transaction_environment_mismatch');
    }
    if (transaction.bundleId !== this.config.appleIapBundleId) {
      throw new Error('apple_iap_server_transaction_bundle_mismatch');
    }
    if (!transaction.appAccountToken) {
      throw new Error('apple_iap_server_transaction_account_missing');
    }
    const product = requireMembershipProductByAppleId(transaction.productId);
    return {
      accountId: transaction.appAccountToken.toLowerCase(),
      productKey: product.productKey,
      signedTransaction,
      transaction,
    };
  }

  private mergeTransactionVersion(
    transactions: Map<string, VerifiedServerTransaction>,
    candidate: VerifiedServerTransaction,
  ) {
    const existing = transactions.get(candidate.transaction.transactionId);
    if (!existing) {
      transactions.set(candidate.transaction.transactionId, candidate);
      return;
    }
    if (
      existing.accountId !== candidate.accountId
      || existing.transaction.environment !== candidate.transaction.environment
      || existing.transaction.originalTransactionId
        !== candidate.transaction.originalTransactionId
      || existing.transaction.productId !== candidate.transaction.productId
      || existing.transaction.bundleId !== candidate.transaction.bundleId
      || existing.transaction.purchaseDate.getTime()
        !== candidate.transaction.purchaseDate.getTime()
      || existing.transaction.productType !== candidate.transaction.productType
      || existing.transaction.quantity !== candidate.transaction.quantity
    ) throw new Error('apple_iap_server_history_transaction_identity_conflict');
    const existingSignedAt = existing.transaction.signedDate.getTime();
    const candidateSignedAt = candidate.transaction.signedDate.getTime();
    if (!Number.isFinite(existingSignedAt) || !Number.isFinite(candidateSignedAt)) {
      throw new Error('apple_iap_server_transaction_signed_date_invalid');
    }
    if (candidateSignedAt > existingSignedAt) {
      transactions.set(candidate.transaction.transactionId, candidate);
    } else if (
      candidateSignedAt === existingSignedAt
      && candidate.transaction.signedPayloadHash !== existing.transaction.signedPayloadHash
    ) throw new Error('apple_iap_server_history_signed_version_conflict');
  }
}
