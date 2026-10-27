import type {
  CommerceOfferingKey,
  CommerceTransactionEnvironment,
} from './commerce-provider.native';

type MembershipProductDefinition = Readonly<{
  key: CommerceOfferingKey;
  appleProductId: string;
  title: string;
  durationDays: 7 | 15 | 31 | 62 | 93;
  recommended: boolean;
  /** CNY display reference only; the payment channel supplies the actual price. */
  originalPriceCny?: number;
  /** User-approved rounded display reference: CNY basis / 6.7171 (2026-10-27 SAFE rate).
   * This is not a StoreKit charge or a claim of historical USD sales. */
  referencePriceUsd?: number;
}>;

/** The sole Native mapping from stable business keys to permanent Apple IDs. */
const MEMBERSHIP_PRODUCTS: readonly MembershipProductDefinition[] = Object.freeze([
  Object.freeze({
    key: 'membership_7d_v1',
    appleProductId: 'com.readyoufife.ios.membership.7d.v1',
    title: '7天会员',
    durationDays: 7,
    recommended: false,
    originalPriceCny: 68,
    referencePriceUsd: 10,
  }),
  Object.freeze({
    key: 'membership_15d_v1',
    appleProductId: 'com.readyoufife.ios.membership.15d.v1',
    title: '15天会员',
    durationDays: 15,
    recommended: false,
  }),
  Object.freeze({
    key: 'membership_31d_v1',
    appleProductId: 'com.readyoufife.ios.membership.31d.v1',
    title: '31天会员',
    durationDays: 31,
    recommended: false,
    originalPriceCny: 158,
    referencePriceUsd: 23,
  }),
  Object.freeze({
    key: 'membership_62d_v1',
    appleProductId: 'com.readyoufife.ios.membership.62d.v1',
    title: '62天会员',
    durationDays: 62,
    recommended: false,
  }),
  Object.freeze({
    key: 'membership_93d_v1',
    appleProductId: 'com.readyoufife.ios.membership.93d.v1',
    title: '93天会员',
    durationDays: 93,
    recommended: false,
    originalPriceCny: 358,
    referencePriceUsd: 53,
  }),
]);

const PRODUCT_BY_KEY = new Map(MEMBERSHIP_PRODUCTS.map((product) => [product.key, product]));
const PRODUCT_BY_APPLE_ID = new Map(
  MEMBERSHIP_PRODUCTS.map((product) => [product.appleProductId, product]),
);
const ACTIVE_MEMBERSHIP_PRODUCTS = Object.freeze(MEMBERSHIP_PRODUCTS.filter((product) => [7, 31, 93].includes(product.durationDays)));

export const APPLE_MEMBERSHIP_PRODUCT_IDS = Object.freeze(
  ACTIVE_MEMBERSHIP_PRODUCTS.map((product) => product.appleProductId),
);

export function getMembershipProductByKey(
  key: CommerceOfferingKey,
): MembershipProductDefinition | undefined {
  return PRODUCT_BY_KEY.get(key);
}

export function getMembershipProductByAppleId(
  productId: string,
): MembershipProductDefinition | undefined {
  return PRODUCT_BY_APPLE_ID.get(productId);
}

export function listMembershipProducts(): readonly MembershipProductDefinition[] {
  return ACTIVE_MEMBERSHIP_PRODUCTS;
}

export function normalizeStoreKitEnvironment(
  environment: string | null | undefined,
): CommerceTransactionEnvironment {
  switch (environment?.trim().toLowerCase()) {
    case 'sandbox':
      return 'sandbox';
    case 'production':
      return 'production';
    case 'xcode':
      return 'xcode';
    default:
      return 'unknown';
  }
}
