import type { ComponentProps, ReactNode } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { colors, fonts, radii, spacing } from '@/theme';

import { AppText } from './AppText';

type Props = ComponentProps<typeof TextInput> & {
  label?: string;
  error?: string;
  trailing?: ReactNode;
};

export function TextField({ label, error, trailing, style, ...props }: Props) {
  return (
    <View style={styles.group}>
      {label ? <AppText variant="button">{label}</AppText> : null}
      <View style={[styles.field, error ? styles.fieldError : null]}>
        <TextInput
          placeholderTextColor={colors.mutedForeground}
          {...props}
          style={[styles.input, style]}
        />
        {trailing}
      </View>
      {error ? (
        <AppText variant="caption" color={colors.destructive}>
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing[2] },
  field: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.input,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 48,
    paddingHorizontal: spacing[3.5],
  },
  fieldError: { borderColor: colors.destructive },
  input: {
    color: colors.foreground,
    flex: 1,
    fontFamily: fonts.sansRegular,
    fontSize: 14,
    paddingVertical: spacing[3],
  },
});
