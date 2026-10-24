import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { normalizeStudyScope } from '@icao/contracts';
import { AppText, BottomSheet, Button } from '@/components/ui';
import { Check, X } from '@/components/ui/icons';
import { examGoal, type UserProfile } from '@/features/account/profile-model';
import { updateProfile } from '@/features/account/profile-store.native';
import { STUDY_SCOPE_OPTIONS } from '@/features/question-bank/lib/study-scope-options';
import { colors, radii, spacing } from '@/theme';

type Props = { visible: boolean; accountId?: string; profile: UserProfile; onClose: () => void };
export function StudyPreferencesSheet({ visible, accountId, profile, onClose }: Props) {
  const [draft, setDraft] = useState(profile);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const request = useRef(0);
  const pending = useRef(false);
  const latest = useRef({ visible, accountId, onClose }); latest.current = { visible, accountId, onClose };
  const openingProfile = useRef(profile); openingProfile.current = profile;
  useEffect(() => {
    request.current += 1; pending.current = false;
    if (visible) { setDraft(openingProfile.current); setSaving(false); setError(false); }
    return () => { request.current += 1; };
  }, [visible, accountId]);
  const level = draft.target.startsWith('icao5') ? 'icao5' : 'icao4';
  const type = draft.target.endsWith('recert') ? 'recert' : 'first';
  const scope = normalizeStudyScope(draft.studyScope) === 'all' ? 'all' : 'selected';
  const option = STUDY_SCOPE_OPTIONS.find(item => item.value === scope)!;
  function chooseGoal(nextLevel: string, nextType: string) {
    const target = examGoal(`${nextLevel}-${nextType}`).id;
    setDraft(current => ({ ...current, target })); setError(false);
  }
  async function save() {
    if (pending.current || !accountId) return;
    if (draft.target === profile.target && scope === normalizeStudyScope(profile.studyScope)) { onClose(); return; }
    const id = ++request.current, owner = accountId;
    pending.current = true; setSaving(true); setError(false);
    const current = () => id === request.current && latest.current.visible && latest.current.accountId === owner;
    try {
      await updateProfile({ target: draft.target, studyScope: scope });
      if (current()) latest.current.onClose();
    } catch { if (current()) setError(true); }
    finally { if (current()) { pending.current = false; setSaving(false); } }
  }
  const close = () => { if (!pending.current) onClose(); };
  function choice(value: string, title: string, checked: boolean, onPress: () => void) {
    return <Pressable key={value} accessibilityRole="radio" accessibilityLabel={title} accessibilityState={{ checked, disabled: saving }} disabled={saving} onPress={onPress} style={({ pressed }) => [styles.option, checked && styles.selected, pressed && styles.pressed]}>
      <AppText variant="button" color={checked ? colors.primary : colors.foreground}>{title}</AppText>
      <View style={styles.check}>{checked ? <Check size={16} color={colors.primary} /> : null}</View>
    </Pressable>;
  }
  return <BottomSheet visible={visible} onClose={close} accessibilityLabel="备考设置" footer={<View style={styles.footer}>
    {error ? <AppText accessibilityRole="alert" variant="caption" color={colors.destructive}>备考设置未保存，请重试。</AppText> : null}
    <Button disabled={saving || !accountId} loading={saving} onPress={() => void save()} size="lg">完成</Button>
  </View>}>
    <View style={styles.heading}><AppText variant="sectionTitle">备考设置</AppText><Pressable accessibilityRole="button" accessibilityLabel="取消备考设置" disabled={saving} onPress={close} style={styles.close}><X size={20} color={colors.mutedForeground} /></Pressable></View>
    <View style={styles.group}><AppText variant="caption">目标等级</AppText><View accessibilityRole="radiogroup" accessibilityLabel="目标等级" style={styles.options}>
      {(['icao4', 'icao5'] as const).map(value => choice(value, value === 'icao4' ? 'ICAO 4' : 'ICAO 5', level === value, () => chooseGoal(value, type)))}
    </View></View>
    <View style={styles.group}><AppText variant="caption">考试类型</AppText><View accessibilityRole="radiogroup" accessibilityLabel="考试类型" style={styles.options}>
      {(['first', 'recert'] as const).map(value => choice(value, value === 'first' ? '初考' : '复考', type === value, () => chooseGoal(level, value)))}
    </View></View>
    <View style={styles.group}><AppText variant="caption">题库范围</AppText><View accessibilityRole="radiogroup" accessibilityLabel="题库范围" style={styles.options}>
      {STUDY_SCOPE_OPTIONS.map(item => choice(item.value, item.title, scope === item.value, () => { setDraft(current => ({ ...current, studyScope: item.value })); setError(false); }))}
    </View><View accessibilityLiveRegion="polite" style={styles.description}>{option.paragraphs.map(text => <AppText key={text}>{text}</AppText>)}</View></View>
  </BottomSheet>;
}
const styles = StyleSheet.create({
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing[3], marginBottom: spacing[4] },
  close: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  group: { gap: spacing[2], marginBottom: spacing[5] },
  options: { flexDirection: 'row', gap: spacing[3] },
  option: { flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: spacing[2], padding: spacing[3], borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, backgroundColor: colors.background },
  selected: { borderColor: colors.primary20, backgroundColor: colors.primary06 },
  check: { width: 16 },
  description: { gap: spacing[2], marginTop: spacing[1] },
  footer: { gap: spacing[3] }, pressed: { opacity: 0.72 },
});
