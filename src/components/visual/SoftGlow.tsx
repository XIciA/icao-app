import { useId } from 'react';
import { StyleSheet, type StyleProp, View, type ViewStyle } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { colors } from '@/theme';

type Props = {
  color?: string;
  intensity?: number;
  size: number;
  style?: StyleProp<ViewStyle>;
};

/** A native, edge-free ambient glow used by the Web mobile baseline. */
export function SoftGlow({ color = colors.primary, intensity = 1, size, style }: Props) {
  const gradientId = `soft-glow-${useId().replace(/:/g, '')}`;

  return (
    <View pointerEvents="none" style={[styles.root, { height: size, width: size }, style]}>
      <Svg height="100%" width="100%">
        <Defs>
          <RadialGradient cx="50%" cy="50%" id={gradientId} r="50%">
            <Stop offset="0%" stopColor={color} stopOpacity={0.16 * intensity} />
            <Stop offset="38%" stopColor={color} stopOpacity={0.1 * intensity} />
            <Stop offset="72%" stopColor={color} stopOpacity={0.035 * intensity} />
            <Stop offset="100%" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect fill={`url(#${gradientId})`} height="100%" width="100%" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute' },
});
