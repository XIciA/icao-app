import type { EditorialBlock } from '@icao/contracts';
import { Image } from 'expo-image';
import { ExternalLink, FileQuestion, WifiOff } from '@/components/ui/icons';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { TopBar } from '@/components/navigation/TopBar';
import { CenteredState } from '@/components/states/CenteredState';
import { AppText, Screen, Tag } from '@/components/ui';
import { colors, fonts, radii, spacing } from '@/theme';

import { useEditorialArticle } from './use-editorial';

export function EditorialArticleScreen({ slug }: { slug: string }) {
  const state = useEditorialArticle(slug);
  if (state.status === 'loading') return <Screen header={<TopBar title="资源文章" />}><CenteredState description="正在加载文章正文。" title="加载中" /></Screen>;
  if (state.status === 'empty') return <Screen header={<TopBar title="资源文章" />}><CenteredState description="这篇文章不存在或已撤回。" icon={FileQuestion} title="未找到文章" /></Screen>;
  if (state.status === 'error') return <Screen header={<TopBar title="资源文章" />}><CenteredState actionLabel="重新加载" description="暂时无法获取文章，请检查网络后重试。" onAction={state.retry} title="文章加载失败" tone="destructive" /></Screen>;
  const article = state.value;
  return (
    <Screen scroll contentStyle={styles.screen} header={<TopBar title="资源文章" />}>
      {state.warning ? (
        <View style={styles.cacheNotice}>
          <WifiOff color={colors.accent} size={16} />
          <AppText color={colors.foreground} style={styles.grow} variant="caption">网络不可用，正在显示上次缓存的文章。</AppText>
        </View>
      ) : null}
      {article.coverUrl ? <Image accessibilityLabel={article.cover.alt} contentFit="cover" source={{ uri: article.coverUrl }} style={styles.hero} /> : null}
      <View style={styles.article}>
        <Tag>{article.badge}</Tag>
        <AppText style={styles.title} variant="pageTitle">{article.title}</AppText>
        <AppText style={styles.summary}>{article.summary}</AppText>
        <View style={styles.rule} />
        {article.blocks.map((block, index) => <ArticleBlock block={block} key={`${block.type}-${index}`} />)}
        {article.sourceLinks.length ? (
          <View style={styles.sources}>
            <AppText variant="sectionTitle">官方资料</AppText>
            {article.sourceLinks.map((source) => (
              <Pressable accessibilityRole="link" key={source.url} onPress={() => { void Linking.openURL(source.url); }} style={styles.source}>
                <View style={styles.grow}>
                  <AppText color={colors.foreground} variant="caption">{source.title}</AppText>
                  <AppText variant="micro">{source.publisher}</AppText>
                </View>
                <ExternalLink color={colors.primary} size={16} />
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

function ArticleBlock({ block }: { block: EditorialBlock }) {
  if (block.type === 'heading') {
    return <AppText style={block.level === 2 ? styles.heading2 : styles.heading3} variant={block.level === 2 ? 'sectionTitle' : 'cardTitle'}>{block.text}</AppText>;
  }
  if (block.type === 'paragraph') return <AppText style={styles.paragraph}>{block.text}</AppText>;
  if (block.type === 'callout') {
    return (
      <View style={[styles.callout, block.tone === 'warning' ? styles.calloutWarning : null]}>
        {block.title ? <AppText color={colors.foreground} variant="button">{block.title}</AppText> : null}
        <AppText color={colors.foreground}>{block.text}</AppText>
      </View>
    );
  }
  return (
    <View style={styles.list}>
      {block.items.map((item, index) => (
        <View key={`${index}-${item}`} style={styles.listItem}>
          <AppText color={colors.primary} style={styles.marker}>{block.ordered ? `${index + 1}.` : '•'}</AppText>
          <AppText style={styles.grow}>{item}</AppText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { alignSelf: 'center', maxWidth: 430, paddingBottom: spacing[10], paddingHorizontal: 0, width: '100%' },
  hero: { aspectRatio: 8 / 5, marginTop: spacing[2], width: '100%' },
  article: { gap: spacing[3], paddingHorizontal: spacing[5], paddingTop: spacing[5] },
  title: { fontSize: 28, lineHeight: 38 },
  summary: { color: colors.foreground, fontSize: 15, lineHeight: 25 },
  rule: { backgroundColor: colors.border, height: StyleSheet.hairlineWidth, marginVertical: spacing[3] },
  heading2: { fontSize: 21, lineHeight: 30, marginTop: spacing[6] },
  heading3: { fontFamily: fonts.serifSemibold, fontSize: 17, lineHeight: 26, marginTop: spacing[3] },
  paragraph: { color: colors.foreground, fontSize: 15, lineHeight: 27 },
  list: { gap: spacing[2] },
  listItem: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing[2] },
  marker: { fontFamily: fonts.sansSemibold, minWidth: 20 },
  grow: { flex: 1 },
  callout: { backgroundColor: colors.primary06, borderLeftColor: colors.primary, borderLeftWidth: 3, borderRadius: radii.md, gap: spacing[2], padding: spacing[4] },
  calloutWarning: { backgroundColor: 'rgba(183,118,16,0.10)', borderLeftColor: colors.accent },
  cacheNotice: { alignItems: 'center', backgroundColor: 'rgba(183,118,16,0.10)', flexDirection: 'row', gap: spacing[2], paddingHorizontal: spacing[4], paddingVertical: spacing[3] },
  sources: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, gap: spacing[2], marginTop: spacing[8], paddingTop: spacing[5] },
  source: { alignItems: 'center', backgroundColor: colors.secondary, borderRadius: radii.lg, flexDirection: 'row', gap: spacing[3], padding: spacing[3] },
});
