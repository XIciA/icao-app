import { createContext, useContext, useEffect, useRef, type PropsWithChildren, type RefObject } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { AppText, Button } from '@/components/ui';
import { colors, radii, spacing } from '@/theme';
import { TUTORIAL_STEPS, type TutorialProgress, type TutorialStepId, type TutorialTargetId } from './tutorial-model';

export type TutorialController = {
  progress: TutorialProgress;
  event: (id: TutorialStepId) => void;
  skip: () => void;
  finish: (recordId: string) => void;
  exit: () => void;
  scroll: RefObject<ScrollView | null>;
  scrollOffset: RefObject<number>;
  saveError?: string;
};
export const TutorialContext = createContext<TutorialController | null>(null);
export function useTutorial() { return useContext(TutorialContext); }

/** Decoration around the real control; it never implements the underlying action. */
export function TutorialTarget({ ids, scroll = false, children }: PropsWithChildren<{ ids: readonly TutorialTargetId[]; scroll?: boolean }>) {
  const tutorial = useTutorial();
  const ref = useRef<View>(null);
  const step = tutorial ? TUTORIAL_STEPS[tutorial.progress.step] : undefined;
  const active = Boolean(step && ids.includes(step.target));
  const scrollRef = tutorial?.scroll;
  const offset = tutorial?.scrollOffset;
  useEffect(() => {
    if (!active || !scroll || !scrollRef || !offset) return;
    const timer = setTimeout(() => {
      const target = ref.current, viewport = scrollRef.current;
      if (!target || !viewport) return;
      viewport.getNativeScrollRef()?.measureInWindow((_x: number, top: number) => target.measureInWindow((_tx, y) => {
        viewport.scrollTo({ y: Math.max(0, offset.current + y - top - spacing[3]), animated: true });
      }));
    }, 350);
    return () => clearTimeout(timer);
  }, [active, offset, scroll, scrollRef, step?.id]);
  // No wrapper at all in ordinary learning.
  if (!tutorial) return children;
  return <View collapsable={false} ref={ref} testID={active ? `tutorial-target-${step?.target}` : undefined}>
    {children}
    {active ? <View pointerEvents="none" style={styles.outline} /> : null}
  </View>;
}

export function TutorialCoach({ ready = false, onExit, inset = true }: { ready?: boolean; onExit?: () => void; inset?: boolean }) {
  const tutorial = useTutorial();
  if (!tutorial) return null;
  const step = TUTORIAL_STEPS[tutorial.progress.step];
  return <View style={[styles.coach, !inset && { marginHorizontal: 0 }]} testID="tutorial-coach">
    <View style={styles.heading}>
      <AppText color={colors.primary} variant="micro">{step ? `新手教程 · ${tutorial.progress.step + 1} / ${TUTORIAL_STEPS.length}` : '新手教程 · 已完成'}</AppText>
      <Button size="sm" variant="ghost" onPress={onExit ?? tutorial.exit}>{step ? '退出教程' : '返回使用指南'}</Button>
    </View>
    <AppText accessibilityLiveRegion="polite" variant="cardTitle">{step?.title ?? '本次新手教程已结束'}</AppText>
    <AppText variant="caption">{step?.description ?? `完成 ${tutorial.progress.completed.length} 步，跳过 ${tutorial.progress.skipped.length} 步。标注、生词和练习记录都能在「我的」中找到。900句还可带个人标注导出PDF。`}</AppText>
    {step ? <View style={styles.actions}>
      <Button size="sm" variant="ghost" onPress={tutorial.skip}>跳过此步</Button>
      {ready ? <Button size="sm" variant="outline" onPress={() => tutorial.event(step.id)}>已有内容，继续</Button> : null}
    </View> : null}
    {tutorial.saveError ? <AppText accessibilityLiveRegion="polite" color={colors.destructive} variant="caption">{tutorial.saveError}</AppText> : null}
  </View>;
}
const styles = StyleSheet.create({
  coach: { backgroundColor: colors.primary06, borderColor: colors.primary20, borderWidth: 1, borderRadius: radii.lg, paddingHorizontal: spacing[3], paddingVertical: spacing[2], gap: spacing[1], marginHorizontal: spacing[5], marginBottom: spacing[2] },
  heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' },
  outline: { ...StyleSheet.absoluteFillObject, borderWidth: 2, borderColor: colors.primary, borderRadius: radii.md },
});
