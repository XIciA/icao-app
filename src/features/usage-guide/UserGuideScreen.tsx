import { Pressable, StyleSheet, View } from 'react-native';
import { BookMarked, Bot, ChevronRight, Flame, FolderOpen, Highlighter, Radio, Download, NotebookPen } from '@/components/ui/icons';
import { TopBar } from '@/components/navigation/TopBar';
import { AppText, Button, Screen } from '@/components/ui';
import { colors, spacing } from '@/theme';
import { GUIDE_ENTRIES } from './guide-flows';
import { useGuide } from './GuideBindings';

export const GUIDE_FEATURES = GUIDE_ENTRIES;
const GUIDE_ICONS = { study: Highlighter, vocab: BookMarked, radio: Radio, hotspot: Flame, resources: FolderOpen, 'mock-exam': Bot, recap: NotebookPen, records: NotebookPen, export: Download };
export function UserGuideScreen() {
  const guide = useGuide();
  return <Screen scroll contentStyle={styles.screen} header={<TopBar title="使用指南" />}>
    <AppText variant="caption">选择一项功能，重新查看教程。</AppText>
    {guide?.error ? <View><AppText color={colors.destructive} variant="caption">{guide.error}</AppText>{guide.ready === false ? <Button variant="ghost" onPress={guide.retry}>重试读取进度</Button> : null}</View> : null}
    {GUIDE_ENTRIES.map(({ id, title, description }) => {
      const Icon = GUIDE_ICONS[id];
      return <Pressable accessibilityRole="button" accessibilityLabel={title} disabled={guide?.ready === false} key={id} onPress={() => { void guide?.start(id, true); }} style={({ pressed }) => [styles.entry, pressed && { opacity: 0.7 }]}>
        <Icon color={colors.primary} size={21} /><View style={styles.copy}><AppText variant="cardTitle">{title}</AppText><AppText variant="caption">{description}</AppText></View><ChevronRight color={colors.mutedForeground} size={16} />
      </Pressable>;
    })}
  </Screen>;
}
const styles = StyleSheet.create({ screen: { paddingBottom: spacing[8] }, entry: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[4], borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, copy: { flex: 1, gap: spacing[1] } });
