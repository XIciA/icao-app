import { useEffect, useId, useRef, useState } from 'react';
import { Animated, AppState, Keyboard, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, Line, Mask, Rect } from 'react-native-svg';
import { AppText } from '@/components/ui';
import { colors, radii, spacing } from '@/theme';
import { guidePlacement, type Box } from './guide-placement';
import type { GuidePrompt } from './GuideBindings';

export type GuideNode = { id: string; layer: string; node: View };
const same = (a?: Box, b?: Box) => !!a && !!b && (['x', 'y', 'width', 'height'] as const).every(key => Math.abs(a[key] - b[key]) < 1);
/** A transparent spotlight over the actual control, never a cloned interactive target. */
export function GuideOverlay({ prompt, nodes, layer, topLayer }: { prompt: GuidePrompt | null; nodes: Map<string, GuideNode>; layer: string; topLayer: string }) {
  const insets = useSafeAreaInsets(), maskId = useId().replace(/:/g, '');
  const root = useRef<View>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [focus, setFocus] = useState<{ key: string; box: Box }>();
  const [keyboardTop, setKeyboardTop] = useState<number>();
  const [rootY, setRootY] = useState(0);
  const [textHeight, setTextHeight] = useState(110);
  const [foreground, setForeground] = useState(true);
  const [compactCollapsed, setCompactCollapsed] = useState(false);
  const [fallbackReady, setFallbackReady] = useState(false);
  const targetId = prompt?.target;
  const key = `${layer}:${targetId}`;
  useEffect(() => {
    setCompactCollapsed(false);
    setFallbackReady(false);
    const timer = setTimeout(() => setFallbackReady(true), 500);
    return () => clearTimeout(timer);
  }, [key, layer, topLayer]);
  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', e => setKeyboardTop(e.endCoordinates.screenY));
    const hidden = Keyboard.addListener('keyboardDidHide', () => setKeyboardTop(undefined));
    const app = AppState.addEventListener('change', value => setForeground(value === 'active'));
    return () => { shown.remove(); hidden.remove(); app.remove(); };
  }, []);
  useEffect(() => {
    if (!targetId || layer !== topLayer || !foreground) { setFocus(undefined); return; }
    let alive = true, frame = 0, busy = false, started = 0, serial = 0;
    // Track the real target during movement. Clearing a valid spotlight on every
    // changing frame flashes the whole screen and can blur active text inputs.
    const tick = () => {
      if (!alive) return;
      frame = requestAnimationFrame(tick);
      if (busy && Date.now() - started > 150) { busy = false; serial++; }
      if (busy || !root.current) return;
      busy = true; started = Date.now(); const sample = ++serial;
      root.current.measureInWindow((rx, ry) => {
        if (!alive || sample !== serial) return;
        setRootY(ry);
        const candidates = [...nodes.values()].filter(value => value.id === targetId && value.layer === layer);
        const check = (index: number) => {
          if (!alive || sample !== serial) return;
          const candidate = candidates[index];
          if (!candidate) { busy = false; setFocus(undefined); return; }
          candidate.node.measureInWindow((x, y, width, height) => {
            if (!alive || sample !== serial) return;
            const maxHeight = Math.min(size.height, keyboardTop === undefined ? size.height : keyboardTop - ry);
            if (width <= 0 || height <= 0 || x + width <= rx || x >= rx + size.width || y + height <= ry || y >= ry + maxHeight) { check(index + 1); return; }
            const left = Math.max(0, x - rx - 5), top = Math.max(0, y - ry - 5);
            const box = { x: left, y: top, width: Math.min(size.width, x - rx + width + 5) - left, height: Math.min(maxHeight, y - ry + height + 5) - top };
            busy = false;
            setFocus(old => old?.key === key && same(old.box, box) ? old : { key, box });
          });
        };
        check(0);
      });
    };
    tick();
    return () => { alive = false; cancelAnimationFrame(frame); };
  }, [foreground, key, keyboardTop, layer, nodes, targetId, size.height, size.width, topLayer]);
  const measured = focus?.key === key ? focus.box : undefined;
  const height = keyboardTop === undefined ? size.height : Math.min(size.height, keyboardTop - rootY);
  const target = measured && prompt?.next ? { ...measured, height: Math.min(measured.height, Math.max(44, height - textHeight - insets.top - insets.bottom - 160)) } : measured;
  const position = guidePlacement(target, size.width, height, textHeight, { top: layer === 'root' ? insets.top + 48 : 48, bottom: insets.bottom + 60 });
  const show = !!target && !position.compact;
  const dim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const animation = Animated.timing(dim, { toValue: show ? 1 : 0, duration: 140, useNativeDriver: Platform.OS !== 'web' });
    animation.start();
    return () => animation.stop();
  }, [dim, show]);
  if (!prompt || layer !== topLayer || !foreground) return null;
  const showCompact = !show && fallbackReady && size.width > 0 && height > 0;
  const blocks = show ? [
    { left: 0, top: 0, width: size.width, height: target.y },
    { left: 0, top: target.y + target.height, width: size.width, height: Math.max(0, height - target.y - target.height) },
    { left: 0, top: target.y, width: target.x, height: target.height },
    { left: target.x + target.width, top: target.y, width: Math.max(0, size.width - target.x - target.width), height: target.height },
  ] : [];
  const lineX = target ? Math.max(position.x + 12, Math.min(position.x + position.width - 12, target.x + target.width / 2)) : 0;
  const lineStart = target ? position.above ? target.y - 3 : target.y + target.height + 3 : 0;
  const lineEnd = position.above ? position.y + textHeight + 4 : position.y - 4;
  return <View ref={root} collapsable={false} pointerEvents="box-none" onLayout={e => setSize(e.nativeEvent.layout)} style={styles.root} testID="guide-overlay">
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: dim }]}><Svg pointerEvents="none" width={size.width} height={height} style={StyleSheet.absoluteFill}>
        <Defs><Mask id={maskId}><Rect width={size.width} height={height} fill="white" />{show ? <Rect x={target.x} y={target.y} width={target.width} height={target.height} rx={radii.md} fill="black" /> : null}</Mask></Defs>
        <Rect width={size.width} height={height} fill={colors.foreground} fillOpacity={0.68} mask={`url(#${maskId})`} />
        {show ? <><Line x1={lineX} y1={lineStart} x2={lineX} y2={lineEnd} stroke={colors.card} strokeWidth={1} />
        <Circle cx={lineX} cy={lineStart} r={2} fill={colors.card} /></> : null}
      </Svg></Animated.View>
    {show ? <>
      {blocks.map((block, index) => <View key={index} accessible={false} onStartShouldSetResponder={() => true} style={[styles.block, block]} />)}
      <View onLayout={e => setTextHeight(e.nativeEvent.layout.height)} style={[styles.hint, { left: position.x, top: position.y, width: position.width }]} testID="guide-hint">
        <AppText color={colors.card} variant="button" style={styles.center}>{prompt.title}</AppText>
        <AppText accessibilityLiveRegion="polite" color={colors.card} variant="body" style={styles.center}>{prompt.text}</AppText>
        {prompt.error ? <AppText color={colors.card} variant="caption">{prompt.error}</AppText> : null}
        {prompt.next ? <Pressable accessibilityRole="button" onPress={prompt.next} style={[styles.action, styles.actionOnOverlay]}><AppText color={colors.card} variant="button">{prompt.nextLabel ?? '知道了'}</AppText></Pressable> : null}
      </View>
    </> : null}
    {showCompact ? <View style={[styles.compactHint, { left: position.x, top: position.y, width: position.width }]} testID="guide-compact-hint">
      <Pressable accessibilityRole="button" accessibilityLabel={compactCollapsed ? '展开教学提示' : '收起教学提示'} onPress={() => setCompactCollapsed(value => !value)} style={styles.compactToggle}>
        <AppText variant="button" style={{ flex: 1 }}>{prompt.title}</AppText>
        <AppText variant="micro">{compactCollapsed ? '展开' : '收起'}</AppText>
      </Pressable>
      {!compactCollapsed ? <>
        <AppText accessibilityLiveRegion="polite" variant="body">{prompt.text}</AppText>
        {prompt.error ? <AppText color={colors.destructive} variant="caption">{prompt.error}</AppText> : null}
        {prompt.next ? <Pressable accessibilityRole="button" onPress={prompt.next} style={[styles.action, styles.actionOnPage]}><AppText color={colors.primary} variant="button">{prompt.nextLabel ?? '知道了'}</AppText></Pressable> : null}
      </> : null}
    </View> : null}
    <Pressable accessibilityRole="button" accessibilityLabel="跳过教学" onPress={prompt.skip} style={[styles.skip, target && target.y + target.height > height - insets.bottom - 85 ? { top: layer === 'root' ? insets.top + 8 : 8 } : { bottom: size.height - height + insets.bottom + 16 }, !show && styles.skipOnPage]}><AppText color={show ? colors.card : colors.mutedForeground} variant="caption">跳过教学</AppText></Pressable>
  </View>;
}
const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, zIndex: 10000 },
  block: { position: 'absolute' },
  compactHint: { position: 'absolute', backgroundColor: colors.card, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth, borderRadius: radii.md, paddingHorizontal: spacing[3], paddingBottom: spacing[2], gap: spacing[1] },
  compactToggle: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  hint: { position: 'absolute', gap: spacing[2] },
  center: { textAlign: 'center' },
  action: { minHeight: 44, alignSelf: 'center', justifyContent: 'center', paddingHorizontal: spacing[4], borderRadius: radii.md, borderWidth: 1 },
  actionOnOverlay: { borderColor: colors.card, backgroundColor: 'rgba(255,255,255,0.12)' },
  actionOnPage: { borderColor: colors.primary20, backgroundColor: colors.primary06 },
  skip: { position: 'absolute', right: spacing[4], minHeight: 44, paddingHorizontal: spacing[4], borderRadius: radii.full, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.card, justifyContent: 'center' },
  skipOnPage: { backgroundColor: colors.background, borderColor: colors.border },
});
