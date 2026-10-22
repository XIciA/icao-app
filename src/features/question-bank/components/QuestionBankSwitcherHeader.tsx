import { isFormalAppSurface } from '@/config/web-runtime';
import { GuideAnchor, useGuide } from '@/features/usage-guide/GuideBindings';
import { ArrowLeft, Check, ChevronDown, ChevronRight, type LucideIcon } from '@/components/ui/icons';
import { useMemo, useState, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { AppText, BottomSheet } from '@/components/ui';
import { colors, fonts, radii, spacing } from '@/theme';

export type QuestionBankSwitcherItem<Value extends string> = {
  icon: LucideIcon;
  label: string;
  summary?: string;
  value: Value;
};

export function QuestionBankSwitcherHeader<Value extends string>({
  accessibilityLabel = '切换题库',
  guideId,
  items,
  onBack,
  onSelect,
  right,
  showDivider = true,
  value,
}: {
  accessibilityLabel?: string;
  guideId?: string;
  items: readonly QuestionBankSwitcherItem<Value>[];
  onBack: () => void;
  onSelect: (value: Value) => void;
  right?: ReactNode;
  showDivider?: boolean;
  value: Value;
}) {
  const guide = useGuide();
  const [visible, setVisible] = useState(false);
  const selected = useMemo(() => items.find((item) => item.value === value) ?? items[0], [items, value]);

  if (!selected) return null;
  const ActiveIcon = selected.icon;

  return (
    <>
      <View style={[styles.header, showDivider ? styles.headerDivider : null]}>
        <Pressable
          accessibilityLabel="返回"
          hitSlop={8}
          onPress={onBack}
          style={({ pressed }) => [styles.headerButton, pressed ? styles.pressed : null]}
        >
          <ArrowLeft color={colors.foreground} size={20} />
        </Pressable>
        <Pressable
          accessibilityLabel={accessibilityLabel}
          accessibilityRole="button"
          hitSlop={4}
          onPress={() => setVisible(true)}
          style={({ pressed }) => [styles.moduleButton, pressed ? styles.modulePressed : null]}
        >
          {guideId ? <GuideAnchor id={guideId} /> : null}
          <View style={styles.moduleIcon}><ActiveIcon color={colors.primary} size={isFormalAppSurface(Platform.OS) ? 21 : 19} /></View>
          <AppText numberOfLines={1} style={styles.moduleTitle} variant="sectionTitle">{selected.label}</AppText>
          <ChevronDown color={colors.mutedForeground} size={16} />
        </Pressable>
        <View style={styles.headerButton}>{right}</View>
      </View>

      <BottomSheet accessibilityLabel={accessibilityLabel} onClose={() => setVisible(false)} visible={visible}>
        <View style={styles.sheetContent}>
          <AppText variant="sectionTitle">切换题库</AppText>
          {items.map((item) => {
            const Icon = item.icon;
            const active = item.value === value;
            return (
              <Pressable
                accessibilityLabel={`切换到${item.label}`}
                accessibilityRole="button"
                key={item.value}
                onPress={() => {
                  setVisible(false);
                  if (!active) onSelect(item.value);
                  if (guideId) guide?.event(guideId);
                }}
                style={({ pressed }) => [styles.sheetRow, active ? styles.sheetRowActive : null, pressed ? styles.sheetRowPressed : null]}
              >
                <View style={styles.sheetIcon}><Icon color={colors.primary} size={isFormalAppSurface(Platform.OS) ? 21 : 19} /></View>
                <View style={styles.sheetCopy}>
                  <AppText variant="button">{item.label}</AppText>
                  {item.summary ? <AppText numberOfLines={1} variant="micro">{item.summary}</AppText> : null}
                </View>
                {active ? <Check color={colors.primary} size={17} /> : <ChevronRight color={colors.mutedForeground} size={17} />}
              </Pressable>
            );
          })}
        </View>
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', flexDirection: 'row', minHeight: 64, paddingHorizontal: spacing[3] },
  headerDivider: { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
  headerButton: { alignItems: 'center', borderRadius: radii.full, height: 40, justifyContent: 'center', width: 40 },
  pressed: { backgroundColor: colors.secondary },
  moduleButton: { alignItems: 'center', borderRadius: radii.full, flex: 1, flexDirection: 'row', gap: spacing[2], justifyContent: 'center', minHeight: 46, minWidth: 0 },
  modulePressed: { opacity: 0.72 },
  moduleIcon: { alignItems: 'center', backgroundColor: isFormalAppSurface(Platform.OS) ? colors.primary045 : colors.primary10, borderRadius: radii.full, height: 38, justifyContent: 'center', width: 38 },
  moduleTitle: { flexShrink: 1, fontFamily: fonts.serifSemibold },
  sheetContent: { gap: spacing[2], paddingBottom: spacing[4] },
  sheetRow: { alignItems: 'center', borderColor: colors.border, borderRadius: radii.xl, borderWidth: 1, flexDirection: 'row', gap: spacing[3], minHeight: 60, padding: spacing[3] },
  sheetRowActive: { backgroundColor: colors.primary06, borderColor: colors.primary20 },
  sheetRowPressed: { opacity: 0.78 },
  sheetIcon: { alignItems: 'center', backgroundColor: isFormalAppSurface(Platform.OS) ? colors.primary045 : colors.primary10, borderRadius: isFormalAppSurface(Platform.OS) ? radii.full : radii.lg, height: 36, justifyContent: 'center', width: 36 },
  sheetCopy: { flex: 1, minWidth: 0 },
});
