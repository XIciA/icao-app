import { GuideScrollContext } from './guide-scroll-context';
import { createContext, useContext, useEffect, useId, useRef, useCallback, type PropsWithChildren, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

export type GuidePrompt = { target: string; text: string; index: number; total: number; next?: () => void; skip: () => void; exit: () => void; completed?: boolean; error?: string; skipLabel?: string };
export type GuideCheckpoint = { vocabBooks?: string[]; vocabWord?: string; recapEmpty?: boolean };
export type GuideBinding = {
  event: (id: string) => void;
  guardExit: (handler: ((done: () => void) => void) | null) => void;
  register: (key: string, id: string, layer: string, node: View | null) => void;
  modal: (id: string, open: boolean) => void;
  surface: (layer: string) => ReactNode;
  legacy: (prompt: GuidePrompt | null) => void;
  start: (id: string, restart?: boolean) => Promise<void>;
  current?: string;
  step?: string;
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
  const active = guide?.step === id;
  const revealTarget = useCallback(() => { if (active && node.current) reveal?.(node.current, id); }, [active, id, reveal]);
  useEffect(() => { const frame = requestAnimationFrame(revealTarget); return () => cancelAnimationFrame(frame); }, [revealTarget]);
  const register = guide?.register;
  useEffect(() => { register?.(key, id, layer, node.current); return () => register?.(key, id, layer, null); }, [id, key, layer, register]);
  if (!guide) return null;
  return <View accessible={false} collapsable={false} pointerEvents="none" testID={`guide-anchor-${id}`} ref={node} onLayout={revealTarget} style={StyleSheet.absoluteFillObject} />;
}
export function GuideModalScope({ children, visible }: PropsWithChildren<{ visible: boolean }>) {
  const guide = useGuide(); const id = useId(); const modal = guide?.modal;
  useEffect(() => { if (visible) modal?.(id, true); return () => modal?.(id, false); }, [id, modal, visible]);
  return <LayerContext.Provider value={id}>{children}{visible ? guide?.surface(id) : null}</LayerContext.Provider>;
}
