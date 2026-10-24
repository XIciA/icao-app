import { useEffect, useId, useRef, useState } from 'react';
import { AppState, Keyboard, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, Line, Mask, Rect } from 'react-native-svg';
import { AppText } from '@/components/ui';
import { colors, radii, spacing } from '@/theme';
import { guidePlacement, guideSkipPlacement, type Box } from './guide-placement';
import type { GuidePrompt } from './GuideBindings';

export type GuideNode = { id: string; layer: string; node: View };
const same = (a?: Box, b?: Box) => !!a && !!b && (['x', 'y', 'width', 'height'] as const).every(key => Math.abs(a[key] - b[key]) < 1);
/** Session visibility owns the backdrop; target readiness only owns the hole and callout. */
export function GuideOverlay({ prompt, nodes, layer, topLayer }: { prompt: GuidePrompt | null; nodes: Map<string, GuideNode>; layer: string; topLayer: string }) {
  const insets = useSafeAreaInsets(), maskId = useId().replace(/:/g, '');
  const root = useRef<View>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [focus, setFocus] = useState<{ key: string; box: Box }>();
  const [keyboardTop, setKeyboardTop] = useState<number>();
  const [rootY, setRootY] = useState(0);
  const [textHeight, setTextHeight] = useState(110);
  const [foreground, setForeground] = useState(true);
  const [waiting, setWaiting] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const skipPosition = useRef<Box | undefined>(undefined);
  const active = !!prompt && layer === topLayer && foreground;
  const targetId = prompt?.target;
  const key = `${layer}:${prompt?.identity ?? targetId}:${targetId}`;
  const hasFocus = focus?.key === key;
  const interrupted = !!prompt?.activity;
  const transitioning = !!prompt?.transitioning;
  useEffect(() => {
    setWaiting(false);
    if (!active || hasFocus || transitioning) return;
    const timer = setTimeout(() => setWaiting(true), 8000);
    return () => clearTimeout(timer);
  }, [key, active, hasFocus, attempt, transitioning]);
  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', e => setKeyboardTop(e.endCoordinates.screenY));
    const moved = Keyboard.addListener('keyboardWillChangeFrame', e => setKeyboardTop(e.endCoordinates.screenY));
    const hidden = Keyboard.addListener('keyboardDidHide', () => setKeyboardTop(undefined));
    const app = AppState.addEventListener('change', value => {
      setForeground(value === 'active');
      if (value === 'active') setKeyboardTop(Keyboard.metrics()?.screenY);
    });
    return () => { shown.remove(); moved.remove(); hidden.remove(); app.remove(); };
  }, []);
  useEffect(() => {
    if (!active || transitioning || !targetId) { setFocus(undefined); return; }
    let alive = true, frame = 0, busy = false, started = 0, serial = 0;
    let previous: Box | undefined, stable = 0;
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
          if (!candidate) { busy = false; previous = undefined; stable = 0; setFocus(undefined); return; }
          candidate.node.measureInWindow((x, y, width, height) => {
            if (!alive || sample !== serial) return;
            if (width <= 0 || height <= 0 || x + width <= rx || x >= rx + size.width || y + height <= ry || y >= ry + size.height) { check(index + 1); return; }
            const left = Math.max(0, x - rx - 5), top = Math.max(0, y - ry - 5);
            const box = { x: left, y: top, width: Math.min(size.width, x - rx + width + 5) - left, height: Math.min(size.height, y - ry + height + 5) - top };
            busy = false;
            stable = same(previous, box) ? stable + 1 : 0;
            previous = box;
            setFocus(old => old?.key === key ? same(old.box, box) ? old : { key, box } : stable >= 2 ? { key, box } : undefined);
          });
        };
        check(0);
      });
    };
    tick();
    return () => { alive = false; cancelAnimationFrame(frame); };
  }, [active, transitioning, key, layer, nodes, targetId, size.height, size.width, attempt]);
  // Keyboard bounds affect callout placement, never the full-screen backdrop.
  const availableHeight = Math.max(0, Math.min(size.height, keyboardTop === undefined ? size.height : keyboardTop - rootY));
  const target = !transitioning && hasFocus ? focus.box : undefined;
  const skipTop = layer === 'root' ? insets.top : 8;
  if (target || !skipPosition.current || skipPosition.current.width !== Math.min(112, Math.max(0, size.width - 32))) skipPosition.current = guideSkipPlacement(target, size.width, skipTop);
  const skipBox = skipPosition.current;
  const position = guidePlacement(target, size.width, availableHeight, textHeight, { top: Math.max(skipTop + 44, skipBox.y + skipBox.height + 8), bottom: insets.bottom + 160 });
  const show = !!target && !position.compact;

  // A measured target may temporarily leave the viewport. That never ends teaching.
  const constrained = !!target && position.compact;
  const status = !show && !transitioning && (interrupted || waiting || constrained);
  const statusPosition = guidePlacement(target, size.width, availableHeight, textHeight, { top: skipBox.y + skipBox.height + 8, bottom: insets.bottom + 160 });
  const hintPosition = show ? position : statusPosition;
  const showHint = show || status;
  const lineX = target ? Math.max(position.x + 12, Math.min(position.x + position.width - 12, target.x + target.width / 2)) : 0;
  const lineStart = target ? position.above ? target.y - 3 : target.y + target.height + 3 : 0;
  const lineEnd = position.above ? position.y + textHeight + 4 : position.y - 4;
  if (!active || !prompt) return null;
  const blocks = target ? [
    { left: 0, top: layer === 'root' ? insets.top + 48 : 0, width: size.width, height: Math.max(0, target.y - (layer === 'root' ? insets.top + 48 : 0)) },
    { left: 0, top: target.y + target.height, width: size.width, height: Math.max(0, size.height - target.y - target.height) },
    { left: 0, top: target.y, width: target.x, height: target.height },
    { left: target.x + target.width, top: target.y, width: Math.max(0, size.width - target.x - target.width), height: target.height },
  ] : [{ left: 0, top: skipTop + 44, width: size.width, height: Math.max(0, size.height - skipTop - 44) }];
  return <View ref={root} collapsable={false} pointerEvents="box-none" onLayout={e => setSize(e.nativeEvent.layout)} style={styles.root} testID="guide-overlay">
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, !size.height && { backgroundColor: colors.foreground, opacity: 0.68 }]} testID="guide-backdrop"><Svg testID="guide-mask" pointerEvents="none" width={size.width} height={size.height} style={StyleSheet.absoluteFill}>
      <Defs><Mask id={maskId}><Rect width={size.width} height={size.height} fill="white" />{show ? <Rect x={target.x} y={target.y} width={target.width} height={target.height} rx={radii.md} fill="black" /> : null}</Mask></Defs>
      <Rect width={size.width} height={size.height} fill={colors.foreground} fillOpacity={0.68} mask={`url(#${maskId})`} />
      {show ? <><Line x1={lineX} y1={lineStart} x2={lineX} y2={lineEnd} stroke={colors.card} strokeWidth={1} /><Circle cx={lineX} cy={lineStart} r={2} fill={colors.card} /></> : null}
    </Svg></View>
    {blocks.map((block, index) => <View key={index} accessible={false} pointerEvents={layer !== 'root' || target && (prompt.reading || prompt.interactive) ? 'none' : 'auto'} style={[styles.block, block]} />)}
    {showHint ? <View onLayout={e => setTextHeight(e.nativeEvent.layout.height)} style={[styles.hint, { left: hintPosition.x, top: hintPosition.y, width: hintPosition.width }]} testID="guide-hint" accessibilityState={{ busy: prompt.activity === 'waiting' }}>
      <AppText color={colors.card} variant="button" style={styles.center}>{prompt.title}</AppText>
      <AppText accessibilityLiveRegion="polite" color={colors.card} variant="body" style={styles.center}>{status && !interrupted && !constrained ? '当前目标尚未就绪，可返回重试或跳过教学。' : prompt.text}</AppText>
      {prompt.error ? <AppText color={colors.card} variant="caption">{prompt.error}</AppText> : null}
      {waiting && !interrupted ? <Pressable accessibilityRole="button" onPress={() => setAttempt(value => value + 1)} style={styles.action}><AppText color={colors.card}>重新定位</AppText></Pressable> : null}
      {prompt.next && (!status || interrupted || constrained) ? <Pressable accessibilityRole="button" onPress={prompt.next} style={styles.action}><AppText color={colors.card} variant="button">{prompt.nextLabel ?? '继续'}</AppText></Pressable> : null}
    </View> : null}
    <Pressable accessibilityRole="button" accessibilityLabel="跳过教学" onPress={prompt.skip} style={[styles.skip, { left: skipBox.x, top: skipBox.y, width: skipBox.width }]}><AppText color={colors.card} variant="caption">跳过教学</AppText></Pressable>
  </View>;
}
const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, zIndex: 10000 },
  block: { position: 'absolute' },
  hint: { position: 'absolute', gap: spacing[2] },
  center: { textAlign: 'center' },
  action: { minHeight: 44, alignSelf: 'center', justifyContent: 'center', paddingHorizontal: spacing[4], borderRadius: radii.md, borderWidth: 1, borderColor: colors.card, backgroundColor: 'rgba(255,255,255,0.12)' },
  skip: { position: 'absolute', minHeight: 44, alignItems: 'center', paddingHorizontal: spacing[3], borderRadius: radii.full, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.card, justifyContent: 'center' },
});
