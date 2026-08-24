import type { ApiConfig } from '../src/config';
import type { DatabaseService } from '../src/database/database.service';
import type { AppleStoreVerifier } from '../src/commerce/apple-store-verifier';
import type { VerifiedAppleTransaction } from '../src/commerce/commerce-domain';
import { CommerceService } from '../src/commerce/commerce.service';
import { VerificationException, VerificationStatus } from '@apple/app-store-server-library';
import { describe, expect, it, vi } from 'vitest';

const ACCOUNT_ID = '00000000-0000-4000-8000-000000000001';

function config(overrides: Partial<ApiConfig> = {}): ApiConfig {
  return {
    appleIapBundleId: 'com.readyoufife.ios',
    appleIapRootCertificates: [],
    ...overrides,
  } as ApiConfig;
}

function transaction(overrides: Partial<VerifiedAppleTransaction> = {}): VerifiedAppleTransaction {
  return {
    environment: 'production',
    transactionId: 'transaction-1',
    originalTransactionId: 'original-1',
    productId: 'com.readyoufife.ios.membership.7d.v1',
    bundleId: 'com.readyoufife.ios',
    appAccountToken: ACCOUNT_ID,
    purchaseDate: new Date(0),
    signedDate: new Date(0),
    productType: 'non_renewing_subscription',
    quantity: 1,
    signedPayloadHash: 'a'.repeat(64),
    decodedPayload: {},
    ...overrides,
  };
}

function service(verified: VerifiedAppleTransaction) {
  const verifier: AppleStoreVerifier = {
    verifyTransaction: vi.fn(async () => verified),
    verifyNotification: vi.fn(async () => { throw new Error('not_used'); }),
  };
  const transactionSpy = vi.fn();
  const database = { db: { transaction: transactionSpy } } as unknown as DatabaseService;
  return { instance: new CommerceService(config(), database, verifier), transactionSpy };
}

describe('CommerceService validation and catalog', () => {
  it('returns only fixed business metadata and delegates localized prices to StoreKit', () => {
    const { instance } = service(transaction());
    expect(instance.catalog()).toEqual({
      priceSource: 'storekit',
      products: expect.arrayContaining([
        expect.objectContaining({
          productKey: 'membership_31d_v1',
          storeProductId: 'com.readyoufife.ios.membership.31d.v1',
          durationDays: 31,
          autoRenews: false,
          recommended: true,
        }),
      ]),
    });
    expect(instance.catalog().products).toHaveLength(5);
    expect(instance.catalog().products.every((product) => !('price' in product))).toBe(true);
  });

  it.each([
    ['account', { appAccountToken: '00000000-0000-4000-8000-000000000002' }, 'apple_transaction_account_mismatch'],
    ['bundle', { bundleId: 'com.example.wrong' }, 'apple_transaction_bundle_mismatch'],
    ['product', { productId: 'com.example.wrong' }, 'apple_transaction_product_unsupported'],
    ['type', { productType: 'auto_renewable_subscription' as never }, 'apple_transaction_type_invalid'],
    ['quantity', { quantity: 2 as never }, 'apple_transaction_quantity_invalid'],
  ] as const)('rejects a signed transaction with wrong %s before database writes', async (_label, change, code) => {
    const { instance, transactionSpy } = service(transaction(change));
    await expect(instance.verifyAppleTransaction(ACCOUNT_ID, 'signed-transaction'))
      .rejects.toThrow(code);
    expect(transactionSpy).not.toHaveBeenCalled();
  });

  it('fails closed when the official verifier is unavailable', async () => {
    const unavailable: AppleStoreVerifier = {
      verifyTransaction: async () => { throw new Error('apple_commerce_not_configured'); },
      verifyNotification: async () => { throw new Error('apple_commerce_not_configured'); },
    };
    const database = { db: { transaction: vi.fn() } } as unknown as DatabaseService;
    await expect(new CommerceService(config(), database, unavailable)
      .verifyAppleTransaction(ACCOUNT_ID, 'signed-transaction'))
      .rejects.toMatchObject({
        status: 503,
        response: { message: 'apple_commerce_unavailable', statusCode: 503 },
      });
  });

  it('maps a retryable official verification failure to service unavailable', async () => {
    const unavailable: AppleStoreVerifier = {
      verifyTransaction: async () => {
        throw new VerificationException(VerificationStatus.RETRYABLE_VERIFICATION_FAILURE);
      },
      verifyNotification: async () => { throw new Error('not_used'); },
    };
    const database = { db: { transaction: vi.fn() } } as unknown as DatabaseService;
    await expect(new CommerceService(config(), database, unavailable)
      .verifyAppleTransaction(ACCOUNT_ID, 'signed-transaction'))
      .rejects.toMatchObject({
        status: 503,
        response: { message: 'apple_commerce_unavailable', statusCode: 503 },
      });
  });

  it('maps a definite official verification failure to an invalid transaction', async () => {
    const invalid: AppleStoreVerifier = {
      verifyTransaction: async () => {
        throw new VerificationException(VerificationStatus.VERIFICATION_FAILURE);
      },
      verifyNotification: async () => { throw new Error('not_used'); },
    };
    const database = { db: { transaction: vi.fn() } } as unknown as DatabaseService;
    await expect(new CommerceService(config(), database, invalid)
      .verifyAppleTransaction(ACCOUNT_ID, 'signed-transaction'))
      .rejects.toMatchObject({
        status: 400,
        response: { message: 'invalid_apple_transaction', statusCode: 400 },
      });
  });
});
