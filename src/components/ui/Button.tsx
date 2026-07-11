import type { ComponentProps, ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { colors, motion, radii, spacing } from '@/theme';

import { AppText } from './AppText';

type Variant = 'primary' | 'outline' | 'secondary' | 'ghost' | 'destructive';
type Size = 'sm' | 'md' | 'lg' | 'icon';

type Props = Omit<ComponentProps<typeof Pressable>, 'children'> & {
  children: ReactNode;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  leading?: ReactNode;
};

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  leading,
  disabled,
  style,
  ...props
}: Props) {
  const foreground = foregrounds[variant];

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      {...props}
      style={(state) => [
        styles.base,
        styles[size],
        variants[variant],
        state.pressed && !disabled ? styles.pressed : null,
        disabled || loading ? styles.disabled : null,
        typeof style === 'function' ? style(state) : style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={foreground} size="small" />
      ) : (
        <View style={styles.content}>
          {leading}
          <AppText variant="button" color={foreground} numberOfLines={1}>
            {children}
          </AppText>
        </View>
      )}
    </Pressable>
  );
}

const foregrounds: Record<Variant, string> = {
  primary: colors.primaryForeground,
  outline: colors.foreground,
  secondary: colors.secondaryForeground,
  ghost: colors.foreground,
  destructive: colors.destructiveForeground,
};

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    borderRadius: radii.lg,
    borderWidth: 1,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  sm: { minHeight: 36, paddingHorizontal: spacing[3] },
  md: { minHeight: 44, paddingHorizontal: spacing[4] },
  lg: { minHeight: 50, paddingHorizontal: spacing[5] },
  icon: { height: 40, paddingHorizontal: 0, width: 40 },
  content: { alignItems: 'center', flexDirection: 'row', gap: spacing[2] },
  primary: { backgroundColor: colors.primary, borderColor: colors.primary },
  outline: { backgroundColor: colors.background, borderColor: colors.border },
  secondary: { backgroundColor: colors.secondary, borderColor: 'transparent' },
  ghost: { backgroundColor: 'transparent', borderColor: 'transparent' },
  destructive: { backgroundColor: colors.destructive, borderColor: colors.destructive },
  pressed: { opacity: 0.82, transform: [{ scale: motion.pressScale }] },
  disabled: { opacity: 0.5 },
});

const variants = StyleSheet.create({
  primary: styles.primary,
  outline: styles.outline,
  secondary: styles.secondary,
  ghost: styles.ghost,
  destructive: styles.destructive,
});
