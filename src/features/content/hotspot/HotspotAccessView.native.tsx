import { hotspotCenters, hotspotSources } from '@icao/contracts/app-content';
import { Calendar, MapPin } from '@/components/ui/icons';
import { StyleSheet, View } from 'react-native';
import { CenteredState } from '@/components/states/CenteredState';
import { AppText, Card, Tag } from '@/components/ui';
import { colors, fonts, spacing } from '@/theme';
import type { HotspotAccessResult } from './access-state.native';
import type { OpiHotspotBrief } from './types';

type UnavailableResult = Exclude<HotspotAccessResult, { status: 'ready' }>;

export function HotspotBriefCard({ brief }: { brief: OpiHotspotBrief }) {
  const totalQuestions = brief.topics.reduce((sum, topic) => sum + topic.cardIds.length, 0);
  return (
    <Card style={styles.heroCard}>
      <View style={styles.heroBadge}>
        <Calendar color={colors.primary} size={16} />
        <AppText color={colors.primary} style={styles.heroDateText} variant="caption">
          每日考点反馈
        </AppText>
      </View>
      <AppText style={styles.heroTitle} variant="pageTitle">{brief.title}</AppText>
      <View style={styles.tagsRow}>
        {hotspotCenters(brief).map((center) => <Tag key={center}><MapPin size={11} /> {center}</Tag>)}
      </View>
      <AppText>
        本日汇总 {hotspotSources(brief).length} 份反馈，共 {totalQuestions} 道题。
      </AppText>
    </Card>
  );
}

export function HotspotAccessNotice({
  result,
  onMembership,
  onRetry,
  onReturn,
}: {
  result: UnavailableResult;
  onMembership: () => void;
  onRetry: () => void;
  onReturn?: () => void;
}) {
  if (result.status === 'membership-required') {
    return (
      <CenteredState onReturn={onReturn}
        actionLabel="查看会员"
        onAction={onMembership}
        kind="membership"
      />
    );
  }
  if (result.status === 'offline-authorization-expired') {
    return (
      <CenteredState onReturn={onReturn}
        actionLabel="重新验证"
        onAction={onRetry}
        kind="verification"
      />
    );
  }
  if (result.status === 'network-error') {
    return (
      <CenteredState onReturn={onReturn}
        actionLabel="重试"
        onAction={onRetry}
        kind="failure"
      />
    );
  }
  if (result.status === 'not-found') {
    return (
      <CenteredState onReturn={onReturn}
        kind="unavailable"
      />
    );
  }
  return (
    <CenteredState onReturn={onReturn}
      actionLabel="重新检查"
      onAction={onRetry}
      kind="failure"
    />
  );
}

const styles = StyleSheet.create({
  heroCard: { gap: spacing[2], marginTop: spacing[2], padding: spacing[5] },
  heroBadge: { alignItems: 'center', flexDirection: 'row', gap: spacing[1.5] },
  heroDateText: { fontFamily: fonts.monoRegular, fontSize: 12 },
  heroTitle: { fontSize: 22 },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[1.5] },
  secondaryAction: { marginTop: spacing[3], minWidth: 160 },
});
