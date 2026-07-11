import { Check } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, BottomSheet } from '@/components/ui';
import { colors, fonts, radii, spacing } from '@/theme';

type Props = {
  visible: boolean;
  total: number;
  current: number;
  visited: Set<number>;
  onSelect: (index: number) => void;
  onClose: () => void;
};

export function AnswerCardSheet({ visible, total, current, visited, onSelect, onClose }: Props) {
  return (
    <BottomSheet accessibilityLabel="答题卡" onClose={onClose} visible={visible}>
      <AppText variant="sectionTitle">答题卡</AppText>
      <View style={styles.legend}>
        <Legend color={colors.primary} label="当前" />
        <Legend color={colors.primary10} label="已学" />
        <Legend color={colors.background} label="未学" outlined />
      </View>
      <View style={styles.grid}>
        {Array.from({ length: total }, (_, index) => {
          const isCurrent = index === current;
          const isVisited = visited.has(index);
          return (
            <Pressable
              accessibilityLabel={`第 ${index + 1} 题`}
              accessibilityState={{ selected: isCurrent }}
              key={index}
              onPress={() => onSelect(index)}
              style={({ pressed }) => [
                styles.number,
                isCurrent ? styles.numberCurrent : isVisited ? styles.numberVisited : null,
                pressed ? styles.pressed : null,
              ]}
            >
              <AppText
                color={isCurrent ? colors.primaryForeground : isVisited ? colors.primary : colors.foreground}
                style={styles.numberText}
                variant="button"
              >
                {index + 1}
              </AppText>
              {isVisited && !isCurrent ? <Check color={colors.primary} size={10} style={styles.check} /> : null}
            </Pressable>
          );
        })}
      </View>
    </BottomSheet>
  );
}

function Legend({ color, label, outlined = false }: { color: string; label: string; outlined?: boolean }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }, outlined ? styles.outlined : null]} />
      <AppText variant="caption">{label}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  legend: { flexDirection: 'row', gap: spacing[4], marginTop: spacing[4] },
  legendItem: { alignItems: 'center', flexDirection: 'row', gap: spacing[1.5] },
  legendDot: { borderRadius: radii.full, height: 12, width: 12 },
  outlined: { borderColor: colors.border, borderWidth: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[3], paddingBottom: spacing[5], paddingTop: spacing[4] },
  number: { alignItems: 'center', aspectRatio: 1, backgroundColor: colors.background, borderColor: colors.border, borderRadius: radii.xl, borderWidth: 1, justifyContent: 'center', position: 'relative', width: '17%' },
  numberCurrent: { backgroundColor: colors.primary, borderColor: colors.primary },
  numberVisited: { backgroundColor: colors.primary10, borderColor: colors.primary20 },
  numberText: { fontFamily: fonts.monoRegular },
  check: { position: 'absolute', right: 4, top: 4 },
  pressed: { opacity: 0.75, transform: [{ scale: 0.95 }] },
});
