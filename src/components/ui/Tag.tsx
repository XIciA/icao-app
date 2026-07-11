import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { colors, radii, spacing } from '@/theme';

import { AppText } from './AppText';

type Tone = 'primary' | 'muted' | 'accent' | 'destructive';

export function Tag({ children, tone = 'primary' }: { children: ReactNode; tone?: Tone }) {
  return (
    <View style={[styles.base, tones[tone].container]}>
      <AppText variant="micro" color={tones[tone].text}>
        {children}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignSelf: 'flex-start',
    borderRadius: radii.full,
    paddingHorizontal: spacing[2],
    paddingVertical: 3,
  },
});

const tones = {
  primary: { container: { backgroundColor: colors.primary10 }, text: colors.primary },
  muted: { container: { backgroundColor: colors.muted }, text: colors.mutedForeground },
  accent: { container: { backgroundColor: 'rgba(183,118,16,0.10)' }, text: colors.accent },
  destructive: { container: { backgroundColor: 'rgba(219,43,51,0.10)' }, text: colors.destructive },
} as const;
