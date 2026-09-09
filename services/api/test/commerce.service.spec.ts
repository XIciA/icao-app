import type { ApiConfig } from '../src/config';
import type { DatabaseService } from '../src/database/database.service';
import type { AppleStoreVerifier } from '../src/commerce/apple-store-verifier';
import type { VerifiedAppleNotification, VerifiedAppleTransaction } from '../src/commerce/commerce-domain';
import { CommerceService } from '../src/commerce/commerce.service';
import type { PersistentCommerceBenefitsService } from '../src/commerce/persistent-commerce-benefits.service';
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

function notification(overrides: Partial<VerifiedAppleNotification> = {}): VerifiedAppleNotification {
  return {
    environment: 'production',
    notificationUuid: '00000000-0000-4000-8000-000000000010',
    notificationType: 'REFUND',
    signedDate: new Date(1),
    signedPayloadHash: 'b'.repeat(64),
    decodedPayload: {},
    transaction: transaction(),
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

function reconciliationService(verified: VerifiedAppleTransaction, status: 'refunded' | 'revoked' | 'verified') {
  const verifier: AppleStoreVerifier = {
    verifyTransaction: vi.fn(async () => verified),
    verifyNotification: vi.fn(async () => { throw new Error('not_used'); }),
  };
  const existingTransaction = {
    id: '00000000-0000-4000-8000-000000000010',
    orderId: '00000000-0000-4000-8000-000000000011',
    accountId: ACCOUNT_ID,
    appAccountToken: ACCOUNT_ID,
    productId: verified.productId,
    originalTransactionId: verified.originalTransactionId,
    bundleId: verified.bundleId,
    purchaseDate: verified.purchaseDate,
    signedDate: new Date(0),
    signedPayloadHash: 'a'.repeat(64),
  };
  const existingOrder = { id: existingTransaction.orderId, status };
  const selections = [
    [existingTransaction],
    [existingOrder],
    [{ status: 'active' }],
    [existingOrder],
  ];
  const updateWhere = vi.fn(async () => []);
  const update = vi.fn(() => ({ set: vi.fn(() => ({ where: updateWhere })) }));
  const transactionContext = {
    execute: vi.fn(async () => []),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => selections.shift() ?? []),
        })),
      })),
    })),
    update,
  };
  const database = {
    db: { transaction: vi.fn(async (operation) => operation(transactionContext)) },
  } as unknown as DatabaseService;
  const revokeOrderBenefits = vi.fn(async () => undefined);
  const benefits = { revokeOrderBenefits } as unknown as PersistentCommerceBenefitsService;
  const instance = new CommerceService(config(), database, verifier, benefits);
  Object.defineProperty(instance, 'rebuildMembership', {
    value: vi.fn(async () => undefined),
  });
  return { instance, revokeOrderBenefits, update };
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
          recommended: false,
        }),
      ]),
    });
    expect(instance.catalog().products.map((product) => product.durationDays)).toEqual([7, 31, 93]);
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

  it('rejects a notification whose verified transaction crosses environments before database writes', async () => {
    const verifier: AppleStoreVerifier = {
      verifyTransaction: async () => transaction(),
      verifyNotification: async () => notification({
        transaction: transaction({ environment: 'sandbox' }),
      }),
    };
    const transactionSpy = vi.fn();
    const database = { db: { transaction: transactionSpy } } as unknown as DatabaseService;
    await expect(new CommerceService(config(), database, verifier)
      .processAppleNotification('signed-notification'))
      .rejects.toMatchObject({
        status: 400,
        response: { message: 'apple_notification_environment_mismatch', statusCode: 400 },
      });
    expect(transactionSpy).not.toHaveBeenCalled();
  });

  it('maps a definite notification signature failure to bad request', async () => {
    const verifier: AppleStoreVerifier = {
      verifyTransaction: async () => transaction(),
      verifyNotification: async () => {
        throw new VerificationException(VerificationStatus.VERIFICATION_FAILURE);
      },
    };
    const transactionSpy = vi.fn();
    const database = { db: { transaction: transactionSpy } } as unknown as DatabaseService;
    await expect(new CommerceService(config(), database, verifier)
      .processAppleNotification('signed-notification'))
      .rejects.toMatchObject({
        status: 400,
        response: { message: 'invalid_apple_notification', statusCode: 400 },
      });
    expect(transactionSpy).not.toHaveBeenCalled();
  });

  it('asks Apple to retry a transient notification verification failure', async () => {
    const verifier: AppleStoreVerifier = {
      verifyTransaction: async () => transaction(),
      verifyNotification: async () => {
        throw new VerificationException(VerificationStatus.RETRYABLE_VERIFICATION_FAILURE);
      },
    };
    const transactionSpy = vi.fn();
    const database = { db: { transaction: transactionSpy } } as unknown as DatabaseService;
    await expect(new CommerceService(config(), database, verifier)
      .processAppleNotification('signed-notification'))
      .rejects.toMatchObject({
        status: 503,
        response: { message: 'apple_commerce_unavailable', statusCode: 503 },
      });
    expect(transactionSpy).not.toHaveBeenCalled();
  });

  it('reports a server refund without writes in dry-run, then reuses refund idempotency on apply', async () => {
    const refunded = transaction({
      revocationDate: new Date(2),
      signedDate: new Date(3),
      signedPayloadHash: 'c'.repeat(64),
    });
    const dryRun = reconciliationService(refunded, 'verified');
    await expect(dryRun.instance.reconcileAppleServerTransaction(
      'signed-refund',
      'production',
      false,
    )).resolves.toMatchObject({
      action: 'refund',
      appleStatus: 'refunded',
      applied: false,
      localStatus: 'verified',
      mismatch: true,
    });
    expect(dryRun.update).not.toHaveBeenCalled();
    expect(dryRun.revokeOrderBenefits).not.toHaveBeenCalled();

    const apply = reconciliationService(refunded, 'verified');
    await expect(apply.instance.reconcileAppleServerTransaction(
      'signed-refund',
      'production',
      true,
    )).resolves.toMatchObject({ action: 'refund', applied: true });
    expect(apply.update).toHaveBeenCalled();
    expect(apply.revokeOrderBenefits).toHaveBeenCalledTimes(1);
  });

  it('treats an already-current server transaction as a replay without writes', async () => {
    const replay = reconciliationService(transaction(), 'verified');
    await expect(replay.instance.reconcileAppleServerTransaction(
      'signed-transaction',
      'production',
      true,
      new Date(10),
    )).resolves.toMatchObject({ action: 'none', applied: false, mismatch: false });
    expect(replay.update).not.toHaveBeenCalled();
    expect(replay.revokeOrderBenefits).not.toHaveBeenCalled();
  });
});
