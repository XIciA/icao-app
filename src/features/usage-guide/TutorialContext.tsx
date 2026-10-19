import { createContext, useContext, useEffect, useMemo, useRef, type PropsWithChildren, type RefObject } from 'react';
import { ScrollView, View } from 'react-native';
import { spacing } from '@/theme';
import { GuideAnchor, useGuide } from './GuideBindings';
import { TUTORIAL_STEPS, type TutorialProgress, type TutorialStepId, type TutorialTargetId } from './tutorial-model';

export type TutorialController = {
  progress: TutorialProgress;
  event: (id: TutorialStepId) => void;
  skip: () => void;
  finish: (recordId: string) => void;
  exit: () => void;
  restart?: () => void;
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
    {ids.map(id => <GuideAnchor id={`sentence-${id}`} key={id} />)}
  </View>;
}

export function TutorialCoach({ ready = false, onExit, onRestart }: { ready?: boolean; onExit?: () => void; onRestart?: () => void; inset?: boolean }) {
  const tutorial = useTutorial(); const binding = useGuide();
  const actions = useRef({ tutorial, onExit, onRestart }); actions.current = { tutorial, onExit, onRestart };
  const legacy = binding?.legacy;
  const progress = tutorial?.progress; const saveError = tutorial?.saveError;
  const prompt = useMemo(() => {
    if (!progress) return null;
    const step = TUTORIAL_STEPS[progress.step];
    return { target: step?.id === 'play' ? 'sentence-play' : step?.id === 'record' ? 'sentence-record' : step?.id === 'note' ? 'sentence-note' : step?.id === 'review' ? 'sentence-review' : step?.id === 'highlight' ? 'sentence-highlight-tool' : step?.id === 'tag' ? 'sentence-tag-tool' : `sentence-${step?.target ?? 'text'}`, text: step?.description ?? '学会了，接下来按自己的节奏练习。', index: progress.step, total: TUTORIAL_STEPS.length, completed: !step, error: saveError,
      exit: () => { const a = actions.current; (a.onExit ?? a.tutorial?.exit)?.(); },
      skip: () => { if (step) actions.current.tutorial?.skip(); else { const a = actions.current; (a.onRestart ?? a.tutorial?.restart ?? a.tutorial?.exit)?.(); } },
      next: ready && step ? () => actions.current.tutorial?.event(step.id) : !step ? () => { const a = actions.current; (a.onExit ?? a.tutorial?.exit)?.(); } : undefined,
    };
  }, [progress, ready, saveError]);
  useEffect(() => { legacy?.(prompt); return () => legacy?.(null); }, [legacy, prompt]);
  return null;
}
