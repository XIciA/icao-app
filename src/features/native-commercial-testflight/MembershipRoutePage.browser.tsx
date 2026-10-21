import { useRouter, type Href } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';
import { View } from 'react-native';
import { AccountScreen, AccountTopBar } from '@/components/account/account-ui';
import { AppText, Button, Card } from '@/components/ui';
import { isEdgeOneProductionWeb } from '@/config/web-runtime';
import { colors, spacing } from '@/theme';
import { useCommerceRuntime } from './CommerceRuntimeProvider';
import { MembershipPage } from './MembershipPage';
import { WebWechatCheckout } from './WebWechatCheckout.browser';

function WebMembership() {
  const commerce = useCommerceRuntime();
  const router = useRouter();
  const refresh = commerce.refresh;
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  const membership = commerce.entitlement?.membership;
  const loading = commerce.phase === 'loading' || commerce.phase === 'reconciling';
  const expiry = membership?.expiresAt ? new Date(membership.expiresAt) : undefined;
  return <AccountScreen>
    <AccountTopBar title="会员权益" />
    <View style={{ gap: spacing[4] }}>
      <Card elevated style={{ gap: spacing[3] }}>
        <AppText variant="sectionTitle">{!commerce.entitlement ? loading ? '正在确认会员状态' : '暂未确认会员状态' : membership?.active ? '会员已生效' : '当前未开通会员'}</AppText>
        {membership?.active && expiry && Number.isFinite(expiry.getTime())
          ? <AppText variant="caption">有效期至 {expiry.toLocaleString('zh-CN')}</AppText> : null}
        <AppText variant="caption">登录同一账号，网页与 APP 共享会员权益。</AppText>
      </Card>
      <Card style={{ gap: spacing[3] }}>
        <AppText variant="cardTitle">可用 AI 点数</AppText>
        <AppText color={colors.primary} variant="pageTitle">{commerce.entitlement?.aiPoints.available ?? '—'}</AppText>
        <AppText variant="caption">点数与学习记录跟随账号，在三端同步。</AppText>
      </Card>
      <WebWechatCheckout />
      {commerce.message ? <AppText accessibilityRole="alert" variant="caption">{commerce.message}</AppText> : null}
      <Button disabled={loading} variant="secondary" onPress={() => { void commerce.refresh(); }}>{loading ? '同步中…' : '重新同步权益'}</Button>
      <Button onPress={() => router.push('/download' as Href)}>下载 APP</Button>
    </View>
  </AccountScreen>;
}

export function MembershipRoutePage() {
  return isEdgeOneProductionWeb() ? <WebMembership /> : <MembershipPage />;
}
