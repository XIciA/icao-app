export const AI_POINT_RULE_VERSION = 'ai-points-v1' as const;
export const AI_POINT_BATCH_INTERVAL_DAYS = 31 as const;

export type CommerceEnvironment = 'sandbox' | 'production';
export type CommerceChannel = 'apple_app_store' | 'alipay' | 'wechat_pay';

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
  basePriceCnyFen: number;
  appleProductId: string;
  aiPointRuleVersion: typeof AI_POINT_RULE_VERSION;
  aiPointBatchIntervalDays: typeof AI_POINT_BATCH_INTERVAL_DAYS;
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
    aiPointBatchIntervalDays: AI_POINT_BATCH_INTERVAL_DAYS,
    aiPointBatches: [{ offsetDays: 0, points: 250 }],
  },
  {
    productKey: 'membership_15d_v1',
    displayName: '15天会员',
    durationDays: 15,
    basePriceCnyFen: 10_800,
    appleProductId: 'com.readyoufife.ios.membership.15d.v1',
    aiPointRuleVersion: AI_POINT_RULE_VERSION,
    aiPointBatchIntervalDays: AI_POINT_BATCH_INTERVAL_DAYS,
    aiPointBatches: [{ offsetDays: 0, points: 500 }],
  },
  {
    productKey: 'membership_31d_v1',
    displayName: '31天会员',
    durationDays: 31,
    basePriceCnyFen: 15_800,
    appleProductId: 'com.readyoufife.ios.membership.31d.v1',
    aiPointRuleVersion: AI_POINT_RULE_VERSION,
    aiPointBatchIntervalDays: AI_POINT_BATCH_INTERVAL_DAYS,
    aiPointBatches: [{ offsetDays: 0, points: 1_000 }],
  },
  {
    productKey: 'membership_62d_v1',
    displayName: '62天会员',
    durationDays: 62,
    basePriceCnyFen: 29_800,
    appleProductId: 'com.readyoufife.ios.membership.62d.v1',
    aiPointRuleVersion: AI_POINT_RULE_VERSION,
    aiPointBatchIntervalDays: AI_POINT_BATCH_INTERVAL_DAYS,
    aiPointBatches: [
      { offsetDays: 0, points: 1_000 },
      { offsetDays: 31, points: 1_000 },
    ],
  },
  {
    productKey: 'membership_93d_v1',
    displayName: '93天会员',
    durationDays: 93,
    basePriceCnyFen: 35_800,
    appleProductId: 'com.readyoufife.ios.membership.93d.v1',
    aiPointRuleVersion: AI_POINT_RULE_VERSION,
    aiPointBatchIntervalDays: AI_POINT_BATCH_INTERVAL_DAYS,
    aiPointBatches: [
      { offsetDays: 0, points: 1_000 },
      { offsetDays: 31, points: 1_000 },
      { offsetDays: 62, points: 1_000 },
    ],
  },
] as const satisfies readonly MembershipProduct[];

/** Historical IDs stay verifiable; these are the only offerings still sold. */
export const ACTIVE_MEMBERSHIP_PRODUCTS = MEMBERSHIP_PRODUCTS.filter(
  (product) => [7, 31, 93].includes(product.durationDays),
);

// Temporary Android payment-verification offering approved on 2026-09-19.
// Disable here after acceptance; historical orders retain their saved terms.
export const WECHAT_DAY_PASS_ENABLED = true;
export const WECHAT_MEMBERSHIP_PRODUCTS = [
  ...(WECHAT_DAY_PASS_ENABLED ? [{ productKey: 'membership_1d_v1', displayName: '1天会员', durationDays: 1, basePriceCnyFen: 100 }] : []),
  ...ACTIVE_MEMBERSHIP_PRODUCTS,
];

export const COMMERCE_CHANNEL_PRODUCTS = MEMBERSHIP_PRODUCTS.map((product) => ({
  channel: 'apple_app_store' as const,
  externalProductId: product.appleProductId,
  productKey: product.productKey,
}));

const productByKey = new Map<MembershipProductKey, MembershipProduct>(
  MEMBERSHIP_PRODUCTS.map((product) => [product.productKey, product]),
);
const productKeyByChannelId = new Map<string, MembershipProductKey>(
  COMMERCE_CHANNEL_PRODUCTS.map((mapping) => (
    [`${mapping.channel}:${mapping.externalProductId}`, mapping.productKey]
  )),
);

export function membershipProductByKey(productKey: string): MembershipProduct | undefined {
  return productByKey.get(productKey as MembershipProductKey);
}

export function requireMembershipProductByKey(productKey: string): MembershipProduct {
  const product = membershipProductByKey(productKey);
  if (!product) throw new Error('unsupported_membership_product');
  return product;
}

export function membershipProductForChannel(
  channel: CommerceChannel,
  externalProductId: string,
): MembershipProduct | undefined {
  const productKey = productKeyByChannelId.get(`${channel}:${externalProductId}`);
  return productKey ? productByKey.get(productKey) : undefined;
}

export function requireMembershipProductForChannel(
  channel: CommerceChannel,
  externalProductId: string,
): MembershipProduct {
  const product = membershipProductForChannel(channel, externalProductId);
  if (!product) throw new Error('unsupported_channel_product');
  return product;
}

export function membershipProductByAppleId(productId: string): MembershipProduct | undefined {
  return membershipProductForChannel('apple_app_store', productId);
}

export function requireMembershipProductByAppleId(productId: string): MembershipProduct {
  return requireMembershipProductForChannel('apple_app_store', productId);
}
