import { useCallback, useEffect, useRef, useState, type PropsWithChildren, type ReactNode } from 'react';
import { Animated, Easing, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GuideSheetBackdrop, useGuide } from '@/features/usage-guide/GuideBindings';
import { AppModal } from '@/components/platform/AppModal';
import { useLastVisibleValue } from '@/components/platform/useLastVisibleValue';
import { useAppViewportDimensions } from '@/components/platform/useAppViewportDimensions';
import { colors, radii, shadows, spacing } from '@/theme';

type Props = PropsWithChildren<{
  visible: boolean;
  onClose: () => void;
  onClosed?: () => void;
  accessibilityLabel?: string;
  footer?: ReactNode;
  scrollable?: boolean;
}>;

export function BottomSheet({ visible, onClose, onClosed, children, footer, scrollable = true, accessibilityLabel = '底部弹层' }: Props) {
  const insets = useSafeAreaInsets();
  const guide = useGuide();
  const teaching = !!guide?.current && guide.ready !== false;
  const content = useLastVisibleValue(visible, { children, footer, scrollable, accessibilityLabel });
  const closed = useRef(onClosed); closed.current = onClosed;
  const { height } = useAppViewportDimensions();

  const [mounted, setMounted] = useState(visible);
  const [presented, setPresented] = useState(false);
  const sheet = useRef<View>(null);
  const progress = useRef(new Animated.Value(0)).current;
  const requested = useRef(visible); requested.current = visible;
  const onShow = useCallback(() => { if (requested.current) setPresented(true); }, []);
  useEffect(() => { if (visible) setMounted(true); else if (!presented && mounted) { setMounted(false); closed.current?.(); } }, [mounted, presented, visible]);
  useEffect(() => {
    if (!mounted || !presented) return;
    const animation = Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web',
    });
    animation.start(({ finished }) => {
      if (finished && !requested.current) { setMounted(false); setPresented(false); closed.current?.(); }
    });
    return () => animation.stop();
  }, [mounted, presented, progress, visible]);

  return (
    <AppModal guideBackdropRef={sheet} animationType="none" onShow={onShow} onRequestClose={onClose} transparent visible={mounted}>
      <View accessibilityLabel={content.accessibilityLabel} pointerEvents={visible ? 'auto' : 'none'} accessibilityElementsHidden={!visible} importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'} style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.overlay, { opacity: teaching ? 0 : progress }]} />
        <Pressable accessibilityLabel="关闭弹层" onPress={onClose} style={StyleSheet.absoluteFill} />
        <Animated.View ref={sheet} style={[styles.sheet, { transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [height, 0] }) }], maxHeight: height * 0.92, paddingBottom: Math.max(insets.bottom, spacing[4]) }]}>
          <View style={styles.handle} />
          {content.scrollable ? (
            <ScrollView style={styles.scrollContent} contentContainerStyle={styles.scrollInner}>{content.children}</ScrollView>
          ) : (
            <View style={[styles.scrollContent, styles.scrollInner]}>{content.children}</View>
          )}
          {content.footer ? <View style={styles.footer}>{content.footer}</View> : null}
          <GuideSheetBackdrop />
        </Animated.View>
      </View>
    </AppModal>
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
