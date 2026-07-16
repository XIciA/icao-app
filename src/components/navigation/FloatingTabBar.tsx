import type { MaterialTopTabBarProps } from '@react-navigation/material-top-tabs';
import { Compass, Library, UserRound, type LucideIcon } from 'lucide-react-native';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts, radii, shadows, spacing } from '@/theme';

import { AppText } from '../ui';

const metadata: Record<string, { label: string; icon: LucideIcon }> = {
  index: { label: '题库', icon: Library },
  discover: { label: '发现', icon: Compass },
  profile: { label: '我的', icon: UserRound },
};

export function FloatingTabBar({ state, descriptors, navigation, position }: MaterialTopTabBarProps) {
  const insets = useSafeAreaInsets();
  const inputRange = state.routes.map((_, index) => index);

  return (
    <View pointerEvents="box-none" style={[styles.outer, { paddingBottom: Math.max(insets.bottom, spacing[4]) }]}>
      <View style={styles.pill}>
        {state.routes.map((route, index) => {
          const current = metadata[route.name];
          if (!current) return null;

          const focused = state.index === index;
          const Icon = current.icon;
          const activation = position.interpolate({
            extrapolate: 'clamp',
            inputRange,
            outputRange: inputRange.map((routeIndex) => routeIndex === index ? 1 : 0),
          });
          const iconShift = activation.interpolate({ inputRange: [0, 1], outputRange: [0, -17] });
          const labelShift = activation.interpolate({ inputRange: [0, 1], outputRange: [4, 0] });

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
              style={({ pressed }) => [styles.item, pressed ? styles.itemPressed : null]}
            >
              <Animated.View pointerEvents="none" style={[styles.itemHighlight, { opacity: activation }]} />
              <Animated.View
                pointerEvents="none"
                style={[styles.iconSlot, { transform: [{ translateX: iconShift }] }]}
              >
                <Icon color={colors.mutedForeground} size={20} strokeWidth={2} />
                <Animated.View style={[styles.activeIcon, { opacity: activation }]}>
                  <Icon color={colors.primary} size={20} strokeWidth={2} />
                </Animated.View>
              </Animated.View>
              <Animated.View
                pointerEvents="none"
                style={[styles.labelSlot, { opacity: activation, transform: [{ translateX: labelShift }] }]}
              >
                <AppText color={colors.primary} numberOfLines={1} style={styles.label} variant="button">
                  {current.label}
                </AppText>
              </Animated.View>
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
    zIndex: 50,
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
    height: 40,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    width: 68,
  },
  itemHighlight: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.primary10,
    borderRadius: radii.full,
  },
  itemPressed: { opacity: 0.72, transform: [{ scale: 0.95 }] },
  iconSlot: {
    height: 20,
    left: 24,
    position: 'absolute',
    top: 10,
    width: 20,
  },
  activeIcon: { ...StyleSheet.absoluteFillObject },
  labelSlot: {
    alignItems: 'flex-start',
    bottom: 0,
    justifyContent: 'center',
    left: 35,
    position: 'absolute',
    top: 0,
    width: 30,
  },
  label: { fontFamily: fonts.sansMedium, fontSize: 13 },
});
