import { useAppRouter as useRouter } from '@/components/navigation/useAppRouter';
import { GuideAnchor, useGuide, useGuideAvailability } from '@/features/usage-guide/GuideBindings';
import { Image } from 'expo-image';
import { ArrowRight, CalendarDays, FileText, WifiOff } from '@/components/ui/icons';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { TopBar } from '@/components/navigation/TopBar';
import { CenteredState } from '@/components/states/CenteredState';
import { AppText, Card, Screen, Tag } from '@/components/ui';
import { colors, radii, spacing } from '@/theme';

import { useResourceEditorial } from './use-editorial';

export function ResourceEditorialScreen() {
  const router = useRouter();
  const guide = useGuide();
  const state = useResourceEditorial();
  useGuideAvailability('resources', state.status === 'error' ? '资源加载失败，可在页面重新加载，也可以跳过教学。' : state.status === 'empty' ? '暂时没有资源文章，可跳过教学，稍后再来。' : undefined);
  return (
    <Screen scroll contentStyle={styles.screen} header={<TopBar title="资源分享" />}>
      {Platform.OS === 'web' ? <View style={styles.intro}>
        <AppText>经过来源核验和专业编辑的航空英语备考方法与学习资源。</AppText>
      </View> : null}
      {state.status === 'loading' ? <CenteredState description="正在获取最新资源文章。" title="加载中" /> : null}
      {state.status === 'empty' ? <CenteredState description="首篇文章正在准备中，请稍后再来。" icon={FileText} title="暂无资源" /> : null}
      {state.status === 'error' ? <CenteredState actionLabel="重新加载" description="暂时无法连接内容服务，请检查网络后重试。" onAction={state.retry} title="资源加载失败" tone="destructive" /> : null}
      {state.status === 'ready' ? (
        <View style={styles.list}>
          {state.warning ? (
            <View style={styles.cacheNotice}>
              <WifiOff color={colors.accent} size={16} />
              <AppText color={colors.foreground} style={styles.noticeText} variant="caption">网络不可用，正在显示上次缓存的内容。</AppText>
            </View>
          ) : null}
          {state.value.map((item) => (
            <Pressable
              accessibilityLabel={`阅读${item.title}`}
              key={item.slug}
              onPress={() => { guide?.event('resource-open'); router.push({ pathname: '/content/resources/[articleSlug]', params: { articleSlug: item.slug } }); }}
            >
              <GuideAnchor id="resource-open" /><Card style={styles.card}>
                {item.coverUrl ? <Image accessibilityLabel={item.cover.alt} contentFit="cover" source={{ uri: item.coverUrl }} style={styles.image} /> : <View style={styles.imageFallback}><FileText color={colors.primary} size={30} /></View>}
                <View style={styles.copy}>
                  <Tag>{item.badge}</Tag>
                  <AppText variant="cardTitle">{item.title}</AppText>
                  <AppText numberOfLines={3}>{item.summary}</AppText>
                  <View style={styles.meta}>
                    <CalendarDays color={colors.mutedForeground} size={14} />
                    <AppText variant="micro">{formatDate(item.publishedAt)}</AppText>
                    <View style={styles.spacer} />
                    <AppText color={colors.primary} variant="button">阅读全文</AppText>
                    <ArrowRight color={colors.primary} size={15} />
                  </View>
                </View>
              </Card>
            </Pressable>
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

function formatDate(value: string | null) {
  if (!value) return '发布前预览';
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'long' }).format(new Date(value));
}

const styles = StyleSheet.create({
  screen: { alignSelf: 'center', maxWidth: 430, paddingHorizontal: 0, width: '100%' },
  intro: { paddingHorizontal: spacing[4], paddingVertical: spacing[4] },
  list: { gap: spacing[3], paddingBottom: spacing[8] },
  card: { overflow: 'hidden', padding: 0 },
  image: { aspectRatio: 8 / 5, width: '100%' },
  imageFallback: { alignItems: 'center', aspectRatio: 8 / 5, backgroundColor: colors.primary06, justifyContent: 'center', width: '100%' },
  copy: { gap: spacing[2], padding: spacing[4] },
  meta: { alignItems: 'center', flexDirection: 'row', gap: spacing[2], marginTop: spacing[1] },
  spacer: { flex: 1 },
  cacheNotice: { alignItems: 'center', backgroundColor: 'rgba(183,118,16,0.10)', borderRadius: radii.lg, flexDirection: 'row', gap: spacing[2], padding: spacing[3] },
  noticeText: { flex: 1 },
});
