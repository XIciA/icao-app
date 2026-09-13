import { COMMERCE_ENVIRONMENT_HEADER } from '@icao/contracts';
import type { AiAllowanceResponse, AiAllowanceSummary } from '@icao/contracts/commerce-rules';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState, useSyncExternalStore } from 'react';
import { AppState, StyleSheet, View } from 'react-native';

import { AppText, Card } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { subscribeCommerceEntitlementChanges } from '@/features/native-commercial-testflight/commerce-entitlement-events';
import { getNativeCommerceEnvironmentState, subscribeNativeCommerceEnvironment } from '@/features/native-commercial-testflight/commerce-environment.native';
import { apiRequest } from '@/platform/api-client';
import { colors, radii, spacing } from '@/theme';

function localTime(value: string) {
  const date = new Date(value);
  return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function allowanceCopy(allowance: AiAllowanceSummary) {
  const percent = allowance.remainingPercent;
  const amount = percent > 0 && percent < 1 ? '不足1%' : `${Math.floor(percent)}%`;
  if ((allowance.mode === 'unavailable' || allowance.mode === 'expired')
    && allowance.bonus && Number.isFinite(allowance.bonus.available) && allowance.bonus.available > 0) {
    return { title: 'AI学习额度', value: '赠送额度可用',
      detail: allowance.bonus.expiresAt ? `最早到期：${localTime(allowance.bonus.expiresAt)}` : '' };
  }
  if (allowance.mode === 'expired') return { title: 'AI 每周使用限额', value: '会员已到期', detail: '' };
  if (allowance.mode === 'unavailable' && allowance.reason === 'trial_already_claimed') {
    return { title: 'AI体验额度', value: '体验额度已领取', detail: '注销后重新注册不再赠送' };
  }
  if (allowance.mode === 'unavailable') return { title: 'AI 每周使用限额', value: '暂时无法读取', detail: '' };
  if (allowance.mode === 'trial') return { title: 'AI 体验剩余', value: amount, detail: '一次性体验，用完不再补充' };
  const expires = allowance.membershipExpiresAt;
  const reset = allowance.resetAt;
  const detail = expires && (!reset || Date.parse(expires) <= Date.parse(reset))
    ? `会员到期：${localTime(expires)}`
    : reset ? `重置时间：${localTime(reset)}` : '';
  return { title: 'AI 每周使用限额', value: `剩余 ${amount}`, detail };
}

/** A read-only view of the existing account/environment allowance owner. */
export function AiAllowanceCard() {
  const { account, accountReady } = useAuth();
  const environment = useSyncExternalStore(subscribeNativeCommerceEnvironment, getNativeCommerceEnvironmentState);
  const accountId = accountReady ? account?.accountId : undefined;
  const ownerKey = `${accountId ?? ''}:${environment.environment}:${environment.generation}`;
  const ready = !!accountId && environment.accountId === accountId && environment.status === 'active';
  const [result, setResult] = useState<{ key: string; allowance?: AiAllowanceSummary; failed?: boolean }>();

  useFocusEffect(useCallback(() => {
    if (!ready) return;
    let active = true;
    let requestId = 0;
    let controller: AbortController | undefined;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    async function refresh() {
      const request = ++requestId;
      controller?.abort();
      clearTimeout(refreshTimer);
      const nextController = new AbortController();
      controller = nextController;
      try {
        const response = await apiRequest<AiAllowanceResponse>('/v1/commerce/allowance/current', {
          headers: { [COMMERCE_ENVIRONMENT_HEADER]: environment.environment }, signal: nextController.signal,
        });
        const value = response.allowance;
        if (response.environment !== environment.environment || !value || !Number.isFinite(value.remainingPercent)
          || value.remainingPercent < 0 || value.remainingPercent > 100) throw new Error('invalid_allowance');
        if (!active || request !== requestId) return;
        setResult({ key: ownerKey, allowance: value });
        // Use the service clock for refresh boundaries, never infer a grant from the device clock.
        const next = [value.resetAt, value.membershipExpiresAt, value.bonus?.expiresAt].filter((time): time is string => !!time)
          .map((time) => Date.parse(time) - Date.parse(response.serverTime)).filter((delay) => delay > 0);
        refreshTimer = setTimeout(() => { void refresh(); }, Math.min(...next, 30_000) + 500);
      } catch {
        if (active && request === requestId) setResult({ key: ownerKey, failed: true });
      }
    }
    void refresh();
    const appState = AppState.addEventListener('change', (state) => { if (state === 'active') void refresh(); });
    const unsubscribe = subscribeCommerceEntitlementChanges((change) => {
      if (change.accountId === accountId && change.environment === environment.environment) void refresh();
    });
    return () => { active = false; controller?.abort(); clearTimeout(refreshTimer); appState.remove(); unsubscribe(); };
  }, [accountId, environment.environment, ownerKey, ready]));

  const visible = ready && result?.key === ownerKey ? result : undefined;
  const allowance = visible?.allowance;
  const copy = allowance ? allowanceCopy(allowance) : {
    title: 'AI 每周使用限额', value: visible?.failed ? '暂时无法读取' : '正在读取…', detail: '',
  };
  const showProgress = allowance && (allowance.mode === 'weekly' || allowance.mode === 'trial');
  return <Card style={styles.card}>
    <View style={styles.row}>
      <AppText style={styles.title}>{copy.title}</AppText>
      <AppText style={styles.value} variant="caption">{copy.value}</AppText>
    </View>
    {showProgress ? <View accessible accessibilityRole="progressbar" accessibilityLabel={copy.title}
      accessibilityValue={{ min: 0, max: 100, now: allowance.remainingPercent, text: copy.value }} style={styles.track}>
      <View style={[styles.fill, { width: `${allowance.remainingPercent}%` }]} />
    </View> : null}
    {showProgress && allowance?.bonus && Number.isFinite(allowance.bonus.available) && allowance.bonus.available > 0 ? <AppText style={styles.detail} variant="caption">额外赠送额度可用{allowance.bonus.expiresAt ? ` · 最早到期：${localTime(allowance.bonus.expiresAt)}` : ''}</AppText> : null}
    {copy.detail ? <AppText style={styles.detail} variant="caption">{copy.detail}</AppText> : null}
  </Card>;
}

const styles = StyleSheet.create({
  card: { marginTop: spacing[3] },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing[2] },
  title: { flexGrow: 1 },
  value: { color: colors.primary },
  track: { backgroundColor: colors.primary10, height: 6, borderRadius: radii.full, marginTop: spacing[3], overflow: 'hidden' },
  fill: { backgroundColor: colors.primary, height: '100%', borderRadius: radii.full },
  detail: { marginTop: spacing[2] },
});
