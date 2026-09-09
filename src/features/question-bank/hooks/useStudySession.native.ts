import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { captureLearningWriteContext, assertLearningWriteContext } from '@/features/sync/learning-sync.native';
import { scoreListeningExam, type ListeningExamResult } from '@/features/mock-exam/listening-exam';
import { resolveListeningExamRange } from '@/features/mock-exam/listening-session.native';

import { sqliteLearningStore, type LearningStore, migrateLegacyCardState } from '../platform/learning-store.native';
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
import { captureStudyReview, getStudyReview, wasAnswered } from '../lib/study-review.native';
import { getStudyBehavior } from '../lib/study-behavior';
import { withStudyMaterials } from '../lib/study-materials.native';
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
  const reviewCandidate = packageInput?.studyReviewRecord ?? packageInput?.listeningReviewRecord;
  const historyReview = useMemo(() => reviewCandidate
    ? getStudyReview(reviewCandidate) : undefined, [reviewCandidate]);
  const historyRecord = historyReview ? reviewCandidate : undefined;
  const legacyDataset = 'studyPackage' in options ? undefined : options.dataset;
  const legacyCategory = 'studyPackage' in options ? undefined : options.category;
  const legacyTopic = 'studyPackage' in options ? undefined : options.topic;
  const initialCardId = 'studyPackage' in options ? undefined : options.initialCardId;
  const store = options.store ?? sqliteLearningStore;
  const writeContext = useRef(captureLearningWriteContext()).current;
  const persistentStates = useRef<Record<string, CardLearningState>>({});
  const savingReport = useRef<Promise<LearningRecord | undefined> | undefined>(undefined);
  const savingCheckpoint = useRef<Promise<void> | undefined>(undefined);
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
    () => (packageInput?.items ?? legacyItems).map(withStudyMaterials),
    [legacyItems, packageInput],
  );
  const progressMode = packageInput?.progressMode ?? 'persistent';
  const recordDescriptor: QuestionBankStudyRecordDescriptor | undefined = packageInput?.record;
  const examMode = recordDescriptor?.recordType === 'mock_exam' && !historyRecord;
  const listeningRange = useMemo(() => resolveListeningExamRange(packageInput), [packageInput]);
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
  const listeningResult = useRef<ListeningExamResult | undefined>(undefined);
  const [states, setStates] = useState<Record<string, CardLearningState>>({});
  const statesRef = useRef(states);
  const attemptStates = useRef<Record<string, CardLearningState>>({});
  const [hydrated, setHydrated] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [loadError, setLoadError] = useState<string>();
  const [saveFailure, setSaveFailure] = useState<SaveFailure>();
  const [currentIndex, setCurrentIndex] = useState(startingIndex);
  const committedIndex = useRef(startingIndex);
  const [visitedIndexes, setVisitedIndexes] = useState<Set<number>>(() => new Set([startingIndex]));
  const [completedCardIds, setCompletedCardIds] = useState<Set<string>>(() => new Set());
  const [revealed, setRevealed] = useState(false);
  const [autoReveal, setAutoReveal] = useState(false);
  const [activeTab, setActiveTab] = useState<StudyConsoleTab>(() => preferredWorkbenchTab(initialBehavior.workbenchTabs));
  const [toolMode, setToolModeState] = useState<StudyToolMode>();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const answersRef = useRef(answers);
  const [recordings, setRecordings] = useState<Record<string, RecordingAsset>>({});
  const recordingsRef = useRef(recordings);
  const [feedbackCardIds, setFeedbackCardIds] = useState<Set<string>>(() => new Set());
  const [playRequestToken, setPlayRequestToken] = useState(1);
  const [report, setReport] = useState<LearningRecord>();

  answersRef.current = answers;
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

    if (historyReview || progressMode === 'session-only') {
      const saved = historyReview?.states ?? {};
      answersRef.current = historyReview?.answers ?? {};
      setAnswers(answersRef.current);
      statesRef.current = saved;
      setStates(saved);
      setCurrentIndex(startingIndex);
      setVisitedIndexes(new Set([startingIndex]));
      setCompletedCardIds(new Set(Object.keys(saved).filter((id) => saved[id].completed)));
      setRevealed(Boolean(historyRecord));
      setAutoReveal(Boolean(historyRecord));
      setActiveTab(preferredWorkbenchTab(initialBehavior.workbenchTabs));
      setHydrated(true);
      return () => { active = false; };
    }

    void hydratePersistentStates(store, items).then((saved) => {
      if (!active) return;
      persistentStates.current = saved;
      statesRef.current = {};
      setStates({});
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
  }, [historyRecord, historyReview, initialBehavior, items, loadAttempt, progressMode, startingIndex, store]);

  const resolveItem = useCallback((itemOrCardId: string) => {
    if (item && (item.id === itemOrCardId || item.card.id === itemOrCardId)) return item;
    return items.find((candidate) => candidate.id === itemOrCardId)
      ?? items.find((candidate) => candidate.card.id === itemOrCardId);
  }, [item, items]);

  const persistCard = useCallback((itemOrCardId: string, patch: Partial<CardLearningState>) => {
    const target = resolveItem(itemOrCardId);
    if (!target) return undefined;
    if (!historyRecord) assertLearningWriteContext(writeContext);
    if (historyRecord) return statesRef.current[target.id];
    const current = statesRef.current[target.id] ?? createEmptyCardState();
    const next = migrateLegacyCardState({
      ...current,
      ...patch,
      visited: current.visited || Boolean(patch.visited) || Object.keys(patch).length > 0,
      updatedAt: new Date().toISOString(),
    });
    {
      attemptStates.current[target.id] = {
        ...(attemptStates.current[target.id] ?? createEmptyCardState()), ...patch,
        visited: true, updatedAt: next.updatedAt,
      };
    }
    const nextStates = { ...statesRef.current, [target.id]: next };
    statesRef.current = nextStates;
    setStates(nextStates);
    setSaveFailure(undefined);
    if (progressMode === 'persistent') {
      const previous = persistentStates.current[target.id];
      const progress = { ...previous, ...next, completed: Boolean(previous?.completed || next.completed) };
      persistentStates.current[target.id] = progress;
      void store.saveCardState(target.topic.id, target.card.id, progress, target.dataset.id, writeContext).catch(() => {
        setSaveFailure({ cardId: target.id, message: '保存失败，内容仍保留在当前页面。' });
      });
    }
    return next;
  }, [historyRecord, progressMode, resolveItem, store, writeContext]);

  useEffect(() => {
    if (hydrated && !loadError && item && !historyRecord && !statesRef.current[item.id]?.visited) {
      persistCard(item.id, { visited: true });
    }
  }, [historyRecord, hydrated, item, loadError, persistCard]);

  const retrySave = useCallback(() => {
    if (!saveFailure || progressMode !== 'persistent') return;
    const target = resolveItem(saveFailure.cardId);
    const latest = statesRef.current[saveFailure.cardId];
    if (!target || !latest) return;
    setSaveFailure(undefined);
    void store.saveCardState(target.topic.id, target.card.id, latest, target.dataset.id, writeContext).catch(() => {
      setSaveFailure({ cardId: saveFailure.cardId, message: '再次保存失败，请稍后重试。' });
    });
  }, [progressMode, resolveItem, saveFailure, store, writeContext]);

  const markCompleted = useCallback((itemOrCardId: string) => {
    const target = resolveItem(itemOrCardId);
    if (!target || historyRecord) return;
    setCompletedCardIds((current) => new Set(current).add(target.id));
    persistCard(target.id, { completed: true });
  }, [historyRecord, persistCard, resolveItem]);

  const revealCurrent = useCallback((persistAcrossCards = false) => {
    if (!item || examMode) return;
    if (persistAcrossCards) setAutoReveal(true);
    setRevealed(true);
    markCompleted(item.id);
  }, [examMode, item, markCompleted]);

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
    if (examMode) return;
    setToolModeState(mode);
    if (mode === 'highlight' && !revealed) revealCurrent(false);
  }, [examMode, revealCurrent, revealed]);

  const goTo = useCallback((nextIndex: number, requestAutoPlay = true) => {
    if (nextIndex < 0 || nextIndex >= items.length || nextIndex === currentIndex) return;
    if (examMode && (nextIndex !== committedIndex.current + 1 || (committedIndex.current === listeningRange?.endIndex && !listeningResult.current))) return;
    committedIndex.current = nextIndex;
    const nextItem = items[nextIndex];
    const nextBehavior = getStudyBehavior(nextItem.dataset);
    setCurrentIndex(nextIndex);
    setVisitedIndexes((current) => new Set(current).add(nextIndex));
    if (requestAutoPlay) setPlayRequestToken((current) => current + 1);
    setToolModeState(undefined);
    setActiveTab(preferredWorkbenchTab(nextBehavior.workbenchTabs));
    setRevealed(examMode ? false : autoReveal);
    if (!examMode && autoReveal) markCompleted(nextItem.id);
  }, [autoReveal, currentIndex, examMode, items, listeningRange, markCompleted]);

  const chooseOption = useCallback((choiceIndex: number, revealAnswer = true) => {
    if (!item || historyRecord || (examMode && (currentIndex !== committedIndex.current || (item.dataset.id === 'listening' && listeningResult.current)))) return;
    if (!Number.isInteger(choiceIndex) || choiceIndex < 0 || choiceIndex >= (item.card.choices?.length ?? 0)) return;
    persistCard(item.id, { selectedChoiceIndex: choiceIndex, completed: true });
    setCompletedCardIds((current) => new Set(current).add(item.id));
    if (!examMode && revealAnswer) setRevealed(true);
  }, [currentIndex, examMode, historyRecord, item, persistCard]);

  const recordAnswer = useCallback((recording: RecordingAsset) => {
    if (!item || historyRecord) return;
    const previous = recordingsRef.current[item.id];
    const nextRecordings = { ...recordingsRef.current, [item.id]: recording };
    recordingsRef.current = nextRecordings;
    setRecordings(nextRecordings);
    persistCard(item.id, { recorded: true, recordingDurationMillis: recording.durationMillis, completed: true });
    setCompletedCardIds((current) => new Set(current).add(item.id));
    if (!examMode) setRevealed(true);
    if (!examMode && behavior.workbenchTabs.includes('mine')) setActiveTab('mine');
    if (previous && previous.id !== recording.id) recordingRepository.discard(previous);
  }, [behavior.workbenchTabs, examMode, historyRecord, item, persistCard]);

  const clearRecording = useCallback(() => {
    if (!item || historyRecord) return;
    const previous = recordingsRef.current[item.id];
    const nextRecordings = { ...recordingsRef.current };
    delete nextRecordings[item.id];
    recordingsRef.current = nextRecordings;
    setRecordings(nextRecordings);
    if (previous) recordingRepository.discard(previous);
    const answered = Boolean(answersRef.current[item.id]?.trim()) || statesRef.current[item.id]?.selectedChoiceIndex !== undefined;
    persistCard(item.id, { recorded: false, completed: answered });
    if (!answered) setCompletedCardIds((current) => { const next = new Set(current); next.delete(item.id); return next; });
  }, [historyRecord, item, persistCard]);

  const updateAnswer = useCallback((text: string) => {
    if (!item || historyRecord) return;
    persistCard(item.id, { visited: true });
    answersRef.current = { ...answersRef.current, [item.id]: text };
    setAnswers(answersRef.current);
  }, [historyRecord, item, persistCard]);

  const markFeedback = useCallback(() => {
    if (!item) return;
    setFeedbackCardIds((current) => new Set(current).add(item.id));
  }, [item]);

  const saveReport = useCallback(async (
    reason: 'abort' | 'complete',
    metrics?: { annotationCount?: number; noteCount?: number },
    checkpoint = false,
  ) => {
    if (historyRecord) return historyRecord;
    assertLearningWriteContext(writeContext);
    if (!hydrated || loadError || !items.length) return undefined;
    if (committedReport.current) return committedReport.current;
    if (checkpoint && examMode && !listeningResult.current) return undefined;
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
      if (studyItem.card.correctChoiceIndex === undefined || selectedChoiceIndex === undefined) return count;
      return count + (selectedChoiceIndex === studyItem.card.correctChoiceIndex ? 1 : 0);
    }, 0);
    const updatedAt = new Date().toISOString();
    if (!checkpoint) finishedAt.current ??= updatedAt;
    const descriptor = recordDescriptor ?? {
      bankId: legacyDataset?.id ?? 'mock_exam',
      bankTitle: legacyDataset?.title ?? '',
      categoryTitle: legacyCategory?.name ?? '',
      topicTitle: legacyTopic?.name ?? '',
      recordType: 'session' as const,
    };
    const isExam = descriptor.recordType === 'mock_exam';
    const selectedItems = isExam ? items : items.filter((entry) => attemptStates.current[entry.id]?.visited);
    const studyReview = captureStudyReview(selectedItems, attemptStates.current, answersRef.current);
    if (!studyReview) return undefined;
    const answeredCount = selectedItems.filter((entry) => wasAnswered(studyReview, entry.id)).length;
    const nextReport: LearningRecord = {
      schemaVersion: 5,
      id: descriptor.id ?? `session-${sessionId}`,
      sessionId,
      bankId: descriptor.bankId,
      bankTitle: descriptor.bankTitle,
      categoryTitle: descriptor.categoryTitle,
      topicTitle: descriptor.topicTitle,
      completedCount: answeredCount,
      answeredCount,
      studiedCount: selectedItems.filter((entry) => attemptStates.current[entry.id]?.visited).length,
      totalCount: selectedItems.length,
      correctCount,
      annotationCount: metrics?.annotationCount ?? legacyAnnotationCount,
      noteCount: metrics?.noteCount ?? legacyNoteCount,
      feedbackCount: feedbackCardIds.size,
      durationSeconds: Math.max(1, Math.round((Date.now() - startedAt) / 1000)),
      reason,
      createdAt: finishedAt.current ?? updatedAt,
      updatedAt,
      recordType: descriptor.recordType ?? (descriptor.mockExam ? 'mock_exam' : 'session'),
      ...(descriptor.mockExam ? { mockExam: { ...descriptor.mockExam, ...(listeningResult.current ? { listeningResult: listeningResult.current } : {}) } } : {}),
      studyReview,
      source: descriptor.source ?? (isExam ? 'mock-exam' : 'question-bank'),
      ...(descriptor.hotspot ? { hotspot: descriptor.hotspot } : {}),
    };
    await store.addRecord(nextReport, writeContext);
    if (checkpoint) return nextReport;
    committedReport.current = nextReport;
    setReport(nextReport);
    recordingRepository.cleanupSession(sessionId);
    return nextReport;
  }, [examMode, feedbackCardIds.size, historyRecord, items, legacyCategory?.name, legacyDataset?.id, legacyDataset?.title, legacyTopic?.name, recordDescriptor, sessionId, startedAt, store, visitedIndexes, writeContext, hydrated, loadError]);

  const saveCheckpoint = useCallback((): Promise<void> => {
    if (historyRecord || examMode || committedReport.current || savingReport.current) return Promise.reject(new Error('study_checkpoint_unavailable'));
    if (savingCheckpoint.current) return savingCheckpoint.current;
    const operation = saveReport('abort', undefined, true).then(record => {
      if (!record) throw new Error('study_checkpoint_unavailable');
    });
    savingCheckpoint.current = operation;
    void operation.finally(() => { if (savingCheckpoint.current === operation) savingCheckpoint.current = undefined; }).catch(() => undefined);
    return operation;
  }, [examMode, historyRecord, saveReport]);

  const finish = useCallback((reason: 'abort' | 'complete', metrics?: { annotationCount?: number; noteCount?: number }) => {
    if (savingReport.current) return savingReport.current;
    const operation = savingCheckpoint.current
      ? savingCheckpoint.current.catch(() => undefined).then(() => saveReport(reason, metrics))
      : saveReport(reason, metrics);
    savingReport.current = operation;
    void operation.finally(() => { if (savingReport.current === operation) savingReport.current = undefined; }).catch(() => undefined);
    return operation;
  }, [saveReport]);
  const saveListeningResult = useCallback(async () => {
    if (!examMode || !listeningRange || committedIndex.current !== listeningRange.endIndex) return undefined;
    listeningResult.current ??= scoreListeningExam(listeningRange, statesRef.current);
    return saveReport(listeningRange.endIndex === items.length - 1 ? 'complete' : 'abort', undefined, true);
  }, [examMode, items.length, listeningRange, saveReport]);

  useEffect(() => () => recordingRepository.cleanupSession(sessionId), [sessionId]);

  return {
    examMode,
    behavior,
    historyRecord,
    historyReview,
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
    saveCheckpoint,
    saveListeningResult,
  };
}
