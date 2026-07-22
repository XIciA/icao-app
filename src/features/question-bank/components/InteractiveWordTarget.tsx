import type { ReactNode } from 'react';
import { useState } from 'react';
import type { GestureResponderEvent, StyleProp, TextStyle, ViewStyle } from 'react-native';
import { Pressable, StyleSheet, Text } from 'react-native';

import { colors } from '@/theme';

export function InteractiveWordTarget({
  accessibilityLabel,
  children,
  onPress,
  style,
  textStyle,
}: {
  accessibilityLabel: string;
  children: ReactNode;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}) {
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const emphasized = focused || hovered || pressed;

  function handlePress(event: GestureResponderEvent) {
    event.stopPropagation();
    onPress();
  }

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onBlur={() => setFocused(false)}
      onFocus={() => setFocused(true)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onPress={handlePress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={[styles.target, style]}
    >
      <Text style={[textStyle, emphasized ? styles.emphasized : null]}>{children}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  emphasized: { backgroundColor: colors.primary10 },
  target: { alignSelf: 'baseline', cursor: 'pointer' },
});
