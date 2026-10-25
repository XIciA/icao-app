import { useLoginEntry } from '@/features/auth/use-login-entry';
import { trackProductClick } from '@/platform/product-clicks.native';
import { WebAppDownloadLink } from '@/components/platform/WebAppDownloadLink';
import {
  BookMarked,
  Bot,
  ChevronRight,
  Flame,
  FolderOpen,
  GraduationCap,
  LineChart,
  Radio,
  type LucideIcon,
} from '@/components/ui/icons';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { AppText, Card, Screen } from '@/components/ui';
import { SoftGlow } from '@/components/visual/SoftGlow';
import { colors, fonts, radii, spacing } from '@/theme';

import { isContentAvailableOnPlatform, resolveMockExamDiscoverCopy } from './native-release-surface';

type Entry = { slug: string; title: string; en: string; description: string; icon: LucideIcon; mock?: boolean };
const standardFeatures: Entry[] = [
  { slug: 'vocab', title: '单词学习', en: 'Vocabulary', description: '航空高频词汇记忆与测试', icon: BookMarked },
  { slug: 'radio', title: '随身听', en: 'Listening', description: '碎片时间沉浸式磨耳朵', icon: Radio },
];
const reportEntry: Entry = { slug: 'ai-report', title: '学习报告', en: 'Report', description: '个性化能力分析建议', icon: LineChart, mock: true };
const resourceEntries: Entry[] = [
  { slug: 'hotspot', title: 'OPI 热点', en: 'OPI Focus', description: '每日考点话题与抽样练习', icon: Flame },
  { slug: 'resources', title: '资源分享', en: 'Resources', description: '备考资料与实用工具合集', icon: FolderOpen },
];
const courseEntry: Entry = {
  slug: 'courses',
  title: '体系课程',
  en: 'Courses',
  description: '从入门到冲刺的系统化课程体系',
  icon: GraduationCap,
};

export function DiscoverHomeScreen() {
  const login = useLoginEntry();
  const open = (slug: string) => { trackProductClick('feature_open', slug); login(`/content/${slug}`, '登录后查看会员功能'); };
  const mockExamCopy = resolveMockExamDiscoverCopy(Platform.OS);
  const features: Entry[] = [
    ...standardFeatures,
    { slug: 'mock-exam', ...mockExamCopy, icon: Bot },
    reportEntry,
  ];
  const visibleFeatures = features.filter((entry) => isContentAvailableOnPlatform(entry.slug, Platform.OS));
  const courseAvailable = isContentAvailableOnPlatform(courseEntry.slug, Platform.OS);
  return (
    <Screen background={<SoftGlow intensity={0.8} size={320} style={styles.glow} />} bottomInset contentStyle={styles.screen} scroll>
      <View style={styles.header}>
        <View style={styles.headingRow}><AppText variant="pageTitle">发现</AppText><WebAppDownloadLink /></View>
        <AppText>{courseAvailable ? '功能、资源与课程，探索更多学习方式。' : '功能与资源，探索更多学习方式。'}</AppText>
      </View>
      <SectionTitle en="Features" title="功能" />
      <Card style={styles.featureCard}>
        <View style={styles.grid}>{visibleFeatures.map((entry) => <Feature key={entry.slug} entry={entry} onPress={() => open(entry.slug)} />)}</View>
      </Card>
      <SectionTitle en="Resources" title="资源" />
      <View style={styles.list}>{resourceEntries.map((entry) => <ListEntry key={entry.slug} entry={entry} onPress={() => open(entry.slug)} />)}</View>
      {courseAvailable ? <><SectionTitle en="Courses" title="课程" /><ListEntry emphasis entry={courseEntry} onPress={() => open(courseEntry.slug)} /></> : null}
    </Screen>
  );
}

function SectionTitle({ title, en }: { title: string; en: string }) {
  return <View style={styles.sectionTitle}><AppText variant="sectionTitle">{title}</AppText><AppText variant="micro">{en.toUpperCase()}</AppText></View>;
}

function Feature({ entry, onPress }: { entry: Entry; onPress: () => void }) {
  const Icon = entry.icon;
  return <Pressable accessibilityLabel={`打开${entry.title}`} onPress={onPress} style={({ pressed }) => [styles.feature, pressed ? styles.pressed : null]}><View style={styles.icon}><Icon color={colors.primary} size={20} />{entry.mock ? <View style={styles.soonDot} /> : null}</View><AppText style={styles.featureLabel} variant="caption">{entry.title}</AppText></Pressable>;
}

function ListEntry({ entry, onPress, emphasis }: { entry: Entry; onPress: () => void; emphasis?: boolean }) {
  const Icon = entry.icon;
  return <Pressable accessibilityLabel={`打开${entry.title}`} onPress={onPress} style={({ pressed }) => pressed ? styles.pressed : null}><Card style={styles.row}><View style={[styles.icon, emphasis ? styles.largeIcon : null]}><Icon color={colors.primary} size={emphasis ? 23 : 20} /></View><View style={styles.copy}><AppText variant={emphasis ? 'sectionTitle' : 'cardTitle'}>{entry.title}</AppText><AppText numberOfLines={2} variant="caption">{entry.description}</AppText></View><ChevronRight color={colors.mutedForeground} size={17} /></Card></Pressable>;
}

const styles = StyleSheet.create({
  screen: { paddingTop: spacing[2] },
  glow: { left: -170, top: -180 },
  header: { gap: spacing[1], marginBottom: spacing[5] },
  headingRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', gap: spacing[3] },
  sectionTitle: { alignItems: 'baseline', flexDirection: 'row', gap: spacing[2], marginBottom: spacing[3], marginTop: spacing[1] },
  featureCard: { padding: spacing[3] },
  grid: { flexDirection: 'row' },
  feature: { alignItems: 'center', flex: 1, gap: spacing[1.5], paddingVertical: spacing[1.5] },
  icon: { alignItems: 'center', backgroundColor: colors.primary08, borderRadius: radii.xl, height: 44, justifyContent: 'center', width: 44 },
  largeIcon: { height: 50, width: 50 },
  featureLabel: { color: colors.foreground, fontFamily: fonts.sansMedium, textAlign: 'center' },
  soonDot: { backgroundColor: colors.mutedForeground, borderRadius: radii.full, height: 8, opacity: 0.5, position: 'absolute', right: -2, top: -2, width: 8 },
  pressed: { opacity: 0.78, transform: [{ scale: 0.98 }] },
  list: { gap: spacing[2.5] },
  row: { alignItems: 'center', flexDirection: 'row', gap: spacing[3] },
  copy: { flex: 1, minWidth: 0 },
});
