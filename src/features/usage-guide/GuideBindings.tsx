import { NavigationContext } from '@react-navigation/native';
import { radii } from '@/theme';
import type { GuideId } from './guide-flows';
import { GuideScrollContext } from './guide-scroll-context';
import { createContext, useContext, useEffect, useLayoutEffect, useId, useRef, useCallback, useState, type PropsWithChildren, type ReactNode, type RefObject } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

export type GuidePrompt = { identity?: string; target: string; title?: string; text: string; index: number; total: number; next?: () => void; nextLabel?: string; skip: () => void; exit: () => void; error?: string; reading?: boolean; interactive?: boolean; activity?: 'waiting' | 'unavailable'; transitioning?: boolean };
export type GuideCheckpoint = { vocabBooks?: string[]; vocabWord?: string; recapEmpty?: boolean; recordsEmpty?: boolean };
export type GuideBinding = {
  event: (id: string) => void;
  rewind?: (step: string) => void;
  confirm?: (step: string, allowed: boolean) => void;
  focus?: (step: string, target: string, text?: string, complete?: boolean) => void;
  availability: (key: string, module: GuideId, message?: string, kind?: 'waiting' | 'unavailable') => void;
  register: (key: string, id: string, layer: string, node: View | null) => void;
  modal: (id: string, open: boolean) => void;
  surface: (layer: string, backdrop?: RefObject<View | null>, backdropOnly?: boolean) => ReactNode;
  offer: (id: GuideId, steps: string[]) => void;
  exit: () => void;
  start: (id: string, restart?: boolean) => Promise<void>;
  current?: string;
  ready?: boolean;
  testingResetAvailable?: boolean;
  resetForTesting?: () => Promise<boolean>;
  retry?: () => void;
  error?: string;
  step?: string;
  target?: string;
  suspend: (value: boolean) => void;
  pause: () => void;
  checkpoint: (value: GuideCheckpoint) => void;
  checkpointData?: GuideCheckpoint;
};
export const GuideBindingContext = createContext<GuideBinding | null>(null);
const LayerContext = createContext('root');

export function useGuide() { return useContext(GuideBindingContext); }
/** Absolutely positioned measurement anchor. Adds no space and intercepts no touch. */
export function GuideAnchor({ id }: { id: string }) {
  const guide = useGuide(); const layer = useContext(LayerContext); const key = useId(); const node = useRef<View>(null);
  const reveal = useContext(GuideScrollContext);
  const active = guide?.target === id;
  const navigation = useContext(NavigationContext);
  const suspend = guide?.suspend;
  const [focused, setFocused] = useState(navigation?.isFocused() ?? true);
  useEffect(() => {
    if (!navigation) return;
    setFocused(navigation.isFocused());
    const onFocus = navigation.addListener('focus', () => setFocused(true));
    const onBlur = navigation.addListener('blur', () => setFocused(false));
    const onStart = navigation.addListener('transitionStart' as never, () => setFocused(false));
    const restore = () => { setFocused(navigation.isFocused()); suspend?.(false); };
    const onEnd = navigation.addListener('transitionEnd' as never, restore);
    const onCancel = navigation.addListener('gestureCancel' as never, restore);
    return () => { onFocus(); onBlur(); onStart(); onEnd(); onCancel(); };
  }, [navigation, suspend]);
  const revealTarget = useCallback(() => { if (active && focused && node.current) reveal?.(node.current, id); }, [active, focused, id, reveal]);
  useEffect(() => { const frame = requestAnimationFrame(revealTarget); return () => cancelAnimationFrame(frame); }, [revealTarget]);
  const register = guide?.register;
  useEffect(() => { register?.(key, id, layer, focused ? node.current : null); return () => register?.(key, id, layer, null); }, [focused, id, key, layer, register]);
  if (!guide) return null;
  return <View accessible={false} collapsable={false} pointerEvents="none" testID={`guide-anchor-${id}`} ref={node} onLayout={revealTarget} style={StyleSheet.absoluteFillObject} />;
}
export function GuideModalScope({ children, visible, backdrop }: PropsWithChildren<{ visible: boolean; backdrop?: RefObject<View | null> }>) {
  const guide = useGuide(); const id = useId(); const modal = guide?.modal;
  useLayoutEffect(() => { if (visible) modal?.(id, true); return () => modal?.(id, false); }, [id, modal, visible]);
  return <LayerContext.Provider value={id}>{children}{visible ? (backdrop ? guide?.surface(id, backdrop) : guide?.surface(id)) : null}</LayerContext.Provider>;
}

/** The sheet's mask shares its native transform and clipping, so it cannot lag
 * behind the panel or darken an already dimmed portion of the underlying page. */
export function GuideSheetBackdrop() {
  const guide = useGuide();
  const layer = useContext(LayerContext);
  if (Platform.OS === 'web') return null;
  return <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { overflow: 'hidden', borderTopLeftRadius: radii.xxxl, borderTopRightRadius: radii.xxxl }]}>
    {guide?.surface(layer, undefined, true)}
  </View>;
}

/** An unavailable real feature must remain operable without recording a fake completion. */
export function useGuideAvailability(module: GuideId, message?: string, kind: 'waiting' | 'unavailable' = 'unavailable') {
  const guide = useGuide(), key = useId(), navigation = useContext(NavigationContext);
  const availability = guide?.availability;
  useEffect(() => {
    const update = () => availability?.(key, module, (!navigation || navigation.isFocused()) ? message : undefined, kind);
    update();
    const offFocus = navigation?.addListener('focus', update);
    const offBlur = navigation?.addListener('blur', () => availability?.(key, module, undefined));
    return () => { offFocus?.(); offBlur?.(); availability?.(key, module, undefined); };
  }, [availability, key, message, module, navigation, kind]);
}

/** Confirmation observes business validity; it never changes the business selection. */
export function useGuideConfirmation(step: string, allowed: boolean) {
  const guide = useGuide(), confirm = guide?.confirm, active = guide?.step === step;
  useEffect(() => { confirm?.(step, allowed); }, [confirm, step, allowed, active]);
}

export function useGuideTarget(step: string, target: string, text?: string, complete?: boolean) {
  const guide = useGuide(), focus = guide?.focus, active = guide?.step === step;
  useEffect(() => { if (active) focus?.(step, target, text, complete); }, [active, focus, step, target, text, complete]);
}
