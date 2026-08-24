export const TESTFLIGHT_AI_POINTS_POLICY_VERSION = 'testflight-internal-v1' as const;

export type AiPointOperation = 'static_word_lookup' | 'speech_transcription' | 'speaking_feedback';

export type NativeAiPointsPolicy = Readonly<{
  version: string;
  scope: 'testflight_internal_placeholder';
  publicOffer: false;
  grantCycleDays: number;
  grants: Readonly<{
    newAccount: number;
    membershipCycle: number;
  }>;
  operationCosts: Readonly<Record<AiPointOperation, number>>;
  safeguards: Readonly<{
    maxReservedPointsPerOperation: number;
    maxDailyReservedPoints: number;
  }>;
  balanceLifecycle: Readonly<{
    unusedBalanceExpiresAt: 'final_membership_expiry';
    repeatedPurchase: 'preserve_and_extend_to_new_final_expiry';
  }>;
}>;

export interface NativeAiPointsPolicyProvider {
  getPolicy(): NativeAiPointsPolicy;
}

/**
 * Internal engineering preset only. These values are deliberately not a
 * customer-facing allowance, price, promise, or final commercial policy.
 */
export const TESTFLIGHT_INTERNAL_AI_POINTS_POLICY: NativeAiPointsPolicy = Object.freeze({
  version: TESTFLIGHT_AI_POINTS_POLICY_VERSION,
  scope: 'testflight_internal_placeholder',
  publicOffer: false,
  grantCycleDays: 31,
  grants: Object.freeze({
    newAccount: 100,
    membershipCycle: 1_000,
  }),
  operationCosts: Object.freeze({
    static_word_lookup: 0,
    speech_transcription: 5,
    speaking_feedback: 10,
  }),
  safeguards: Object.freeze({
    maxReservedPointsPerOperation: 20,
    maxDailyReservedPoints: 300,
  }),
  balanceLifecycle: Object.freeze({
    unusedBalanceExpiresAt: 'final_membership_expiry',
    repeatedPurchase: 'preserve_and_extend_to_new_final_expiry',
  }),
});

function isPositiveInteger(value: number) {
  return Number.isInteger(value) && value > 0;
}

export function assertValidNativeAiPointsPolicy(policy: NativeAiPointsPolicy): void {
  const positivePointValues = [
    policy.grantCycleDays,
    policy.grants.newAccount,
    policy.grants.membershipCycle,
    policy.operationCosts.speech_transcription,
    policy.operationCosts.speaking_feedback,
    policy.safeguards.maxReservedPointsPerOperation,
    policy.safeguards.maxDailyReservedPoints,
  ];

  if (!policy.version.trim()) {
    throw new Error('ai_points_policy_version_required');
  }
  if (policy.scope !== 'testflight_internal_placeholder' || policy.publicOffer !== false) {
    throw new Error('ai_points_policy_must_remain_internal');
  }
  if (!positivePointValues.every(isPositiveInteger)) {
    throw new Error('ai_points_policy_values_must_be_positive_integers');
  }
  if (policy.operationCosts.static_word_lookup !== 0) {
    throw new Error('static_word_lookup_must_remain_free');
  }

  const highestOperationCost = Math.max(...Object.values(policy.operationCosts));
  if (policy.safeguards.maxReservedPointsPerOperation < highestOperationCost) {
    throw new Error('ai_points_policy_operation_reservation_too_small');
  }
  if (
    policy.safeguards.maxDailyReservedPoints
    < policy.safeguards.maxReservedPointsPerOperation
  ) {
    throw new Error('ai_points_policy_daily_reservation_too_small');
  }
}

export class StaticNativeAiPointsPolicyProvider implements NativeAiPointsPolicyProvider {
  constructor(private readonly policy: NativeAiPointsPolicy) {
    assertValidNativeAiPointsPolicy(policy);
  }

  getPolicy(): NativeAiPointsPolicy {
    return this.policy;
  }
}

export function createTestFlightAiPointsPolicyProvider(
  policy: NativeAiPointsPolicy = TESTFLIGHT_INTERNAL_AI_POINTS_POLICY,
): NativeAiPointsPolicyProvider {
  return new StaticNativeAiPointsPolicyProvider(policy);
}
