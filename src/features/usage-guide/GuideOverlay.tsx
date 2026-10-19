import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';
import { AppText } from '@/components/ui';
import { colors, radii, shadows, spacing } from '@/theme';
import { guidePlacement, type Box } from './guide-placement';
import type { GuidePrompt } from './GuideBindings';

export type GuideNode = { id: string; layer: string; node: View };
export function GuideOverlay({ prompt, nodes, layer, topLayer }: { prompt: GuidePrompt | null; nodes: Map<string, GuideNode>; layer: string; topLayer: string }) {
  const root = useRef<View>(null); const [size, setSize] = useState({ width: 0, height: 0 }); const [target, setTarget] = useState<Box>(); const [bubbleHeight, setBubbleHeight] = useState(120);
  const measure = useCallback(() => {
    const candidates = [...nodes.values()].filter(item => item.id === prompt?.target && item.layer === layer).reverse();
    const update = (next?: Box) => setTarget(old => !next ? undefined : old && Object.keys(next).every(key => Math.abs(old[key as keyof Box] - next[key as keyof Box]) < 1) ? old : next);
    root.current?.measureInWindow((rx, ry) => {
      const check = (index: number) => {
        const item = candidates[index]; if (!item) { update(); return; }
        item.node.measureInWindow((x, y, width, height) => {
          const left = Math.max(0, x - rx), top = Math.max(0, y - ry);
          const right = Math.min(size.width, x - rx + width), bottom = Math.min(size.height, y - ry + height);
          if (width <= 0 || height <= 0 || right <= left || bottom <= top) { check(index + 1); return; }
          update({ x: left, y: top, width: right - left, height: bottom - top });
        });
      };
      check(0);
    });
  }, [layer, nodes, prompt?.target, size]);
  useEffect(() => { if (!prompt || layer !== topLayer) return; measure(); const timer = setInterval(measure, 180); return () => clearInterval(timer); }, [layer, measure, prompt, topLayer]);
  if (!prompt || layer !== topLayer) return null;
  const position = guidePlacement(target, size.width, size.height, bubbleHeight);
  const tip = target ? Math.max(14, Math.min(position.width - 22, target.x + target.width / 2 - position.x - 4)) : 24;
  return <View pointerEvents="box-none" ref={root} onLayout={event => setSize(event.nativeEvent.layout)} style={styles.root} testID="guide-overlay">
    {target && !prompt.completed ? <View pointerEvents="none" style={[styles.haloOuter, { left: target.x - 7, top: target.y - 7, width: target.width + 14, height: target.height + 14 }]}><View style={styles.haloInner} /></View> : null}
    {position.line && target ? <Svg pointerEvents="none" style={StyleSheet.absoluteFill}><Line x1={target.x + target.width / 2} y1={target.y + target.height / 2} x2={position.x + position.width / 2} y2={position.y} stroke={colors.mutedForeground} strokeOpacity={0.45} strokeWidth={1} /><Circle cx={target.x + target.width / 2} cy={target.y + target.height / 2} r={2.5} fill={colors.mutedForeground} /></Svg> : null}
    {size.width > 0 ? <View onLayout={event => setBubbleHeight(event.nativeEvent.layout.height)} style={[styles.bubble, { left: position.x, top: position.y, width: position.width }]} testID="guide-bubble">
      {target && !position.line && !prompt.completed ? <View pointerEvents="none" style={[styles.tip, { left: tip }, position.above ? styles.tipBottom : styles.tipTop]} /> : null}
      <View style={styles.heading}><AppText variant="micro">{prompt.completed ? '已完成' : `${prompt.index + 1} / ${prompt.total}`}</AppText><Pressable accessibilityLabel="退出教程" hitSlop={8} onPress={prompt.exit}><AppText variant="body">×</AppText></Pressable></View>
      <AppText accessibilityLiveRegion="polite" variant="caption">{prompt.text}</AppText>
      {prompt.error ? <AppText color={colors.destructive} variant="micro">{prompt.error}</AppText> : null}
      <View style={styles.actions}><Pressable accessibilityRole="button" hitSlop={6} onPress={prompt.skip}><AppText variant="micro">{prompt.completed ? '重新体验' : '跳过'}</AppText></Pressable>{prompt.next ? <Pressable accessibilityRole="button" hitSlop={6} onPress={prompt.next}><AppText color={colors.primary} variant="micro">{prompt.completed ? '返回使用指南' : '继续'}</AppText></Pressable> : null}</View>
    </View> : null}
  </View>;
}
const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, zIndex: 10000 },
  haloOuter: { position: 'absolute', borderRadius: radii.xl, backgroundColor: colors.primary06, padding: 4, ...shadows.floating, shadowColor: colors.primary, shadowOpacity: 0.12, shadowRadius: 12 },
  haloInner: { flex: 1, borderRadius: radii.xl, backgroundColor: colors.primary06 },
  bubble: { position: 'absolute', backgroundColor: colors.card, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth, borderRadius: radii.lg, padding: spacing[3], gap: spacing[2], ...shadows.floating },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  actions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: spacing[1] },
  tip: { position: 'absolute', width: 9, height: 9, backgroundColor: colors.card, transform: [{ rotate: '45deg' }], borderColor: colors.border },
  tipTop: { top: -5, borderTopWidth: StyleSheet.hairlineWidth, borderLeftWidth: StyleSheet.hairlineWidth }, tipBottom: { bottom: -5, borderBottomWidth: StyleSheet.hairlineWidth, borderRightWidth: StyleSheet.hairlineWidth },
});
