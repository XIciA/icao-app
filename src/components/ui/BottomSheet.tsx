import type { PropsWithChildren } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radii, shadows, spacing } from '@/theme';

type Props = PropsWithChildren<{
  visible: boolean;
  onClose: () => void;
  accessibilityLabel?: string;
}>;

export function BottomSheet({ visible, onClose, children, accessibilityLabel = '底部弹层' }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View accessibilityLabel={accessibilityLabel} style={styles.root}>
        <View style={[StyleSheet.absoluteFill, styles.overlay]} />
        <Pressable accessibilityLabel="关闭弹层" onPress={onClose} style={StyleSheet.absoluteFill} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing[4]) }]}>
          <View style={styles.handle} />
          {children}
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
    maxHeight: '92%',
    paddingHorizontal: spacing[5],
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
});
