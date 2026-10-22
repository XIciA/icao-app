import { NavigationContext } from '@react-navigation/native';
import type { GuideId } from './guide-flows';
import { GuideScrollContext } from './guide-scroll-context';
import { createContext, useContext, useEffect, useId, useRef, useCallback, useState, type PropsWithChildren, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

export type GuidePrompt = { target: string; title?: string; text: string; index: number; total: number; next?: () => void; skip: () => void; exit: () => void; error?: string };
export type GuideCheckpoint = { vocabBooks?: string[]; vocabWord?: string; recapEmpty?: boolean };
export type GuideBinding = {
  event: (id: string) => void;
  register: (key: string, id: string, layer: string, node: View | null) => void;
  modal: (id: string, open: boolean) => void;
  surface: (layer: string) => ReactNode;
  offer: (id: GuideId, steps: string[]) => void;
  exit: () => void;
  start: (id: string) => Promise<void>;
  current?: string;
  ready?: boolean;
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
  const [focused, setFocused] = useState(navigation?.isFocused() ?? true);
  useEffect(() => {
    if (!navigation) return;
    setFocused(navigation.isFocused());
    const onFocus = navigation.addListener('focus', () => setFocused(true));
    const onBlur = navigation.addListener('blur', () => setFocused(false));
    return () => { onFocus(); onBlur(); };
  }, [navigation]);
  const revealTarget = useCallback(() => { if (active && focused && node.current) reveal?.(node.current, id); }, [active, focused, id, reveal]);
  useEffect(() => { const frame = requestAnimationFrame(revealTarget); return () => cancelAnimationFrame(frame); }, [revealTarget]);
  const register = guide?.register;
  useEffect(() => { register?.(key, id, layer, focused ? node.current : null); return () => register?.(key, id, layer, null); }, [focused, id, key, layer, register]);
  if (!guide) return null;
  return <View accessible={false} collapsable={false} pointerEvents="none" testID={`guide-anchor-${id}`} ref={node} onLayout={revealTarget} style={StyleSheet.absoluteFillObject} />;
}
export function GuideModalScope({ children, visible }: PropsWithChildren<{ visible: boolean }>) {
  const guide = useGuide(); const id = useId(); const modal = guide?.modal;
  useEffect(() => { if (visible) modal?.(id, true); return () => modal?.(id, false); }, [id, modal, visible]);
  return <LayerContext.Provider value={id}>{children}{visible ? guide?.surface(id) : null}</LayerContext.Provider>;
}
