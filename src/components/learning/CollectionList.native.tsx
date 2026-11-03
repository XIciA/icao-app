import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radii, spacing } from '@/theme';

/** Shared continuous surface for annotation and word collections, including virtual lists. */
export function CollectionList({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[collectionStyles.surface, style]}>{children}</View>;
}

export function CollectionRow({ children, last = false }: { children: ReactNode; last?: boolean }) {
  return <View style={collectionStyles.row}>{children}{!last ? <View style={collectionStyles.separator} /> : null}</View>;
}

export const collectionStyles = StyleSheet.create({
  surface: { backgroundColor: colors.card, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth, borderRadius: radii.xl, overflow: 'hidden' },
  row: { paddingHorizontal: spacing[4], paddingVertical: spacing[5], gap: spacing[2] },
  separator: { position: 'absolute', bottom: 0, left: spacing[4], right: spacing[4], height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
});
