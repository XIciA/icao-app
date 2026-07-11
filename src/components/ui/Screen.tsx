import type { PropsWithChildren } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  type ScrollViewProps,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing } from '@/theme';

type Props = PropsWithChildren<{
  scroll?: boolean;
  keyboard?: boolean;
  bottomInset?: boolean;
  contentStyle?: ViewStyle;
  scrollProps?: ScrollViewProps;
}>;

export function Screen({
  children,
  scroll = false,
  keyboard = false,
  bottomInset = false,
  contentStyle,
  scrollProps,
}: Props) {
  const content = scroll ? (
    <ScrollView
      contentContainerStyle={[styles.content, styles.scrollContent, bottomInset ? styles.withTabBar : null, contentStyle]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      {...scrollProps}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.content, styles.flex, bottomInset ? styles.withTabBar : null, contentStyle]}>
      {children}
    </View>
  );

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      {keyboard ? (
        <KeyboardAvoidingView
          behavior={Platform.select({ ios: 'padding', android: undefined })}
          style={styles.flex}
        >
          {content}
        </KeyboardAvoidingView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  flex: { flex: 1 },
  content: { paddingHorizontal: spacing[5] },
  scrollContent: { flexGrow: 1 },
  withTabBar: { paddingBottom: 112 },
});
