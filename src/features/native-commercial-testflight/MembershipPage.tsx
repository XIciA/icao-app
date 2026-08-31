import { RefreshCcw, ShieldCheck, Star, Zap } from '@/components/ui/icons';
import { StyleSheet, View } from 'react-native';

import {
  AccountScreen,
  AccountTopBar,
  Row,
  RowGroup,
  SectionLabel,
} from '@/components/account/account-ui';
import { AppText, Button, Card, Tag } from '@/components/ui';
import { colors, radii, spacing } from '@/theme';

import { useCommerceRuntime } from './CommerceRuntimeProvider';
import { membershipReleaseCopy } from './membership-release-copy';

function formatDate(value: string | null | undefined) {
  if (!value) return '未开通';
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return '同步中';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
}

export function MembershipPage() {
  const commerce = useCommerceRuntime();
  const working = commerce.phase === 'purchasing' || commerce.phase === 'restoring';
  const reconciling = commerce.phase === 'reconciling';
  const purchasePending = commerce.phase === 'pending';
  const loading = commerce.phase === 'loading';
  const purchaseDisabled = commerce.phase !== 'ready';
  // Pending blocks another purchase. Refresh and explicit Restore Purchases
  // remain available because either action can resolve the pending state.
  const managementDisabled = loading || working || reconciling;
  const active = commerce.entitlement?.membership.active === true;
  const statusMessage = commerce.error?.userMessage ?? commerce.message;

  return (
    <AccountScreen>
      <AccountTopBar title="会员与购买" />
      <Card elevated style={styles.hero}>
        <View style={styles.heroIcon}><ShieldCheck color={colors.primary} size={25} /></View>
        <View style={styles.flex}>
          <View style={styles.titleRow}>
            <AppText variant="sectionTitle">{active ? '会员已生效' : '开通会员'}</AppText>
            {commerce.entitlementEnvironment === 'sandbox' ? <Tag>{membershipReleaseCopy.sandboxLabel}</Tag> : null}
          </View>
          <AppText variant="caption">
            {active
              ? `有效期至 ${formatDate(commerce.entitlement?.membership.expiresAt)}`
              : '选择使用天数，一次购买一次生效，不会自动续期。'}
          </AppText>
        </View>
      </Card>

      <View style={styles.summary}>
        <Card style={styles.summaryCard}>
          <AppText color={colors.primary} variant="pageTitle">{commerce.entitlement?.aiPoints.available ?? 0}</AppText>
          <AppText variant="caption">可用 AI 点数</AppText>
        </Card>
        <Card style={styles.summaryCard}>
          <AppText color={active ? colors.primary : colors.mutedForeground} variant="sectionTitle">{active ? '使用中' : '未开通'}</AppText>
          <AppText variant="caption">会员状态</AppText>
        </Card>
      </View>

      <SectionLabel title="选择使用天数" />
      <View style={styles.offerings}>
        {commerce.offerings.map((offering) => (
          <Card key={offering.productKey} style={[styles.offering, offering.recommended ? styles.recommended : null]}>
            <View style={styles.flex}>
              <View style={styles.titleRow}>
                <AppText variant="sectionTitle">{offering.displayName}</AppText>
                {offering.recommended ? <Tag>推荐</Tag> : null}
              </View>
              <AppText variant="caption">购买后增加 {offering.durationDays} 天使用时间；重复购买会顺延。</AppText>
            </View>
            <Button
              disabled={purchaseDisabled}
              onPress={() => { void commerce.purchase(offering.productKey); }}
              size="sm"
            >
              {commerce.phase === 'purchasing'
                ? '处理中…'
                : purchasePending ? '等待确认' : offering.localizedPrice}
            </Button>
          </Card>
        ))}
        {!commerce.supported ? (
          <Card style={styles.notice}>
            <AppText variant="button">{membershipReleaseCopy.unsupportedTitle}</AppText>
            <AppText variant="caption">{membershipReleaseCopy.unsupportedDescription}</AppText>
          </Card>
        ) : null}
        {commerce.supported && commerce.offerings.length === 0 ? (
          <Card style={styles.notice}>
            <AppText variant="button">
              {loading
                ? '正在读取 App Store 商品…'
                : commerce.error?.code === 'catalog-invalid'
                  ? 'App Store 商品配置正在同步'
                  : '暂时无法读取 App Store 商品'}
            </AppText>
            <AppText variant="caption">
              {commerce.error?.retryable === false
                ? '商品信息尚未完全生效，请稍后再查看。'
                : '请确认网络和 App Store 账号状态后刷新。'}
            </AppText>
          </Card>
        ) : null}
      </View>

      {reconciling ? (
        <AppText style={styles.message} variant="caption">正在核对会员与购买记录…</AppText>
      ) : statusMessage ? (
        <AppText style={styles.message} variant="caption">{statusMessage}</AppText>
      ) : null}

      <SectionLabel title="购买管理" />
      <RowGroup>
        <Row
          icon={RefreshCcw}
          isLast={false}
          label={reconciling ? '正在核对会员与点数…' : '刷新会员与点数'}
          onPress={managementDisabled ? undefined : () => { void commerce.refresh(); }}
        />
        <Row
          icon={Zap}
          isLast
          label={commerce.phase === 'restoring' ? '正在恢复购买…' : '恢复购买'}
          onPress={managementDisabled ? undefined : () => { void commerce.restorePurchases(); }}
        />
      </RowGroup>

      <Card style={styles.rules}>
        <Star color={colors.primary} size={18} />
        <View style={styles.flex}>
          <AppText variant="button">购买说明</AppText>
          <AppText variant="caption">所有档位均为非自动续期商品。价格以 App Store 当前显示为准；购买成功后，会员时间会添加到现有有效期之后。</AppText>
        </View>
      </Card>
    </AccountScreen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', flexDirection: 'row', gap: spacing[3] },
  heroIcon: { alignItems: 'center', backgroundColor: colors.primary10, borderRadius: radii.xl, height: 52, justifyContent: 'center', width: 52 },
  flex: { flex: 1 },
  titleRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  summary: { flexDirection: 'row', gap: spacing[3], marginTop: spacing[3] },
  summaryCard: { alignItems: 'center', flex: 1, gap: spacing[1], paddingVertical: spacing[3] },
  offerings: { gap: spacing[3] },
  offering: { alignItems: 'center', flexDirection: 'row', gap: spacing[3] },
  recommended: { backgroundColor: colors.primary08, borderColor: colors.primary },
  notice: { gap: spacing[1] },
  message: { marginTop: spacing[3], textAlign: 'center' },
  rules: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing[3], marginTop: spacing[5] },
});
