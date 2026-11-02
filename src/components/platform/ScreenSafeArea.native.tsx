import { StyleSheet, View, type ViewProps } from 'react-native';
import { useSafeAreaInsets, type Edge } from 'react-native-safe-area-context';

/** Apply screen insets in the same render as its content, including on reattachment. */
export function ScreenSafeArea({ edges = ['top', 'right', 'bottom', 'left'], style, ...props }: ViewProps & { edges?: readonly Edge[] }) {
  const insets = useSafeAreaInsets();
  const base = StyleSheet.flatten(style) ?? {};
  const padding = (edge: Edge) => {
    const value = edge === 'top' ? base.paddingTop ?? base.paddingVertical ?? base.padding
      : edge === 'bottom' ? base.paddingBottom ?? base.paddingVertical ?? base.padding
        : edge === 'left' ? base.paddingLeft ?? base.paddingHorizontal ?? base.padding
          : base.paddingRight ?? base.paddingHorizontal ?? base.padding;
    return (typeof value === 'number' ? value : 0) + insets[edge];
  };
  return <View {...props} style={[style, {
    ...(edges.includes('top') ? { paddingTop: padding('top') } : {}),
    ...(edges.includes('bottom') ? { paddingBottom: padding('bottom') } : {}),
    ...(edges.includes('left') ? { paddingLeft: padding('left') } : {}),
    ...(edges.includes('right') ? { paddingRight: padding('right') } : {}),
  }]} />;
}
