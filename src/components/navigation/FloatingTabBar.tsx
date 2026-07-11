import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Compass, Library, UserRound, type LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts, radii, shadows, spacing } from '@/theme';

import { AppText } from '../ui';

const metadata: Record<string, { label: string; icon: LucideIcon }> = {
  index: { label: '题库', icon: Library },
  discover: { label: '发现', icon: Compass },
  profile: { label: '我的', icon: UserRound },
};

export function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View pointerEvents="box-none" style={[styles.outer, { paddingBottom: Math.max(insets.bottom, spacing[4]) }]}>
      <View style={styles.pill}>
        {state.routes.map((route, index) => {
          const current = metadata[route.name];
          if (!current) return null;

          const focused = state.index === index;
          const Icon = current.icon;

          return (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={focused ? { selected: true } : {}}
              accessibilityLabel={descriptors[route.key].options.tabBarAccessibilityLabel ?? current.label}
              key={route.key}
              onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
              onPress={() => {
                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
              }}
              style={({ pressed }) => [
                styles.item,
                focused ? styles.itemFocused : null,
                pressed ? styles.itemPressed : null,
              ]}
            >
              <Icon color={focused ? colors.primary : colors.mutedForeground} size={20} strokeWidth={2} />
              {focused ? (
                <AppText color={colors.primary} style={styles.label} variant="button">
                  {current.label}
                </AppText>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    alignItems: 'center',
    bottom: 0,
    left: 0,
    paddingHorizontal: spacing[5],
    position: 'absolute',
    right: 0,
  },
  pill: {
    alignItems: 'center',
    backgroundColor: colors.background72,
    borderColor: colors.border,
    borderRadius: radii.full,
    borderTopColor: 'rgba(255,255,255,0.72)',
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing[1],
    overflow: 'hidden',
    padding: spacing[1.5],
    ...shadows.floating,
  },
  item: {
    alignItems: 'center',
    borderRadius: radii.full,
    flexDirection: 'row',
    gap: spacing[1.5],
    height: 40,
    justifyContent: 'center',
    minWidth: 44,
    paddingHorizontal: spacing[3],
  },
  itemFocused: { backgroundColor: colors.primary10, paddingHorizontal: spacing[4] },
  itemPressed: { opacity: 0.72, transform: [{ scale: 0.95 }] },
  label: { fontFamily: fonts.sansMedium },
});
