import type { LucideIcon } from 'lucide-react-native';
import { RefreshCw } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { colors, radii, spacing } from '@/theme';

import { AppText, Button } from '../ui';

type Tone = 'primary' | 'accent' | 'destructive';

type Props = {
  icon?: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  secondary?: ReactNode;
  tone?: Tone;
};

export function CenteredState({
  icon: Icon = RefreshCw,
  title,
  description,
  actionLabel,
  onAction,
  secondary,
  tone = 'primary',
}: Props) {
  const palette = tones[tone];

  return (
    <View style={styles.root}>
      <View style={[styles.hero, { backgroundColor: palette.background }]}>
        <Icon color={palette.foreground} size={32} />
      </View>
      <AppText style={styles.title} variant="sectionTitle">
        {title}
      </AppText>
      <AppText style={styles.description}>{description}</AppText>
      {actionLabel && onAction ? (
        <Button onPress={onAction} style={styles.action} variant={tone === 'destructive' ? 'destructive' : 'primary'}>
          {actionLabel}
        </Button>
      ) : null}
      {secondary}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: spacing[8] },
  hero: {
    alignItems: 'center',
    borderRadius: radii.xl,
    height: 64,
    justifyContent: 'center',
    width: 64,
  },
  title: { marginTop: spacing[6], textAlign: 'center' },
  description: { marginTop: spacing[3], maxWidth: 320, textAlign: 'center' },
  action: { marginTop: spacing[6], minWidth: 160 },
});

const tones = {
  primary: { background: colors.primary10, foreground: colors.primary },
  accent: { background: 'rgba(183,118,16,0.10)', foreground: colors.accent },
  destructive: { background: 'rgba(219,43,51,0.10)', foreground: colors.destructive },
} as const;
