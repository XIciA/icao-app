import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, motion, radii, shadows, spacing } from '@/theme';

type ViewProps = ComponentProps<typeof View> & { elevated?: boolean };
type PressableProps = ComponentProps<typeof Pressable> & { elevated?: boolean };

export function Card({ elevated = false, style, ...props }: ViewProps) {
  return <View {...props} style={[styles.base, elevated ? shadows.card : null, style]} />;
}

export function PressableCard({ elevated = true, style, ...props }: PressableProps) {
  return (
    <Pressable
      accessibilityRole="button"
      {...props}
      style={(state) => [
        styles.base,
        styles.pressable,
        elevated ? shadows.card : null,
        state.pressed ? styles.pressed : null,
        typeof style === 'function' ? style(state) : style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.card80,
    borderColor: colors.border,
    borderRadius: radii.xxl,
    borderTopColor: 'rgba(255,255,255,0.72)',
    borderWidth: 1,
    padding: spacing[4],
  },
  pressable: { minHeight: 80 },
  pressed: { opacity: 0.88, transform: [{ scale: motion.pressScale }] },
});
