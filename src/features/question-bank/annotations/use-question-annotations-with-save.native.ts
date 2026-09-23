import { useCallback, useRef } from 'react';

import { assertLearningWriteContext, captureLearningWriteContext } from '@/features/sync/learning-sync.native';

import { createAnnotationDefinitionId, flushPendingAnnotationSaves, updateAnnotationStore } from './annotation-store.native';
import type { AnnotationToneKey, QuestionBankAnnotationStore, QuestionBankCardTarget } from './types';
import { useQuestionAnnotations as useSharedQuestionAnnotations } from './use-question-annotations';

/** Adds a Native exit boundary while retaining the shared annotation controls. */
export function useQuestionAnnotations(target?: QuestionBankCardTarget) {
  const annotations = useSharedQuestionAnnotations(target);
  const context = useRef(captureLearningWriteContext()).current;
  const flushPendingSaves = useCallback(() => flushPendingAnnotationSaves(context), [context]);
  const persist = useCallback(async (updater: (current: QuestionBankAnnotationStore) => QuestionBankAnnotationStore) => {
    try { assertLearningWriteContext(context); return await updateAnnotationStore(updater); } catch { return undefined; }
  }, [context]);
  const saveDefinition = useCallback(async (kind: 'tag' | 'highlight', id: string | undefined, label: string, color: AnnotationToneKey) => {
    const name = label.trim();
    if (!name || Array.from(name).length > 8) return false;
    const key = kind === 'tag' ? 'tagDefinitions' : 'highlightDefinitions';
    const next = await persist((current) => {
      const definitions = current[key];
      if (definitions.some((definition) => definition.color === color && definition.id !== id)) throw new Error('annotation_color_in_use');
      if (id && !definitions.some((definition) => definition.id === id)) throw new Error('annotation_definition_deleted');
      const definition = id ? definitions.find((entry) => entry.id === id)! : { id: createAnnotationDefinitionId(kind), builtIn: false };
      return { ...current, version: 2, [key]: id ? definitions.map((entry) => entry.id === id ? { ...entry, label: name, color } : entry) : [...definitions, { ...definition, label: name, color }] };
    });
    return Boolean(next);
  }, [persist]);

  const deleteDefinition = useCallback(async (kind: 'tag' | 'highlight', id: string) => {
    const key = kind === 'tag' ? 'tagDefinitions' : 'highlightDefinitions';
    const deletedKey = kind === 'tag' ? 'tags' : 'highlights';
    return Boolean(await persist((current) => {
      const deleted = current.deletedDefinitions ?? { tags: [], highlights: [] };
      const entries = Object.fromEntries(Object.entries(current.entries).map(([entryKey, entry]) => [entryKey, {
        ...entry, tagIds: kind === 'tag' ? entry.tagIds.filter((tag) => tag !== id) : entry.tagIds,
        highlights: kind === 'highlight' ? entry.highlights.filter((highlight) => highlight.colorId !== id) : entry.highlights,
      }]));
      return { ...current, version: 2, [key]: current[key].filter((entry) => entry.id !== id), entries,
        deletedDefinitions: { ...deleted, [deletedKey]: [...new Set([...deleted[deletedKey], id])] } };
    }));
  }, [persist]);

  return { ...annotations, saveDefinition, deleteDefinition, flushPendingSaves };
}
