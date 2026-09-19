import { useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Check, ChevronDown, Info } from '@/components/ui/icons';
import { AppText, BottomSheet } from '@/components/ui';
import { updateProfile, useProfile } from '@/features/account/profile-store.native';
import { normalizeStudyScope, type StudyScope } from '@icao/contracts';
import { colors, radii, spacing } from '@/theme';

const options: { value: StudyScope; title: string; short: string; description: string }[] = [
  { value: 'all', title: '最全题库', short: '时间充裕，学得更全', description: '时间够用，就从这里慢慢刷。能整理到的题尽量帮你放在一起，省得四处找资料。多见些题型，把知识点学透，既打牢基础，也提高应试能力，上考场更有底气。' },
  { value: 'selected', title: '精选题库', short: '知识点覆盖全面，正常备考重点练这套', description: '由 ICAO 一线教师和考试员精选，覆盖备考需要掌握的各类知识点。正常备考，重点练这套就行，把题做懂、把知识点学全，不会的多过几遍，准备起来更踏实。' },
  { value: 'crash', title: '来不及题库', short: '基础核心题＋高频题，考前先抓这些', description: '时间不够了，先把基础核心题和高频题抓住。把基本知识点弄明白，把常见问法练熟，别毫无准备地上考场“送人头”。碰上常规、难度不高的题，争取把这次考试拿下。' },
];

export function StudyScopeSelector() {
  const profile = useProfile();
  const scope = normalizeStudyScope(profile.studyScope);
  const [anchor, setAnchor] = useState<{ x: number; y: number }>();
  const [info, setInfo] = useState(false);
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
      <Pressable accessibilityRole="button" accessibilityLabel="题库范围介绍" onPress={() => setInfo(true)} style={styles.info}><Info color={colors.mutedForeground} size={19} /></Pressable>
    </View>
    <Modal transparent animationType="fade" visible={Boolean(anchor)} onRequestClose={() => setAnchor(undefined)}>
      <Pressable accessibilityLabel="关闭题库范围菜单" style={StyleSheet.absoluteFill} onPress={() => setAnchor(undefined)} />
      <View accessibilityViewIsModal style={[styles.menu, { width: menuWidth, maxHeight: height * 0.65, left: Math.max(16, Math.min((anchor?.x ?? width - 16) - menuWidth, width - menuWidth - 16)), top: Math.min((anchor?.y ?? 80) + 6, height * 0.3) }]}>
        <ScrollView>
          {options.map((option) => <Pressable key={option.value} accessibilityRole="button" accessibilityLabel={`选择${option.title}`} accessibilityState={{ selected: scope === option.value, disabled: busy }} disabled={busy} onPress={() => { void choose(option.value); }} style={[styles.option, scope === option.value ? styles.selected : null]}>
            <View style={styles.copy}><AppText variant="button">{option.title}</AppText><AppText variant="micro">{option.short}</AppText></View>
            {scope === option.value ? <Check color={colors.primary} size={18} /> : null}
          </Pressable>)}
          {error ? <AppText accessibilityLiveRegion="polite" color={colors.destructive} style={styles.error}>切换未保存，请重试</AppText> : null}
        </ScrollView>
      </View>
    </Modal>
    <BottomSheet accessibilityLabel="题库范围介绍" visible={info} onClose={() => setInfo(false)}>
      <View style={styles.descriptions}>{options.map((option) => <View key={option.value} style={styles.description}><AppText variant="sectionTitle">{option.title}</AppText><AppText>{option.description}</AppText></View>)}</View>
    </BottomSheet>
  </>;
}
const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' }, trigger: { minHeight: 44, paddingHorizontal: spacing[2], flexDirection: 'row', alignItems: 'center', gap: spacing[1] }, info: { width: 40, height: 44, justifyContent: 'center', alignItems: 'center' },
  menu: { position: 'absolute', backgroundColor: colors.card, borderRadius: radii.lg, borderColor: colors.border, borderWidth: 1, overflow: 'hidden' }, option: { padding: spacing[4], flexDirection: 'row', gap: spacing[2], alignItems: 'center' }, selected: { backgroundColor: colors.primary06 }, copy: { flex: 1, gap: spacing[1] }, error: { padding: spacing[3] }, descriptions: { gap: spacing[6], paddingBottom: spacing[4] }, description: { gap: spacing[2] },
});
