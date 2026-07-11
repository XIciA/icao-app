import { useRouter } from 'expo-router';
import { ArrowLeft, X } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, radii, spacing } from '@/theme';

import { AppText } from '../ui';

type Props = {
  title: string;
  onBack?: () => void;
  close?: boolean;
  right?: ReactNode;
};

export function TopBar({ title, onBack, close = false, right }: Props) {
  const router = useRouter();
  const Icon = close ? X : ArrowLeft;

  return (
    <View style={styles.bar}>
      <Pressable
        accessibilityLabel={close ? '关闭' : '返回'}
        accessibilityRole="button"
        hitSlop={8}
        onPress={onBack ?? router.back}
        style={({ pressed }) => [styles.iconButton, pressed ? styles.pressed : null]}
      >
        <Icon color={colors.foreground} size={20} strokeWidth={2} />
      </Pressable>
      <AppText numberOfLines={1} style={styles.title} variant="cardTitle">
        {title}
      </AppText>
      <View style={styles.action}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    alignItems: 'center',
    backgroundColor: colors.background72,
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 52,
    paddingHorizontal: spacing[3],
  },
  iconButton: {
    alignItems: 'center',
    borderRadius: radii.full,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  pressed: { backgroundColor: colors.secondary, transform: [{ scale: 0.95 }] },
  title: { flex: 1, fontSize: 16, textAlign: 'center' },
  action: { alignItems: 'center', justifyContent: 'center', minHeight: 40, width: 40 },
});
