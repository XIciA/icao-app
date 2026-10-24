import { useMemo, type PropsWithChildren } from 'react';
import { View } from 'react-native';
import { GuideAnchor, useGuide } from './GuideBindings';
import { TUTORIAL_STEPS, studyStepId, type TutorialStepId, type TutorialTargetId } from './tutorial-model';

/** Study-page adapter only: the provider owns every transition and persisted bit. */
export function useTutorial() {
  const guide = useGuide();
  const current = guide?.current, stepId = guide?.step, event = guide?.event, offer = guide?.offer, exit = guide?.exit, start = guide?.start;
  return useMemo(() => current === 'study' && TUTORIAL_STEPS.some(step => studyStepId(step.id) === stepId) ? {
    progress: { step: TUTORIAL_STEPS.findIndex(step => studyStepId(step.id) === stepId) },
    event: (id: TutorialStepId) => event?.(studyStepId(id)),
    finish: (_recordId: string) => { event?.(studyStepId('finish')); offer?.('study', [studyStepId('recap')]); },
    exit: () => exit?.(), restart: () => { void start?.('study'); },
  } : null, [current, stepId, event, offer, exit, start]);
}
export function TutorialTarget({ ids, children }: PropsWithChildren<{ ids: readonly TutorialTargetId[] }>) {
  return <View collapsable={false}>{children}{ids.map(id => <GuideAnchor id={`sentence-${id}`} key={id} />)}</View>;
}
