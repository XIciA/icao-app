/** CNY list-price estimate, verified 2026-09-13. Not the provider's actual bill.
 * https://api-docs.deepseek.com/zh-cn/quick_start/pricing/
 * https://cloud.tencent.com/document/product/1093/35686
 * Input cache hits are not retained: estimate all input at cache-miss price.
 */
export function estimateCostMicrounits(input: {
  model: string; status: string; inputTokens?: number; outputTokens?: number;
  audioDurationSeconds?: number; at?: Date;
}): number | null {
  if (input.status !== 'success') return null;
  const audioRates: Record<string, number> = { '16k_en': 1.75, '16k_en_large': 2.4, '16k_zh_en_2.0': 0.8 };
  const rate = audioRates[input.model];
  if (rate !== undefined) {
    const seconds = input.audioDurationSeconds;
    return seconds != null && Number.isFinite(seconds) && seconds >= 0
      ? Math.ceil(Math.ceil(seconds) * rate * 1_000_000 / 3600) : null;
  }
  if (!['deepseek-flash', 'deepseek-v4-flash'].includes(input.model)
    || input.inputTokens == null || input.outputTokens == null) return null;
  const beijing = new Date((input.at ?? new Date()).getTime() + 8 * 3600000);
  const hour = beijing.getUTCHours(), day = beijing.getUTCDay();
  const peak = day >= 1 && day <= 5 && ((hour >= 9 && hour < 12) || (hour >= 14 && hour < 18));
  return Math.ceil((input.inputTokens + input.outputTokens * 4) * (peak ? 2 : 1));
}
