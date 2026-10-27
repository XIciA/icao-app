import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { colors, radii, spacing } from '@/theme';

import { AppText } from './AppText';

type Tone = 'primary' | 'muted' | 'accent' | 'destructive' | 'success';

export function Tag({ children, tone = 'primary', size = 'sm', leading }: {
  children: ReactNode;
  tone?: Tone;
  size?: 'sm' | 'md';
  leading?: ReactNode;
}) {
  return (
    <View style={[styles.base, size === 'md' ? styles.readable : null, tones[tone].container]}>
      {leading}
      <AppText variant={size === 'md' ? 'body' : 'micro'} color={tones[tone].text}>
        {children}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignSelf: 'flex-start',
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[1],
    borderRadius: radii.full,
    paddingHorizontal: spacing[2],
    paddingVertical: 3,
  },
  readable: { borderRadius: radii.sm, paddingVertical: spacing[1] },
});

const tones = {
  primary: { container: { backgroundColor: colors.primary10 }, text: colors.primary },
  muted: { container: { backgroundColor: colors.muted }, text: colors.mutedForeground },
  accent: { container: { backgroundColor: 'rgba(183,118,16,0.10)' }, text: colors.accent },
  destructive: { container: { backgroundColor: 'rgba(219,43,51,0.10)' }, text: colors.destructive },
  success: { container: { backgroundColor: colors.answerCorrectBackground }, text: colors.successForeground },
} as const;
