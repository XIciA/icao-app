import {
  APIException,
  Environment,
  GetTransactionHistoryVersion,
  ProductType,
  SendAttemptResult,
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
  it('returns only a redacted test-notification delivery summary', async () => {
    const token = '8cd2974c-f905-492a-bf9a-b2f47c791d19';
    const client = {
      getTestNotificationStatus: vi.fn(async () => ({
        signedPayload: 'sensitive-signed-payload',
        sendAttempts: [
          {
            attemptDate: 1_698_148_900_000,
            sendAttemptResult: SendAttemptResult.NO_RESPONSE,
          },
          {
            attemptDate: 1_698_148_950_000,
            sendAttemptResult: SendAttemptResult.SUCCESS,
          },
        ],
      })),
      getTransactionInfo: vi.fn(),
      getTransactionHistory: vi.fn(),
      requestTestNotification: vi.fn(),
    } as AppleStoreServerApiClient;
    const service = apiService(client, {});

    const result = await service.testNotificationStatus('sandbox', token);

    expect(client.getTestNotificationStatus).toHaveBeenCalledWith(token);
    expect(result).toEqual({
      environment: 'sandbox',
      sendAttempts: [
        {
          attemptDate: '2023-10-24T12:01:40.000Z',
          sendAttemptResult: SendAttemptResult.NO_RESPONSE,
        },
        {
          attemptDate: '2023-10-24T12:02:30.000Z',
          sendAttemptResult: SendAttemptResult.SUCCESS,
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain(token);
    expect(JSON.stringify(result)).not.toContain('sensitive-signed-payload');
    expect(JSON.stringify(result)).not.toContain('signedPayload');
  });

  it('validates a test-notification token before an Apple call', async () => {
    const client = {
      getTestNotificationStatus: vi.fn(),
      getTransactionInfo: vi.fn(),
      getTransactionHistory: vi.fn(),
      requestTestNotification: vi.fn(),
    } as AppleStoreServerApiClient;
    const service = apiService(client, {});

    await expect(service.testNotificationStatus('production', '../token'))
      .rejects.toThrow('apple_iap_server_test_notification_token_invalid');
    expect(client.getTestNotificationStatus).not.toHaveBeenCalled();
  });

  it('normalizes Apple status errors without leaking upstream details', async () => {
    const client = {
      getTestNotificationStatus: vi.fn(async () => {
        throw new APIException(404, 4_040_008, 'upstream-sensitive-status-detail');
      }),
      getTransactionInfo: vi.fn(),
      getTransactionHistory: vi.fn(),
      requestTestNotification: vi.fn(),
    } as AppleStoreServerApiClient;
    const service = apiService(client, {});
    const error = await service.testNotificationStatus(
      'production',
      '8cd2974c-f905-492a-bf9a-b2f47c791d19',
    ).catch((caught) => caught);

    expect(error).toBeInstanceOf(AppleStoreServerApiRequestError);
    expect(error).toMatchObject({
      apiError: 4_040_008,
      httpStatusCode: 404,
      message: 'apple_iap_server_test_notification_status_failed',
      operation: 'test_notification_status',
    });
    expect(JSON.stringify(error)).not.toContain('upstream-sensitive-status-detail');
  });

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
      getTestNotificationStatus: vi.fn(),
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
      getTestNotificationStatus: vi.fn(),
      requestTestNotification: vi.fn(),
    } as AppleStoreServerApiClient;
    const service = apiService(client, {
      'signed-anchor': transaction('anchor', { environment: 'production' }),
    });
    await expect(service.transactionHistory('sandbox', 'anchor'))
      .rejects.toThrow('apple_iap_server_transaction_environment_mismatch');
    expect(client.getTransactionHistory).not.toHaveBeenCalled();
  });

  it('prefers a newer refunded transaction-info anchor over stale active history', async () => {
    const client = {
      getTransactionInfo: vi.fn(async () => ({ signedTransactionInfo: 'anchor-refunded' })),
      getTransactionHistory: vi.fn(async () => ({
        appAppleId: 1_234_567_890,
        bundleId: BUNDLE_ID,
        environment: Environment.SANDBOX,
        hasMore: false,
        revision: 'complete',
        signedTransactions: ['anchor-stale-active'],
      })),
      getTestNotificationStatus: vi.fn(),
      requestTestNotification: vi.fn(),
    } as AppleStoreServerApiClient;
    const service = apiService(client, {
      'anchor-refunded': transaction('anchor', {
        revocationDate: new Date(6),
        signedDate: new Date(5),
        signedPayloadHash: 'f'.repeat(64),
      }),
      'anchor-stale-active': transaction('anchor', {
        signedDate: new Date(3),
        signedPayloadHash: 'a'.repeat(64),
      }),
    });

    await expect(service.transactionHistory('sandbox', 'anchor')).resolves.toMatchObject({
      transactions: [expect.objectContaining({
        revoked: true,
        signedDate: new Date(5).toISOString(),
        transactionId: 'anchor',
      })],
    });
    const loaded = await service.loadTransactionHistory('sandbox', 'anchor');
    expect(loaded.transactions[0]?.signedTransaction).toBe('anchor-refunded');
  });

  it('rejects same-time conflicting anchor and history versions', async () => {
    const client = {
      getTransactionInfo: vi.fn(async () => ({ signedTransactionInfo: 'anchor-info' })),
      getTransactionHistory: vi.fn(async () => ({
        appAppleId: 1_234_567_890,
        bundleId: BUNDLE_ID,
        environment: Environment.SANDBOX,
        hasMore: false,
        revision: 'complete',
        signedTransactions: ['anchor-history'],
      })),
      getTestNotificationStatus: vi.fn(),
      requestTestNotification: vi.fn(),
    } as AppleStoreServerApiClient;
    const service = apiService(client, {
      'anchor-info': transaction('anchor', {
        signedDate: new Date(3),
        signedPayloadHash: 'a'.repeat(64),
      }),
      'anchor-history': transaction('anchor', {
        signedDate: new Date(3),
        signedPayloadHash: 'b'.repeat(64),
      }),
    });
    await expect(service.transactionHistory('sandbox', 'anchor'))
      .rejects.toThrow('apple_iap_server_history_signed_version_conflict');
  });

  it('rejects a transaction without a valid signedDate', async () => {
    const client = {
      getTransactionInfo: vi.fn(async () => ({ signedTransactionInfo: 'signed-anchor' })),
      getTransactionHistory: vi.fn(),
      getTestNotificationStatus: vi.fn(),
      requestTestNotification: vi.fn(),
    } as AppleStoreServerApiClient;
    const service = apiService(client, {
      'signed-anchor': transaction('anchor', { signedDate: new Date(Number.NaN) }),
    });
    await expect(service.transactionHistory('sandbox', 'anchor'))
      .rejects.toThrow('apple_iap_server_transaction_signed_date_invalid');
    expect(client.getTransactionHistory).not.toHaveBeenCalled();
  });

  it.each([
    ['hasMore', { hasMore: undefined }, 'apple_iap_server_history_has_more_invalid'],
    ['signedTransactions', { signedTransactions: undefined }, 'apple_iap_server_history_transactions_invalid'],
  ])('rejects a history response without a valid %s field', async (_label, override, code) => {
    const client = {
      getTransactionInfo: vi.fn(async () => ({ signedTransactionInfo: 'signed-anchor' })),
      getTransactionHistory: vi.fn(async () => ({
        appAppleId: 1_234_567_890,
        bundleId: BUNDLE_ID,
        environment: Environment.SANDBOX,
        hasMore: false,
        revision: 'complete',
        signedTransactions: ['signed-anchor'],
        ...override,
      })),
      getTestNotificationStatus: vi.fn(),
      requestTestNotification: vi.fn(),
    } as AppleStoreServerApiClient;
    const service = apiService(client, { 'signed-anchor': transaction('anchor') });
    await expect(service.transactionHistory('sandbox', 'anchor')).rejects.toThrow(code);
  });

  it('requires a nonempty revision that advances every hasMore page', async () => {
    const getTransactionHistory = vi.fn()
      .mockResolvedValueOnce({
        appAppleId: 1_234_567_890,
        bundleId: BUNDLE_ID,
        environment: Environment.SANDBOX,
        hasMore: true,
        revision: 'revision-1',
        signedTransactions: ['signed-anchor'],
      })
      .mockResolvedValueOnce({
        appAppleId: 1_234_567_890,
        bundleId: BUNDLE_ID,
        environment: Environment.SANDBOX,
        hasMore: true,
        revision: 'revision-1',
        signedTransactions: [],
      });
    const client = {
      getTransactionInfo: vi.fn(async () => ({ signedTransactionInfo: 'signed-anchor' })),
      getTransactionHistory,
      getTestNotificationStatus: vi.fn(),
      requestTestNotification: vi.fn(),
    } as AppleStoreServerApiClient;
    const service = apiService(client, { 'signed-anchor': transaction('anchor') });
    await expect(service.transactionHistory('sandbox', 'anchor'))
      .rejects.toThrow('apple_iap_server_history_revision_invalid');
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
      getTestNotificationStatus: vi.fn(),
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
      getTestNotificationStatus: vi.fn(),
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
