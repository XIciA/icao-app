import type { PropsWithChildren, ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radii, shadows, spacing } from '@/theme';

type Props = PropsWithChildren<{
  visible: boolean;
  onClose: () => void;
  accessibilityLabel?: string;
  footer?: ReactNode;
  scrollable?: boolean;
}>;

export function BottomSheet({ visible, onClose, children, footer, scrollable = true, accessibilityLabel = '底部弹层' }: Props) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View accessibilityLabel={accessibilityLabel} style={styles.root}>
        <View style={[StyleSheet.absoluteFill, styles.overlay]} />
        <Pressable accessibilityLabel="关闭弹层" onPress={onClose} style={StyleSheet.absoluteFill} />
        <View style={[styles.sheet, { maxHeight: height * 0.92, paddingBottom: Math.max(insets.bottom, spacing[4]) }]}>
          <View style={styles.handle} />
          {scrollable ? (
            <ScrollView style={styles.scrollContent} contentContainerStyle={styles.scrollInner}>{children}</ScrollView>
          ) : (
            <View style={[styles.scrollContent, styles.scrollInner]}>{children}</View>
          )}
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  overlay: { backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radii.xxxl,
    borderTopRightRadius: radii.xxxl,
    paddingTop: spacing[3],
    ...shadows.modal,
  },
  handle: {
    alignSelf: 'center',
    backgroundColor: colors.border,
    borderRadius: radii.full,
    height: 6,
    marginBottom: spacing[4],
    width: 40,
  },
  scrollContent: { paddingHorizontal: spacing[5] },
  scrollInner: { paddingBottom: spacing[4] },
  footer: { paddingHorizontal: spacing[5], paddingTop: spacing[4], borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});
