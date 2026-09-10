import { useCallback, useRef } from 'react';

import { captureLearningWriteContext } from '@/features/sync/learning-sync.native';

import { flushPendingAnnotationSaves } from './annotation-store.native';
import type { QuestionBankCardTarget } from './types';
import { useQuestionAnnotations as useSharedQuestionAnnotations } from './use-question-annotations';

/** Adds a Native exit boundary while retaining the shared annotation controls. */
export function useQuestionAnnotations(target?: QuestionBankCardTarget) {
  const annotations = useSharedQuestionAnnotations(target);
  const context = useRef(captureLearningWriteContext()).current;
  const flushPendingSaves = useCallback(() => flushPendingAnnotationSaves(context), [context]);
  return { ...annotations, flushPendingSaves };
}
