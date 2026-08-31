import {
  AlertTriangle,
  Calendar,
  FileQuestion,
  MapPin,
  Shield,
  WifiOff,
} from '@/components/ui/icons';
import { StyleSheet, View } from 'react-native';

import { CenteredState } from '@/components/states/CenteredState';
import { AppText, Button, Card, Tag } from '@/components/ui';
import { colors, fonts, spacing } from '@/theme';

import type { HotspotAccessResult } from './access-state';
import type { OpiHotspotBrief } from './types';

type UnavailableResult = Exclude<HotspotAccessResult, { status: 'ready' }>;

export function HotspotBriefCard({ brief }: { brief: OpiHotspotBrief }) {
  const totalQuestions = brief.topics.reduce((sum, topic) => sum + topic.cardIds.length, 0);
  return (
    <Card style={styles.heroCard}>
      <View style={styles.heroBadge}>
        <Calendar color={colors.primary} size={16} />
        <AppText color={colors.primary} style={styles.heroDateText} variant="caption">
          {brief.date} 考点归档
        </AppText>
      </View>
      <AppText style={styles.heroTitle} variant="pageTitle">{brief.title}</AppText>
      <View style={styles.tagsRow}>
        {brief.centers.map((center) => <Tag key={center}><MapPin size={11} /> {center}</Tag>)}
      </View>
      <AppText>
        本期包含 {brief.topics.length} 个考试话题，共 {totalQuestions} 道抽样练习题。
      </AppText>
    </Card>
  );
}

export function HotspotAccessNotice({
  result,
  onMembership,
  onRetry,
}: {
  result: UnavailableResult;
  onMembership: () => void;
  onRetry: () => void;
}) {
  if (result.status === 'membership-required') {
    return (
      <CenteredState
        actionLabel="查看会员"
        description="热点摘要可以公开查看；完整题目与练习需要当前账号具备会员权益。"
        icon={Shield}
        onAction={onMembership}
        secondary={(
          <View style={styles.secondaryAction}>
            <Button accessibilityLabel="刷新热点会员权益" onPress={onRetry} variant="outline">
              刷新权益
            </Button>
          </View>
        )}
        title="完整练习需会员"
      />
    );
  }
  if (result.status === 'offline-authorization-expired') {
    return (
      <CenteredState
        actionLabel="联网后重新验证"
        description="本机离线授权已到期。学习记录仍会保留，请联网确认会员状态后继续。"
        icon={WifiOff}
        onAction={onRetry}
        title="需要联网验证会员状态"
      />
    );
  }
  if (result.status === 'network-error') {
    return (
      <CenteredState
        actionLabel="重新加载"
        description="暂时无法连接内容服务，请检查网络后重试。"
        icon={WifiOff}
        onAction={onRetry}
        title="网络连接不稳定"
      />
    );
  }
  if (result.status === 'not-found') {
    return (
      <CenteredState
        description="该热点资讯不存在、已更新或已经下线。"
        icon={FileQuestion}
        title="无法打开热点资讯"
      />
    );
  }
  const requestId = result.requestId ? ` 服务请求编号：${result.requestId}` : '';
  return (
    <CenteredState
      actionLabel="重新检查"
      description={`内容服务暂时无法提供这期练习，请稍后重试。${requestId}`}
      icon={AlertTriangle}
      onAction={onRetry}
      title="热点内容暂不可用"
      tone="accent"
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
