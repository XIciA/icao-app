import { useRouter } from 'expo-router';
import { ArrowLeft, Plane, Eye, EyeOff, Check } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AppText, TextField, Screen } from '@/components/ui';
import { SoftGlow } from '@/components/visual/SoftGlow';
import { colors, fonts, radii, spacing } from '@/theme';

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <Screen keyboard scroll contentStyle={styles.screen}>
      <SoftGlow intensity={0.9} size={350} style={styles.glow} />
      <AuthTopBar />
      {children}
    </Screen>
  );
}

export function AuthTopBar() {
  const router = useRouter();
  return (
    <Pressable accessibilityLabel="返回" hitSlop={10} onPress={router.back} style={styles.back}>
      <ArrowLeft color={colors.foreground} size={19} />
    </Pressable>
  );
}

export function AuthHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View style={styles.heading}>
      <AppText variant="pageTitle">{title}</AppText>
      <AppText variant="caption">{subtitle}</AppText>
    </View>
  );
}

export function BrandMark({ large = false }: { large?: boolean }) {
  return (
    <View style={[styles.brand, large && styles.brandLarge]}>
      <Plane color={colors.primaryForeground} size={large ? 30 : 22} style={{ transform: [{ rotate: '-45deg' }] }} />
    </View>
  );
}

export function AuthField({
  label, value, onChangeText, placeholder, icon: Icon, prefix, keyboardType, maxLength
}: {
  label: string; value: string; onChangeText: (v: string) => void; placeholder?: string;
  icon?: any; prefix?: string; keyboardType?: any; maxLength?: number;
}) {
  return (
    <View style={styles.authField}>
      <AppText variant="button">{label}</AppText>
      <View style={styles.authInputWrapper}>
        {prefix ? <AppText variant="caption">{prefix}</AppText> : null}
        {Icon && !prefix ? <Icon color={colors.mutedForeground} size={20} /> : null}
        <TextInput
          keyboardType={keyboardType}
          maxLength={maxLength}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.mutedForeground}
          style={styles.rawInput}
          value={value}
        />
      </View>
    </View>
  );
}

export function PasswordField({
  label, value, onChangeText, placeholder
}: { label: string; value: string; onChangeText: (v: string) => void; placeholder?: string; }) {
  const [visible, setVisible] = useState(false);
  return (
    <TextField
      label={label}
      onChangeText={onChangeText}
      placeholder={placeholder}
      secureTextEntry={!visible}
      trailing={
        <Pressable hitSlop={10} onPress={() => setVisible(!visible)}>
          {visible ? <EyeOff color={colors.mutedForeground} size={17} /> : <Eye color={colors.mutedForeground} size={17} />}
        </Pressable>
      }
      value={value}
    />
  );
}

export function CodeField({ value, onChangeText }: { value: string; onChangeText: (v: string) => void; }) {
  return (
    <View style={styles.codeBoxes}>
      {Array.from({ length: 6 }).map((_, index) => (
        <View key={index} style={[styles.codeBox, index === Math.min(value.length, 5) && styles.codeBoxActive]}>
          <AppText style={styles.codeDigit}>{value[index] ?? ''}</AppText>
        </View>
      ))}
      <TextInput
        accessibilityLabel="短信验证码"
        keyboardType="number-pad"
        maxLength={6}
        onChangeText={onChangeText}
        style={styles.hiddenCode}
        value={value}
      />
    </View>
  );
}

export function Checkbox({ checked, label, linkLabel, onLinkPress, onPress }: { checked: boolean; label: string; linkLabel?: string; onLinkPress?: () => void; onPress: () => void; }) {
  return (
    <View style={styles.checkControl}>
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={onPress} style={styles.checkInner}>
        <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
          {checked ? <Check color={colors.primaryForeground} size={12} /> : null}
        </View>
        <AppText variant="caption">{label}</AppText>
      </Pressable>
      {linkLabel && onLinkPress ? (
        <TextLink label={linkLabel} onPress={onLinkPress} />
      ) : null}
    </View>
  );
}

export function TextLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress}>
      <AppText color={colors.primary} variant="caption">{label}</AppText>
    </Pressable>
  );
}

export function Divider({ label }: { label: string }) {
  return (
    <View style={styles.divider}>
      <View style={styles.line} />
      <AppText variant="micro">{label}</AppText>
      <View style={styles.line} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: spacing[5], position: 'relative' },
  glow: { right: -155, top: -175 },
  back: { alignItems: 'center', height: 42, justifyContent: 'center', marginLeft: -spacing[2], marginTop: spacing[1], width: 42 },
  heading: { gap: spacing[1.5], marginTop: spacing[1] },
  brand: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radii.full, height: 54, justifyContent: 'center', width: 54 },
  brandLarge: { height: 68, width: 68 },
  authField: { gap: spacing[2] },
  authInputWrapper: { alignItems: 'center', backgroundColor: colors.card, borderColor: colors.input, borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', gap: spacing[2], minHeight: 48, paddingHorizontal: spacing[3.5] },
  rawInput: { color: colors.foreground, flex: 1, fontFamily: fonts.sansRegular, fontSize: 14, paddingVertical: spacing[3] },
  codeBoxes: { flexDirection: 'row', gap: spacing[2], position: 'relative' },
  codeBox: { alignItems: 'center', aspectRatio: 1, backgroundColor: colors.card, borderColor: colors.border, borderRadius: radii.md, borderWidth: 1, flex: 1, justifyContent: 'center' },
  codeBoxActive: { borderColor: colors.primary, borderWidth: 2 },
  codeDigit: { fontFamily: fonts.monoRegular, fontSize: 20 },
  hiddenCode: { ...StyleSheet.absoluteFillObject, opacity: 0 },
  checkControl: { alignItems: 'center', flexDirection: 'row', gap: spacing[1.5], flexWrap: 'wrap' },
  checkInner: { alignItems: 'center', flexDirection: 'row', gap: spacing[2] },
  checkbox: { alignItems: 'center', borderColor: colors.input, borderRadius: radii.sm, borderWidth: 1, height: 18, justifyContent: 'center', width: 18 },
  checkboxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  divider: { alignItems: 'center', flexDirection: 'row', gap: spacing[3], marginVertical: spacing[6] },
  line: { backgroundColor: colors.border, flex: 1, height: 1 },
});
