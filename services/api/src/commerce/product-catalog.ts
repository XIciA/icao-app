export const AI_POINT_RULE_VERSION = 'ai-points-v1' as const;

export type CommerceEnvironment = 'sandbox' | 'production';

export type MembershipProductKey =
  | 'membership_7d_v1'
  | 'membership_15d_v1'
  | 'membership_31d_v1'
  | 'membership_62d_v1'
  | 'membership_93d_v1';

export type MembershipProduct = Readonly<{
  productKey: MembershipProductKey;
  displayName: string;
  durationDays: 7 | 15 | 31 | 62 | 93;
  basePriceCnyFen: 6_800 | 10_800 | 16_800 | 29_800 | 39_800;
  appleProductId: string;
  aiPointRuleVersion: typeof AI_POINT_RULE_VERSION;
  aiPointBatches: readonly Readonly<{
    offsetDays: number;
    points: 250 | 500 | 1_000;
  }>[];
}>;

export const MEMBERSHIP_PRODUCTS = [
  {
    productKey: 'membership_7d_v1',
    displayName: '7天会员',
    durationDays: 7,
    basePriceCnyFen: 6_800,
    appleProductId: 'com.readyoufife.ios.membership.7d.v1',
    aiPointRuleVersion: AI_POINT_RULE_VERSION,
    aiPointBatches: [{ offsetDays: 0, points: 250 }],
  },
  {
    productKey: 'membership_15d_v1',
    displayName: '15天会员',
    durationDays: 15,
    basePriceCnyFen: 10_800,
    appleProductId: 'com.readyoufife.ios.membership.15d.v1',
    aiPointRuleVersion: AI_POINT_RULE_VERSION,
    aiPointBatches: [{ offsetDays: 0, points: 500 }],
  },
  {
    productKey: 'membership_31d_v1',
    displayName: '31天会员',
    durationDays: 31,
    basePriceCnyFen: 16_800,
    appleProductId: 'com.readyoufife.ios.membership.31d.v1',
    aiPointRuleVersion: AI_POINT_RULE_VERSION,
    aiPointBatches: [{ offsetDays: 0, points: 1_000 }],
  },
  {
    productKey: 'membership_62d_v1',
    displayName: '62天会员',
    durationDays: 62,
    basePriceCnyFen: 29_800,
    appleProductId: 'com.readyoufife.ios.membership.62d.v1',
    aiPointRuleVersion: AI_POINT_RULE_VERSION,
    aiPointBatches: [
      { offsetDays: 0, points: 1_000 },
      { offsetDays: 31, points: 1_000 },
    ],
  },
  {
    productKey: 'membership_93d_v1',
    displayName: '93天会员',
    durationDays: 93,
    basePriceCnyFen: 39_800,
    appleProductId: 'com.readyoufife.ios.membership.93d.v1',
    aiPointRuleVersion: AI_POINT_RULE_VERSION,
    aiPointBatches: [
      { offsetDays: 0, points: 1_000 },
      { offsetDays: 31, points: 1_000 },
      { offsetDays: 62, points: 1_000 },
    ],
  },
] as const satisfies readonly MembershipProduct[];

const productByKey = new Map<MembershipProductKey, MembershipProduct>(
  MEMBERSHIP_PRODUCTS.map((product) => [product.productKey, product]),
);
const productByAppleId = new Map<string, MembershipProduct>(
  MEMBERSHIP_PRODUCTS.map((product) => [product.appleProductId, product]),
);

export function membershipProductByKey(productKey: string): MembershipProduct | undefined {
  return productByKey.get(productKey as MembershipProductKey);
}

export function membershipProductByAppleId(productId: string): MembershipProduct | undefined {
  return productByAppleId.get(productId);
}

export function requireMembershipProductByAppleId(productId: string): MembershipProduct {
  const product = membershipProductByAppleId(productId);
  if (!product) throw new Error('unsupported_apple_product');
  return product;
}
