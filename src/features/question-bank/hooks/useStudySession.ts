import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { sqliteLearningStore, type LearningStore, migrateLegacyCardState } from '../platform/learning-store';
import type {
  CardLearningState,
  LearningRecord,
  QuestionBankCategory,
  QuestionBankDataset,
  QuestionBankStudyItem,
  QuestionBankStudyPackage,
  QuestionBankStudyRecordDescriptor,
  QuestionBankTopic,
  StudyBehavior,
  StudyConsoleTab,
  StudyToolMode,
} from '../types';
import { getStudyBehavior } from '../lib/study-behavior';
import { recordingRepository } from '../recording/recording-repository';
import type { RecordingAsset } from '../recording/types';

type SaveFailure = { cardId: string; message: string };

type LegacyStudySessionOptions = {
  dataset: QuestionBankDataset;
  category: QuestionBankCategory;
  topic: QuestionBankTopic;
  initialCardId?: string;
  store?: LearningStore;
};

type PackageStudySessionOptions = {
  studyPackage: QuestionBankStudyPackage;
  store?: LearningStore;
};

export type UseStudySessionOptions = LegacyStudySessionOptions | PackageStudySessionOptions;

const EMPTY_STUDY_BEHAVIOR: StudyBehavior = {
  taskKind: 'recording',
  workbenchTabs: [],
  reviewKind: 'none',
  generatedAudio: false,
  transcriptLabel: '音频原文',
  referenceLabel: '参考答案',
};

function createEmptyCardState(): CardLearningState {
  return {
    visited: false,
    completed: false,
    note: '',
    updatedAt: new Date().toISOString(),
  };
}

function sourceKey(item: QuestionBankStudyItem) {
  return `${item.dataset.id}\u0000${item.category.id}\u0000${item.topic.id}`;
}

async function hydratePersistentStates(store: LearningStore, items: readonly QuestionBankStudyItem[]) {
  const topics = new Map<string, QuestionBankTopic>();
  items.forEach((item) => topics.set(sourceKey(item), item.topic));
  const loaded = new Map(await Promise.all(Array.from(topics, async ([key, topic]) => (
    [key, await store.getTopicStates(topic)] as const
  ))));

  return Object.fromEntries(items.flatMap((item) => {
    const state = loaded.get(sourceKey(item))?.[item.card.id];
    return state ? [[item.id, state]] : [];
  }));
}

export function preferredWorkbenchTab(tabs: StudyConsoleTab[]) {
  return tabs.includes('reference') ? 'reference' : tabs[0] ?? 'notes';
}

export function useStudySession(options: UseStudySessionOptions) {
  const packageInput = 'studyPackage' in options ? options.studyPackage : undefined;
  const legacyDataset = 'studyPackage' in options ? undefined : options.dataset;
  const legacyCategory = 'studyPackage' in options ? undefined : options.category;
  const legacyTopic = 'studyPackage' in options ? undefined : options.topic;
  const initialCardId = 'studyPackage' in options ? undefined : options.initialCardId;
  const store = options.store ?? sqliteLearningStore;
  const legacyItems = useMemo<QuestionBankStudyItem[]>(() => {
    if (!legacyDataset || !legacyCategory || !legacyTopic) return [];
    return legacyTopic.cards.map((card) => ({
      id: card.id,
      dataset: legacyDataset,
      category: legacyCategory,
      topic: legacyTopic,
      card,
    }));
  }, [legacyCategory, legacyDataset, legacyTopic]);
  const items = useMemo(
    () => packageInput?.items ?? legacyItems,
    [legacyItems, packageInput],
  );
  const progressMode = packageInput?.progressMode ?? 'persistent';
  const recordDescriptor: QuestionBankStudyRecordDescriptor | undefined = packageInput?.record;
  const startingIndex = Math.max(0, initialCardId ? items.findIndex((item) => item.card.id === initialCardId) : 0);
  const initialItem = items[startingIndex];
  const initialBehavior = useMemo(
    () => initialItem ? getStudyBehavior(initialItem.dataset) : EMPTY_STUDY_BEHAVIOR,
    [initialItem],
  );
  const configuredStartedAt = packageInput?.startedAt;
  const configuredStartedAtMillis = configuredStartedAt ? Date.parse(configuredStartedAt) : Number.NaN;
  const startedAt = useRef(Number.isFinite(configuredStartedAtMillis) ? configuredStartedAtMillis : Date.now()).current;
  const sessionId = useRef(
    packageInput?.id ?? `study-${startedAt.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  ).current;
  const sessionStartedAt = useRef(
    Number.isFinite(configuredStartedAtMillis) && configuredStartedAt
      ? configuredStartedAt
      : new Date(startedAt).toISOString(),
  ).current;
  const finishedAt = useRef<string | undefined>(undefined);
  const committedReport = useRef<LearningRecord | undefined>(undefined);
  const [states, setStates] = useState<Record<string, CardLearningState>>({});
  const statesRef = useRef(states);
  const [hydrated, setHydrated] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [loadError, setLoadError] = useState<string>();
  const [saveFailure, setSaveFailure] = useState<SaveFailure>();
  const [currentIndex, setCurrentIndex] = useState(startingIndex);
  const [visitedIndexes, setVisitedIndexes] = useState<Set<number>>(() => new Set([startingIndex]));
  const [completedCardIds, setCompletedCardIds] = useState<Set<string>>(() => new Set());
  const [revealed, setRevealed] = useState(false);
  const [autoReveal, setAutoReveal] = useState(false);
  const [activeTab, setActiveTab] = useState<StudyConsoleTab>(() => preferredWorkbenchTab(initialBehavior.workbenchTabs));
  const [toolMode, setToolModeState] = useState<StudyToolMode>();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [recordings, setRecordings] = useState<Record<string, RecordingAsset>>({});
  const recordingsRef = useRef(recordings);
  const [feedbackCardIds, setFeedbackCardIds] = useState<Set<string>>(() => new Set());
  const [playRequestToken, setPlayRequestToken] = useState(1);
  const [report, setReport] = useState<LearningRecord>();

  statesRef.current = states;
  recordingsRef.current = recordings;

  const item = items[currentIndex];
  const card = item?.card;
  const behavior = useMemo(
    () => item ? getStudyBehavior(item.dataset) : EMPTY_STUDY_BEHAVIOR,
    [item],
  );
  const cardState = item ? states[item.id] : undefined;

  useEffect(() => {
    let active = true;
    setHydrated(false);
    setLoadError(undefined);

    if (progressMode === 'session-only') {
      statesRef.current = {};
      setStates({});
      setCurrentIndex(startingIndex);
      setVisitedIndexes(new Set([startingIndex]));
      setCompletedCardIds(new Set());
      setRevealed(false);
      setAutoReveal(false);
      setActiveTab(preferredWorkbenchTab(initialBehavior.workbenchTabs));
      setHydrated(true);
      return () => { active = false; };
    }

    void hydratePersistentStates(store, items).then((saved) => {
      if (!active) return;
      statesRef.current = saved;
      setStates(saved);
      setCurrentIndex(startingIndex);
      setVisitedIndexes(new Set([startingIndex]));
      setCompletedCardIds(new Set());
      setRevealed(false);
      setAutoReveal(false);
      setActiveTab(preferredWorkbenchTab(initialBehavior.workbenchTabs));
      setHydrated(true);
    }).catch(() => {
      if (!active) return;
      setLoadError('学习进度读取失败，请重试。');
      setHydrated(true);
    });
    return () => { active = false; };
  }, [initialBehavior, items, loadAttempt, progressMode, startingIndex, store]);

  const resolveItem = useCallback((itemOrCardId: string) => {
    if (item && (item.id === itemOrCardId || item.card.id === itemOrCardId)) return item;
    return items.find((candidate) => candidate.id === itemOrCardId)
      ?? items.find((candidate) => candidate.card.id === itemOrCardId);
  }, [item, items]);

  const persistCard = useCallback((itemOrCardId: string, patch: Partial<CardLearningState>) => {
    const target = resolveItem(itemOrCardId);
    if (!target) return undefined;
    const current = statesRef.current[target.id] ?? createEmptyCardState();
    const next = migrateLegacyCardState({
      ...current,
      ...patch,
      visited: current.visited || Boolean(patch.visited) || Object.keys(patch).length > 0,
      updatedAt: new Date().toISOString(),
    });
    const nextStates = { ...statesRef.current, [target.id]: next };
    statesRef.current = nextStates;
    setStates(nextStates);
    setSaveFailure(undefined);
    if (progressMode === 'persistent') {
      void store.saveCardState(target.topic.id, target.card.id, next).catch(() => {
        setSaveFailure({ cardId: target.id, message: '保存失败，内容仍保留在当前页面。' });
      });
    }
    return next;
  }, [progressMode, resolveItem, store]);

  const retrySave = useCallback(() => {
    if (!saveFailure || progressMode !== 'persistent') return;
    const target = resolveItem(saveFailure.cardId);
    const latest = statesRef.current[saveFailure.cardId];
    if (!target || !latest) return;
    setSaveFailure(undefined);
    void store.saveCardState(target.topic.id, target.card.id, latest).catch(() => {
      setSaveFailure({ cardId: saveFailure.cardId, message: '再次保存失败，请稍后重试。' });
    });
  }, [progressMode, resolveItem, saveFailure, store]);

  const markCompleted = useCallback((itemOrCardId: string) => {
    const target = resolveItem(itemOrCardId);
    if (!target) return;
    setCompletedCardIds((current) => new Set(current).add(target.id));
    persistCard(target.id, { completed: true });
  }, [persistCard, resolveItem]);

  const revealCurrent = useCallback((persistAcrossCards = false) => {
    if (!item) return;
    if (persistAcrossCards) setAutoReveal(true);
    setRevealed(true);
    markCompleted(item.id);
  }, [item, markCompleted]);

  const collapseAnswers = useCallback(() => {
    setAutoReveal(false);
    setRevealed(false);
  }, []);

  const toggleAnswers = useCallback(() => {
    setActiveTab(preferredWorkbenchTab(behavior.workbenchTabs));
    if (revealed) collapseAnswers();
    else revealCurrent(true);
  }, [behavior.workbenchTabs, collapseAnswers, revealCurrent, revealed]);

  const setToolMode = useCallback((mode?: StudyToolMode) => {
    setToolModeState(mode);
    if (mode === 'highlight' && !revealed) revealCurrent(false);
  }, [revealCurrent, revealed]);

  const goTo = useCallback((nextIndex: number) => {
    if (nextIndex < 0 || nextIndex >= items.length || nextIndex === currentIndex) return;
    const nextItem = items[nextIndex];
    const nextBehavior = getStudyBehavior(nextItem.dataset);
    setCurrentIndex(nextIndex);
    setVisitedIndexes((current) => new Set(current).add(nextIndex));
    setPlayRequestToken((current) => current + 1);
    setToolModeState(undefined);
    setActiveTab(preferredWorkbenchTab(nextBehavior.workbenchTabs));
    setRevealed(autoReveal);
    if (autoReveal) markCompleted(nextItem.id);
  }, [autoReveal, currentIndex, items, markCompleted]);

  const chooseOption = useCallback((choiceIndex: number) => {
    if (!item) return;
    persistCard(item.id, { selectedChoiceIndex: choiceIndex, completed: true });
    setCompletedCardIds((current) => new Set(current).add(item.id));
    setRevealed(true);
  }, [item, persistCard]);

  const recordAnswer = useCallback((recording: RecordingAsset) => {
    if (!item) return;
    const previous = recordingsRef.current[item.id];
    setRecordings((current) => ({ ...current, [item.id]: recording }));
    if (previous && previous.id !== recording.id) recordingRepository.discard(previous);
    persistCard(item.id, { recorded: true, recordingDurationMillis: recording.durationMillis, completed: true });
    setCompletedCardIds((current) => new Set(current).add(item.id));
    setRevealed(true);
    if (behavior.workbenchTabs.includes('mine')) setActiveTab('mine');
  }, [behavior.workbenchTabs, item, persistCard]);

  const clearRecording = useCallback(() => {
    if (!item) return;
    const previous = recordingsRef.current[item.id];
    setRecordings((current) => {
      const next = { ...current };
      delete next[item.id];
      return next;
    });
    if (previous) recordingRepository.discard(previous);
  }, [item]);

  const updateAnswer = useCallback((text: string) => {
    if (!item) return;
    setAnswers((current) => ({ ...current, [item.id]: text }));
  }, [item]);

  const markFeedback = useCallback(() => {
    if (!item) return;
    setFeedbackCardIds((current) => new Set(current).add(item.id));
  }, [item]);

  const finish = useCallback(async (
    reason: 'abort' | 'complete',
    metrics?: { annotationCount?: number; noteCount?: number },
  ) => {
    if (committedReport.current) return committedReport.current;
    const sessionItemIds = new Set(
      Array.from(visitedIndexes).flatMap((index) => items[index]?.id ?? []),
    );
    const sessionStates = Object.entries(statesRef.current).filter(([itemId]) => sessionItemIds.has(itemId));
    const legacyAnnotationCount = sessionStates.reduce(
      (count, [, state]) => count + (state.tagIds?.length ?? 0) + (state.highlights?.length ?? 0),
      0,
    );
    const legacyNoteCount = sessionStates.filter(([, state]) => state.note.trim()).length;
    const correctCount = items.reduce((count, studyItem) => {
      if (!sessionItemIds.has(studyItem.id)) return count;
      const selectedChoiceIndex = statesRef.current[studyItem.id]?.selectedChoiceIndex;
      if (packageInput && studyItem.card.correctChoiceIndex === undefined) return count;
      return count + (selectedChoiceIndex === studyItem.card.correctChoiceIndex ? 1 : 0);
    }, 0);
    const updatedAt = new Date().toISOString();
    finishedAt.current ??= updatedAt;
    const descriptor = recordDescriptor ?? {
      bankId: legacyDataset?.id ?? 'mock_exam',
      bankTitle: legacyDataset?.title ?? '',
      categoryTitle: legacyCategory?.name ?? '',
      topicTitle: legacyTopic?.name ?? '',
      recordType: 'session' as const,
    };
    const nextReport: LearningRecord = {
      schemaVersion: 3,
      id: descriptor.id ?? `session-${sessionId}`,
      sessionId,
      bankId: descriptor.bankId,
      bankTitle: descriptor.bankTitle,
      categoryTitle: descriptor.categoryTitle,
      topicTitle: descriptor.topicTitle,
      completedCount: completedCardIds.size,
      totalCount: items.length,
      correctCount,
      annotationCount: metrics?.annotationCount ?? legacyAnnotationCount,
      noteCount: metrics?.noteCount ?? legacyNoteCount,
      feedbackCount: feedbackCardIds.size,
      durationSeconds: Math.max(1, Math.round((Date.now() - startedAt) / 1000)),
      reason,
      createdAt: finishedAt.current,
      updatedAt,
      recordType: descriptor.recordType ?? (descriptor.mockExam ? 'mock_exam' : 'session'),
      ...(descriptor.mockExam ? { mockExam: descriptor.mockExam } : {}),
    };
    await store.addRecord(nextReport);
    committedReport.current = nextReport;
    setReport(nextReport);
    recordingRepository.cleanupSession(sessionId);
    return nextReport;
  }, [completedCardIds.size, feedbackCardIds.size, items, legacyCategory?.name, legacyDataset?.id, legacyDataset?.title, legacyTopic?.name, packageInput, recordDescriptor, sessionId, startedAt, store, visitedIndexes]);

  useEffect(() => () => recordingRepository.cleanupSession(sessionId), [sessionId]);

  return {
    behavior,
    sessionId,
    sessionStartedAt,
    hydrated,
    loadError,
    retryHydration: () => setLoadAttempt((current) => current + 1),
    items,
    item,
    states,
    card,
    cardState,
    currentIndex,
    visitedIndexes,
    completedCardIds,
    revealed,
    autoReveal,
    activeTab,
    setActiveTab,
    toolMode,
    setToolMode,
    answers,
    answerText: item ? answers[item.id] ?? '' : '',
    recordings,
    recording: item ? recordings[item.id] : undefined,
    playRequestToken,
    report,
    saveFailure,
    persistCard,
    retrySave,
    markCompleted,
    revealCurrent,
    collapseAnswers,
    toggleAnswers,
    goTo,
    chooseOption,
    recordAnswer,
    clearRecording,
    updateAnswer,
    markFeedback,
    finish,
  };
}
