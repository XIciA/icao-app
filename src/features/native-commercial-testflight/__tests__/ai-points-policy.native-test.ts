import {
  TESTFLIGHT_INTERNAL_AI_POINTS_POLICY,
  StaticNativeAiPointsPolicyProvider,
  assertValidNativeAiPointsPolicy,
  createTestFlightAiPointsPolicyProvider,
  type NativeAiPointsPolicy,
} from '../ai-points-policy.native';

describe('TestFlight internal AI-points policy', () => {
  it('keeps its placeholder status and lifecycle decisions explicit', () => {
    const policy = createTestFlightAiPointsPolicyProvider().getPolicy();

    expect(policy.scope).toBe('testflight_internal_placeholder');
    expect(policy.publicOffer).toBe(false);
    expect(policy.version).toBe('testflight-internal-v1');
    expect(policy.grantCycleDays).toBe(31);
    expect(policy.balanceLifecycle).toEqual({
      unusedBalanceExpiresAt: 'final_membership_expiry',
      repeatedPurchase: 'preserve_and_extend_to_new_final_expiry',
    });
  });

  it('uses positive integer values whose safeguards cover every operation', () => {
    const policy = TESTFLIGHT_INTERNAL_AI_POINTS_POLICY;
    const values = [
      policy.grants.newAccount,
      policy.grants.membershipCycle,
      ...Object.values(policy.operationCosts),
      policy.safeguards.maxReservedPointsPerOperation,
      policy.safeguards.maxDailyReservedPoints,
    ];

    expect(values.every((value) => Number.isInteger(value) && value > 0)).toBe(true);
    expect(policy.safeguards.maxReservedPointsPerOperation).toBeGreaterThanOrEqual(
      Math.max(...Object.values(policy.operationCosts)),
    );
    expect(policy.safeguards.maxDailyReservedPoints).toBeGreaterThanOrEqual(
      policy.safeguards.maxReservedPointsPerOperation,
    );
    expect(() => assertValidNativeAiPointsPolicy(policy)).not.toThrow();
  });

  it('accepts a separately versioned replacement through the swappable provider boundary', () => {
    const replacement: NativeAiPointsPolicy = {
      ...TESTFLIGHT_INTERNAL_AI_POINTS_POLICY,
      version: 'testflight-internal-v2',
      grants: {
        ...TESTFLIGHT_INTERNAL_AI_POINTS_POLICY.grants,
        membershipCycle: 1_200,
      },
    };

    const provider = new StaticNativeAiPointsPolicyProvider(replacement);

    expect(provider.getPolicy()).toBe(replacement);
    expect(provider.getPolicy().version).toBe('testflight-internal-v2');
  });

  it('rejects a policy that could promise public TestFlight allowances', () => {
    const invalidPolicy = {
      ...TESTFLIGHT_INTERNAL_AI_POINTS_POLICY,
      publicOffer: true,
    } as unknown as NativeAiPointsPolicy;

    expect(() => new StaticNativeAiPointsPolicyProvider(invalidPolicy)).toThrow(
      'ai_points_policy_must_remain_internal',
    );
  });
});
