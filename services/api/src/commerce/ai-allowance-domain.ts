import type { AiRuleChangeImpact, AiUsageRuleValues } from '@icao/contracts/commerce-rules';

export const WEEK_MS = 7 * 24 * 60 * 60 * 1_000;
export const INITIAL_AI_RULE_ID = '00000000-0000-4000-8000-000000000500';
export const INITIAL_AI_RULE: AiUsageRuleValues = {
  weeklyAllowance: 500,
  trialAllowance: 100,
  costs: {
    transcription: 5,
    grammar_correction: 3,
    opi_refinement: 5,
    transcription_grammar: 8,
    transcription_opi: 10,
  },
};

export function allowancePeriod(anchor: Date, now: Date) {
  const ordinal = Math.max(0, Math.floor((now.getTime() - anchor.getTime()) / WEEK_MS));
  const startsAt = new Date(anchor.getTime() + ordinal * WEEK_MS);
  return { ordinal, startsAt, endsAt: new Date(startsAt.getTime() + WEEK_MS) };
}

/** Each purchase keeps its promise; later benefits never make that promise worse. */
export function protectedMemberRule(purchased: AiUsageRuleValues, improvements: AiUsageRuleValues[]) {
  return improvements.reduce<AiUsageRuleValues>((rule, candidate) => ({
    weeklyAllowance: Math.max(rule.weeklyAllowance, candidate.weeklyAllowance),
    trialAllowance: rule.trialAllowance,
    costs: Object.fromEntries(Object.entries(rule.costs).map(([key, cost]) => [
      key, Math.min(cost, candidate.costs[key as keyof typeof candidate.costs]),
    ])) as AiUsageRuleValues['costs'],
  }), { ...purchased, costs: { ...purchased.costs } });
}

export function ruleChangeImpact(before: AiUsageRuleValues, after: AiUsageRuleValues): AiRuleChangeImpact[] {
  const changes: AiRuleChangeImpact[] = [];
  if (before.weeklyAllowance !== after.weeklyAllowance) changes.push({
    field: 'weeklyAllowance', before: before.weeklyAllowance, after: after.weeklyAllowance,
    audience: after.weeklyAllowance > before.weeklyAllowance ? 'all_members' : 'new_purchases',
  });
  if (before.trialAllowance !== after.trialAllowance) changes.push({
    field: 'trialAllowance', before: before.trialAllowance, after: after.trialAllowance,
    audience: 'eligible_new_accounts',
  });
  for (const key of Object.keys(before.costs) as Array<keyof AiUsageRuleValues['costs']>) {
    if (before.costs[key] !== after.costs[key]) changes.push({
      field: `costs.${key}`, before: before.costs[key], after: after.costs[key],
      audience: after.costs[key] < before.costs[key] ? 'all_members' : 'new_purchases',
    });
  }
  return changes;
}

export function remainingPercent(available: number, total: number) {
  return total > 0 ? Math.max(0, Math.min(100, available / total * 100)) : 0;
}
