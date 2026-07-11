import type { ComponentProps } from 'react';
import { StyleSheet, Text } from 'react-native';

import { colors, fonts, type as typography } from '@/theme';

type TextVariant = 'pageTitle' | 'sectionTitle' | 'cardTitle' | 'body' | 'caption' | 'micro' | 'button';

type Props = ComponentProps<typeof Text> & {
  variant?: TextVariant;
  color?: string;
};

export function AppText({ variant = 'body', color, style, ...props }: Props) {
  return <Text {...props} style={[styles.base, styles[variant], color ? { color } : null, style]} />;
}

const styles = StyleSheet.create({
  base: {
    color: colors.foreground,
    fontFamily: fonts.sansRegular,
  },
  pageTitle: typography.pageTitle,
  sectionTitle: typography.sectionTitle,
  cardTitle: typography.cardTitle,
  body: typography.body,
  caption: typography.caption,
  micro: typography.micro,
  button: {
    color: colors.foreground,
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    lineHeight: 20,
  },
});
