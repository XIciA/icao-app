import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, type TextProps } from 'react-native';

import { colors } from '@/theme';

type Props = TextProps & { feedbackEnabled: boolean };

// Keep the same native Text and its pressability; only Android needs a visual
// pressed state. This is transient UI state, separate from saved highlights.
function AndroidLookupFeedbackText({ feedbackEnabled, onPressIn, onPressOut, style, ...props }: Props) {
  const [pressed, setPressed] = useState(false);
  useEffect(() => { if (!feedbackEnabled) setPressed(false); }, [feedbackEnabled]);
  return <Text {...props} style={[style, feedbackEnabled && pressed ? styles.pressed : null]}
    onPressIn={(event) => { if (feedbackEnabled) setPressed(true); onPressIn?.(event); }}
    onPressOut={(event) => { setPressed(false); onPressOut?.(event); }} />;
}

export function LookupFeedbackText({ feedbackEnabled, ...props }: Props) {
  return Platform.OS === 'android'
    ? <AndroidLookupFeedbackText {...props} feedbackEnabled={feedbackEnabled} />
    : <Text {...props} />;
}

const styles = StyleSheet.create({ pressed: { backgroundColor: colors.border } });
