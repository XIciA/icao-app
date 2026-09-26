import { useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Check, ChevronDown } from '@/components/ui/icons';
import { AppText } from '@/components/ui';
import { updateProfile, useProfile } from '@/features/account/profile-store.native';
import { normalizeStudyScope, type StudyScope } from '@icao/contracts';
import { colors, radii, spacing } from '@/theme';

const options: { value: StudyScope; title: string; description: string }[] = [
  { value: 'all', title: '最全题库', description: '所有问题的大合集，涵盖所有的知识点与题型，包括变形题、热点题、易错题、精选题、难点题和考试真题，知识点有重合的地方，适用于刷题时间足够、有一定语言基础的同学' },
  { value: 'selected', title: '精选题库', description: '包含主要常见题型和所有基础知识点，本题库中所包含的知识点足以应对绝大部分ICAO考试，适用于英语基础平常，备考时间紧张的同学' },
  { value: 'crash', title: '考试真题', description: '包含各时期各大考点考试真题 （投稿有奖励）' },
];

export function StudyScopeSelector() {
  const profile = useProfile();
  const scope = normalizeStudyScope(profile.studyScope);
  const [anchor, setAnchor] = useState<{ x: number; y: number }>();
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState(false);
  const button = useRef<View>(null);
  const { width, height } = useWindowDimensions();
  const menuWidth = Math.min(300, width - 32);
  async function choose(next: StudyScope) {
    if (pending.current) return;
    if (next === scope) { setAnchor(undefined); return; }
    pending.current = true;
    setBusy(true); setError(false);
    try { await updateProfile({ studyScope: next }); setAnchor(undefined); }
    catch { setError(true); }
    finally { pending.current = false; setBusy(false); }
  }
  return <>
    <View style={styles.row}>
      <Pressable ref={button} accessibilityRole="button" accessibilityLabel={`切换题库范围，当前${options.find((item) => item.value === scope)?.title}`} accessibilityState={{ expanded: Boolean(anchor) }} onPress={() => button.current?.measureInWindow((x, y, w, h) => { setError(false); setAnchor({ x: x + w, y: y + h }); })} style={styles.trigger}>
        <AppText variant="button">{options.find((item) => item.value === scope)?.title}</AppText><ChevronDown color={colors.primary} size={16} />
      </Pressable>
    </View>
    <Modal transparent animationType="fade" visible={Boolean(anchor)} onRequestClose={() => setAnchor(undefined)}>
      <Pressable accessibilityLabel="关闭题库范围菜单" style={StyleSheet.absoluteFill} onPress={() => setAnchor(undefined)} />
      <View accessibilityViewIsModal style={[styles.menu, { width: menuWidth, maxHeight: height * 0.65, left: Math.max(16, Math.min((anchor?.x ?? width - 16) - menuWidth, width - menuWidth - 16)), top: Math.min((anchor?.y ?? 80) + 6, height * 0.3) }]}>
        <ScrollView>
          {options.map((option) => <Pressable key={option.value} accessibilityRole="button" accessibilityLabel={`选择${option.title}`} accessibilityState={{ selected: scope === option.value, disabled: busy }} disabled={busy} onPress={() => { void choose(option.value); }} style={[styles.option, scope === option.value ? styles.selected : null]}>
            <View style={styles.copy}><AppText variant="cardTitle" color={scope === option.value ? colors.primary : colors.foreground}>{option.title}</AppText><AppText variant="caption">{option.description}</AppText></View>
            {scope === option.value ? <Check color={colors.primary} size={18} style={styles.check} /> : null}
          </Pressable>)}
          {error ? <AppText accessibilityLiveRegion="polite" color={colors.destructive} style={styles.error}>切换未保存，请重试</AppText> : null}
        </ScrollView>
      </View>
    </Modal>
  </>;
}
const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' }, trigger: { minHeight: 44, paddingHorizontal: spacing[2], flexDirection: 'row', alignItems: 'center', gap: spacing[1] },
  menu: { position: 'absolute', backgroundColor: colors.card, borderRadius: radii.lg, borderColor: colors.border, borderWidth: 1, overflow: 'hidden' }, option: { padding: spacing[4], flexDirection: 'row', gap: spacing[2], alignItems: 'flex-start' }, selected: { backgroundColor: colors.primary06 }, copy: { flex: 1, gap: spacing[2] }, check: { marginTop: spacing[1] }, error: { padding: spacing[3] },
});
