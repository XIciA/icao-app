import { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Line } from 'react-native-svg';
import { AppText } from '@/components/ui';
import { colors, radii, shadows, spacing } from '@/theme';
import { guidePlacement, type Box } from './guide-placement';
import type { GuidePrompt } from './GuideBindings';

export type GuideNode = { id: string; layer: string; node: View };
export function GuideOverlay({ prompt, nodes, layer, topLayer }: { prompt: GuidePrompt | null; nodes: Map<string, GuideNode>; layer: string; topLayer: string }) {
  const insets = useSafeAreaInsets();
  const [rootY, setRootY] = useState(0);
  const [keyboardTop, setKeyboardTop] = useState<number>();
  const [hidden, setHidden] = useState(false);
  const measuredFor = useRef('');
  const [targetFor, setTargetFor] = useState('');
  useEffect(() => { setHidden(false); }, [prompt?.target, prompt?.completed]);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', event => setKeyboardTop(event.endCoordinates.screenY));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardTop(undefined));
    return () => { show.remove(); hide.remove(); };
  }, []);
  const root = useRef<View>(null); const [size, setSize] = useState({ width: 0, height: 0 }); const [target, setTarget] = useState<Box>(); const [bubbleHeight, setBubbleHeight] = useState(120);
  const measure = useCallback(() => {
    const token = `${layer}:${prompt?.target}`; measuredFor.current = token;
    const candidates = [...nodes.values()].filter(item => item.id === prompt?.target && item.layer === layer);
    const update = (next?: Box) => { if (measuredFor.current !== token) return; setTargetFor(token); setTarget(old => !next ? undefined : old && Object.keys(next).every(key => Math.abs(old[key as keyof Box] - next[key as keyof Box]) < 1) ? old : next); };
    root.current?.measureInWindow((rx, ry) => {
      setRootY(ry);
      const check = (index: number) => {
        const item = candidates[index]; if (!item) { update(); return; }
        item.node.measureInWindow((x, y, width, height) => {
          const left = Math.max(0, x - rx), top = Math.max(0, y - ry);
          const right = Math.min(size.width, x - rx + width), bottom = Math.min(Math.min(size.height, keyboardTop === undefined ? size.height : keyboardTop - ry), y - ry + height);
          if (width <= 0 || height <= 0 || right <= left || bottom <= top) { check(index + 1); return; }
          update({ x: left, y: top, width: right - left, height: bottom - top });
        });
      };
      check(0);
    });
  }, [layer, nodes, prompt?.target, size, keyboardTop]);
  useEffect(() => { if (!prompt || layer !== topLayer) return; measure(); const timer = setInterval(measure, 180); return () => clearInterval(timer); }, [layer, measure, prompt, topLayer]);
  if (!prompt || layer !== topLayer) return null;
  const focus = targetFor === `${layer}:${prompt.target}` ? target : undefined;
  const availableHeight = keyboardTop === undefined ? size.height : Math.min(size.height, keyboardTop - rootY);
  const position = guidePlacement(focus, size.width, availableHeight, bubbleHeight, { top: layer === 'root' ? insets.top : 0, bottom: insets.bottom });
  const tip = focus ? Math.max(14, Math.min(position.width - 22, focus.x + focus.width / 2 - position.x - 4)) : 24;
  return <View pointerEvents="box-none" collapsable={false} ref={root} onLayout={event => setSize(event.nativeEvent.layout)} style={styles.root} testID="guide-overlay">
    {focus && !prompt.completed ? <View testID="guide-focus" pointerEvents="none" style={[styles.focus, { left: focus.x - 4, top: focus.y - 4, width: focus.width + 8, height: focus.height + 8 }]} /> : null}
    {position.line && focus ? <Svg pointerEvents="none" style={StyleSheet.absoluteFill}><Line x1={focus.x + focus.width / 2} y1={focus.y + focus.height / 2} x2={position.x + position.width / 2} y2={position.y} stroke={colors.mutedForeground} strokeOpacity={0.45} strokeWidth={1} /><Circle cx={focus.x + focus.width / 2} cy={focus.y + focus.height / 2} r={2.5} fill={colors.mutedForeground} /></Svg> : null}
    {size.width > 0 && !hidden && (!prompt.completed || !prompt.target || focus) ? <View onLayout={event => setBubbleHeight(event.nativeEvent.layout.height)} style={[styles.bubble, { left: position.x, top: position.y, width: position.width, maxHeight: Math.max(48, availableHeight - position.y - insets.bottom - 16) }]} testID="guide-bubble">
      {focus && !position.line && !position.compact ? <View pointerEvents="none" style={[styles.tip, { left: tip }, position.above ? styles.tipBottom : styles.tipTop]} /> : null}
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.bubbleContent}>
      <View style={styles.heading}><AppText variant="micro">{prompt.completed ? '已完成' : `${prompt.index + 1} / ${prompt.total}`}</AppText><Pressable accessibilityLabel="退出教程" hitSlop={8} onPress={prompt.exit} style={styles.smallAction}><AppText variant="body">×</AppText></Pressable></View>
      <AppText accessibilityLiveRegion="polite" variant="caption">{prompt.text}</AppText>
      {!focus && prompt.target && !prompt.completed ? <AppText color={colors.mutedForeground} variant="micro">目标暂未显示，页面加载后可滚动查找。</AppText> : null}
      {position.compact ? <Pressable accessibilityRole="button" onPress={() => setHidden(true)}><AppText color={colors.primary} variant="micro">收起提示，操作页面</AppText></Pressable> : null}
      {prompt.error ? <AppText color={colors.destructive} variant="micro">{prompt.error}</AppText> : null}
      <View style={styles.actions}><Pressable accessibilityRole="button" hitSlop={6} onPress={prompt.skip} style={styles.smallAction}><AppText variant="micro">{prompt.completed ? '重新体验' : prompt.skipLabel ?? '跳过'}</AppText></Pressable>{prompt.next ? <Pressable accessibilityRole="button" hitSlop={6} onPress={prompt.next} style={styles.smallAction}><AppText color={colors.primary} variant="micro">{prompt.completed ? '返回使用指南' : prompt.index + 1 === prompt.total ? '完成引导' : '继续'}</AppText></Pressable> : null}</View>
      </ScrollView>
    </View> : null}
    {hidden ? <Pressable accessibilityRole="button" accessibilityLabel="展开教程提示" onPress={() => setHidden(false)} style={[styles.restore, { top: (layer === 'root' ? insets.top : 0) + 16 }]}><AppText color={colors.primary} variant="micro">{prompt.completed ? '教程已完成' : `教程 ${prompt.index + 1}/${prompt.total}`}</AppText></Pressable> : null}
  </View>;
}
const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, zIndex: 10000 },
  focus: { position: 'absolute', borderRadius: radii.lg, borderColor: colors.primary, borderWidth: 2 },
  restore: { position: 'absolute', right: 16, padding: spacing[2], borderRadius: radii.md, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.card },
  bubble: { position: 'absolute', backgroundColor: colors.card, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth, borderRadius: radii.lg, ...shadows.floating },
  bubbleContent: { padding: spacing[3], gap: spacing[2] },
  smallAction: { minWidth: 44, minHeight: 36, justifyContent: 'center', alignItems: 'center' },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  actions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: spacing[1] },
  tip: { position: 'absolute', width: 9, height: 9, backgroundColor: colors.card, transform: [{ rotate: '45deg' }], borderColor: colors.border },
  tipTop: { top: -5, borderTopWidth: StyleSheet.hairlineWidth, borderLeftWidth: StyleSheet.hairlineWidth }, tipBottom: { bottom: -5, borderBottomWidth: StyleSheet.hairlineWidth, borderRightWidth: StyleSheet.hairlineWidth },
});
