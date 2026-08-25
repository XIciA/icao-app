import {
  APIException,
  Environment,
  GetTransactionHistoryVersion,
  ProductType,
} from '@apple/app-store-server-library';
import { describe, expect, it, vi } from 'vitest';

import {
  OfficialAppleStoreServerApiClientFactory,
  type AppleStoreServerApiClient,
  type AppleStoreServerApiClientFactory,
} from '../src/commerce/apple-store-server-api-client';
import {
  AppleStoreServerApiRequestError,
  AppleStoreServerApiService,
} from '../src/commerce/apple-store-server-api.service';
import type { AppleStoreVerifier } from '../src/commerce/apple-store-verifier';
import type { VerifiedAppleTransaction } from '../src/commerce/commerce-domain';

const ACCOUNT_ID = '00000000-0000-4000-8000-000000000001';
const BUNDLE_ID = 'com.readyoufife.ios';

function transaction(
  transactionId: string,
  overrides: Partial<VerifiedAppleTransaction> = {},
): VerifiedAppleTransaction {
  return {
    environment: 'sandbox',
    transactionId,
    originalTransactionId: transactionId === 'anchor' ? 'anchor' : 'anchor',
    productId: 'com.readyoufife.ios.membership.31d.v1',
    bundleId: BUNDLE_ID,
    appAccountToken: ACCOUNT_ID,
    purchaseDate: new Date(transactionId === 'refund' ? 2 : 1),
    signedDate: new Date(transactionId === 'refund' ? 4 : 3),
    productType: 'non_renewing_subscription',
    quantity: 1,
    signedPayloadHash: transactionId.padEnd(64, '0'),
    decodedPayload: {},
    ...overrides,
  };
}

function verifier(values: Readonly<Record<string, VerifiedAppleTransaction>>): AppleStoreVerifier {
  return {
    verifyNotification: async () => { throw new Error('not_used'); },
    verifyTransaction: vi.fn(async (signed) => {
      const result = values[signed];
      if (!result) throw new Error('unknown_signed_transaction');
      return result;
    }),
  };
}

function factory(client: AppleStoreServerApiClient): AppleStoreServerApiClientFactory {
  return { forEnvironment: vi.fn(() => client) };
}

function apiService(
  client: AppleStoreServerApiClient,
  values: Readonly<Record<string, VerifiedAppleTransaction>>,
) {
  return new AppleStoreServerApiService(
    { appleIapAppAppleId: 1_234_567_890, appleIapBundleId: BUNDLE_ID },
    factory(client),
    verifier(values),
  );
}

describe('AppleStoreServerApiService', () => {
  it('queries transaction info and bounded V2 NON_RENEWABLE history with replay deduplication', async () => {
    const getTransactionHistory = vi.fn()
      .mockResolvedValueOnce({
        appAppleId: 1_234_567_890,
        bundleId: BUNDLE_ID,
        environment: Environment.SANDBOX,
        hasMore: true,
        revision: 'revision-1',
        signedTransactions: ['signed-anchor', 'signed-anchor'],
      })
      .mockResolvedValueOnce({
        appAppleId: 1_234_567_890,
        bundleId: BUNDLE_ID,
        environment: Environment.SANDBOX,
        hasMore: false,
        revision: 'revision-2',
        signedTransactions: ['signed-refund'],
      });
    const client = {
      getTransactionInfo: vi.fn(async () => ({ signedTransactionInfo: 'signed-anchor' })),
      getTransactionHistory,
      requestTestNotification: vi.fn(),
    } as AppleStoreServerApiClient;
    const service = apiService(client, {
      'signed-anchor': transaction('anchor'),
      'signed-refund': transaction('refund', { revocationDate: new Date(5) }),
    });

    const result = await service.transactionHistory('sandbox', 'anchor');
    expect(result).toEqual({
      accountId: ACCOUNT_ID,
      environment: 'sandbox',
      pages: 2,
      transactions: [
        expect.objectContaining({ productKey: 'membership_31d_v1', transactionId: 'anchor' }),
        expect.objectContaining({ revoked: true, transactionId: 'refund' }),
      ],
    });
    expect(getTransactionHistory).toHaveBeenNthCalledWith(
      1,
      'anchor',
      null,
      expect.objectContaining({ productTypes: [ProductType.NON_RENEWABLE] }),
      GetTransactionHistoryVersion.V2,
    );
    expect(getTransactionHistory).toHaveBeenNthCalledWith(
      2,
      'anchor',
      'revision-1',
      expect.any(Object),
      GetTransactionHistoryVersion.V2,
    );
    expect(result.transactions.every((item) => !('productId' in item))).toBe(true);
  });

  it('fails closed when a sandbox request receives a production transaction', async () => {
    const client = {
      getTransactionInfo: vi.fn(async () => ({ signedTransactionInfo: 'signed-anchor' })),
      getTransactionHistory: vi.fn(),
      requestTestNotification: vi.fn(),
    } as AppleStoreServerApiClient;
    const service = apiService(client, {
      'signed-anchor': transaction('anchor', { environment: 'production' }),
    });
    await expect(service.transactionHistory('sandbox', 'anchor'))
      .rejects.toThrow('apple_iap_server_transaction_environment_mismatch');
    expect(client.getTransactionHistory).not.toHaveBeenCalled();
  });

  it('rejects truncated history instead of applying a partial page set', async () => {
    const client = {
      getTransactionInfo: vi.fn(async () => ({ signedTransactionInfo: 'signed-anchor' })),
      getTransactionHistory: vi.fn(async () => ({
        appAppleId: 1_234_567_890,
        bundleId: BUNDLE_ID,
        environment: Environment.SANDBOX,
        hasMore: true,
        revision: 'revision-1',
        signedTransactions: ['signed-anchor'],
      })),
      requestTestNotification: vi.fn(),
    } as AppleStoreServerApiClient;
    const service = apiService(client, { 'signed-anchor': transaction('anchor') });
    await expect(service.transactionHistory('sandbox', 'anchor', { maxPages: 1 }))
      .rejects.toThrow('apple_iap_server_history_page_limit_exceeded');
  });

  it('does not leak the Apple error message when a test notification request fails', async () => {
    const client = {
      getTransactionInfo: vi.fn(),
      getTransactionHistory: vi.fn(),
      requestTestNotification: vi.fn(async () => {
        throw new APIException(500, 5_000_000, 'upstream-sensitive-detail');
      }),
    } as AppleStoreServerApiClient;
    const service = apiService(client, {});
    const error = await service.requestTestNotification('production').catch((caught) => caught);
    expect(error).toBeInstanceOf(AppleStoreServerApiRequestError);
    expect(error).toMatchObject({
      apiError: 5_000_000,
      httpStatusCode: 500,
      message: 'apple_iap_server_test_notification_failed',
      operation: 'test_notification',
    });
    expect(JSON.stringify(error)).not.toContain('upstream-sensitive-detail');
  });
});

describe('OfficialAppleStoreServerApiClientFactory', () => {
  it('constructs and caches distinct production and sandbox clients', () => {
    const created: Array<{ environment: Environment; marker: symbol }> = [];
    const factory = new OfficialAppleStoreServerApiClientFactory({
      bundleId: BUNDLE_ID,
      issuerId: '00000000-0000-4000-8000-000000000099',
      keyId: 'IAPKEY1234',
      privateKey: 'test-private-key',
    }, (_privateKey, _keyId, _issuerId, _bundleId, environment) => {
      const value = { environment, marker: Symbol(environment) };
      created.push(value);
      return value as unknown as AppleStoreServerApiClient;
    });

    const sandbox = factory.forEnvironment('sandbox');
    const production = factory.forEnvironment('production');
    expect(sandbox).not.toBe(production);
    expect(factory.forEnvironment('sandbox')).toBe(sandbox);
    expect(factory.forEnvironment('production')).toBe(production);
    expect(created.map((item) => item.environment)).toEqual([
      Environment.SANDBOX,
      Environment.PRODUCTION,
    ]);
  });
});
