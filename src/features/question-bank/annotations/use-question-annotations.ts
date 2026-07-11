import { useCallback, useEffect, useState } from 'react';

import {
  createAnnotationDefinitionId,
  createEmptyAnnotationEntry,
  createEmptyAnnotationStore,
  getAnnotationEntry,
  readAnnotationStore,
  retryAnnotationStoreWrite,
  setAnnotationEntry,
  subscribeAnnotationStore,
  updateAnnotationStore,
} from './annotation-store';
import { contentFingerprint } from './text';
import type {
  AnnotationTextBlockId,
  AnnotationToneKey,
  QuestionAnnotationEntry,
  QuestionBankAnnotationStore,
  QuestionBankCardTarget,
} from './types';

export function useQuestionAnnotations(target?: QuestionBankCardTarget) {
  const [store, setStore] = useState<QuestionBankAnnotationStore>(() => createEmptyAnnotationStore());
  const [hydrated, setHydrated] = useState(false);
  const [loadErrorMessage, setLoadErrorMessage] = useState<string>();
  const [saveErrorMessage, setSaveErrorMessage] = useState<string>();
  const stableTarget = target;

  const refresh = useCallback(async () => {
    try {
      const next = await readAnnotationStore({ force: true });
      setStore(next);
      setLoadErrorMessage(undefined);
      setHydrated(true);
      return next;
    } catch {
      setLoadErrorMessage('本机标注读取失败，请重试。');
      setHydrated(true);
      return undefined;
    }
  }, []);

  useEffect(() => {
    let active = true;
    const sync = () => {
      void readAnnotationStore().then((next) => {
        if (active) setStore(next);
      });
    };
    void refresh();
    const unsubscribe = subscribeAnnotationStore(sync);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [refresh]);

  const persist = useCallback(async (updater: (current: QuestionBankAnnotationStore) => QuestionBankAnnotationStore) => {
    try {
      const next = await updateAnnotationStore(updater);
      setStore(next);
      setSaveErrorMessage(undefined);
      return next;
    } catch {
      setSaveErrorMessage('标注保存失败，请检查本机存储后重试。');
      return undefined;
    }
  }, []);

  const updateEntry = useCallback(async (updater: (current: QuestionAnnotationEntry) => QuestionAnnotationEntry) => {
    if (!stableTarget) return undefined;
    return persist((currentStore) => {
      const currentEntry = getAnnotationEntry(currentStore, stableTarget) ?? createEmptyAnnotationEntry(stableTarget);
      return setAnnotationEntry(currentStore, stableTarget, updater(currentEntry));
    });
  }, [persist, stableTarget]);

  const toggleTag = useCallback((tagId: string) => updateEntry((current) => ({
    ...current,
    tagIds: current.tagIds.includes(tagId) ? current.tagIds.filter((id) => id !== tagId) : [...current.tagIds, tagId],
  })), [updateEntry]);

  const saveNote = useCallback((note: string) => updateEntry((current) => ({ ...current, note })), [updateEntry]);

  const toggleHighlight = useCallback((value: {
    blockId: AnnotationTextBlockId;
    wordIndex: number;
    colorId: string;
    quote: string;
    sentence: string;
    sourceText: string;
  }) => updateEntry((current) => {
    const existing = current.highlights.find((item) => item.blockId === value.blockId && item.wordIndex === value.wordIndex);
    const rest = current.highlights.filter((item) => !(item.blockId === value.blockId && item.wordIndex === value.wordIndex));
    return {
      ...current,
      highlights: existing?.colorId === value.colorId ? rest : [...rest, {
        blockId: value.blockId,
        wordIndex: value.wordIndex,
        colorId: value.colorId,
        quote: value.quote,
        sentence: value.sentence,
        contentFingerprint: contentFingerprint(value.sourceText),
      }],
    };
  }), [updateEntry]);

  const addTagDefinition = useCallback(async (label: string, color: AnnotationToneKey) => {
    const id = createAnnotationDefinitionId('tag');
    const next = await persist((current) => ({ ...current, tagDefinitions: [...current.tagDefinitions, { id, label: label.trim().slice(0, 8), color, builtIn: false }] }));
    return next ? id : undefined;
  }, [persist]);

  const addHighlightDefinition = useCallback(async (label: string, color: AnnotationToneKey) => {
    const id = createAnnotationDefinitionId('highlight');
    const next = await persist((current) => ({ ...current, highlightDefinitions: [...current.highlightDefinitions, { id, label: label.trim().slice(0, 8), color, builtIn: false }] }));
    return next ? id : undefined;
  }, [persist]);

  const retrySave = useCallback(async () => {
    try {
      const next = await retryAnnotationStoreWrite();
      setStore(next);
      setSaveErrorMessage(undefined);
    } catch {
      setSaveErrorMessage('标注保存失败，请检查本机存储后重试。');
    }
  }, []);

  const entry = stableTarget ? getAnnotationEntry(store, stableTarget) : undefined;

  return {
    addHighlightDefinition,
    addTagDefinition,
    entry,
    hydrated,
    highlightDefinitions: store.highlightDefinitions,
    loadErrorMessage,
    refresh,
    retrySave,
    saveErrorMessage,
    saveNote,
    store,
    tagDefinitions: store.tagDefinitions,
    toggleHighlight,
    toggleTag,
  };
}
