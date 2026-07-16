import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { sqliteLearningStore, type LearningStore, migrateLegacyCardState } from '../platform/learning-store';
import type {
  CardLearningState,
  LearningRecord,
  QuestionBankCategory,
  QuestionBankDataset,
  QuestionBankTopic,
  StudyConsoleTab,
  StudyToolMode,
} from '../types';
import { getStudyBehavior } from '../lib/study-behavior';
import { recordingRepository } from '../recording/recording-repository';
import type { RecordingAsset } from '../recording/types';

type SaveFailure = { cardId: string; message: string };

function createEmptyCardState(): CardLearningState {
  return {
    visited: false,
    completed: false,
    note: '',
    updatedAt: new Date().toISOString(),
  };
}

export function preferredWorkbenchTab(tabs: StudyConsoleTab[]) {
  return tabs.includes('reference') ? 'reference' : tabs[0] ?? 'notes';
}

export function shouldCompleteLegacyState(state: Partial<CardLearningState>) {
  return migrateLegacyCardState(state).completed;
}

export function useStudySession({
  dataset,
  category,
  topic,
  initialCardId,
  store = sqliteLearningStore,
}: {
  dataset: QuestionBankDataset;
  category: QuestionBankCategory;
  topic: QuestionBankTopic;
  initialCardId?: string;
  store?: LearningStore;
}) {
  const behavior = useMemo(() => getStudyBehavior(dataset), [dataset]);
  const startingIndex = Math.max(0, initialCardId ? topic.cards.findIndex((item) => item.id === initialCardId) : 0);
  const startedAt = useRef(Date.now());
  const sessionId = useRef(`study-${startedAt.current.toString(36)}-${Math.random().toString(36).slice(2, 8)}`).current;
  const sessionStartedAt = useRef(new Date(startedAt.current).toISOString()).current;
  const finishedAt = useRef<string | undefined>(undefined);
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
  const [activeTab, setActiveTab] = useState<StudyConsoleTab>(() => preferredWorkbenchTab(behavior.workbenchTabs));
  const [toolMode, setToolModeState] = useState<StudyToolMode>();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [recordings, setRecordings] = useState<Record<string, RecordingAsset>>({});
  const recordingsRef = useRef(recordings);
  const [attemptedTranscriptionKeys, setAttemptedTranscriptionKeys] = useState<Set<string>>(() => new Set());
  const [feedbackCardIds, setFeedbackCardIds] = useState<Set<string>>(() => new Set());
  const [playRequestToken, setPlayRequestToken] = useState(1);
  const [report, setReport] = useState<LearningRecord>();

  statesRef.current = states;
  recordingsRef.current = recordings;

  const card = topic.cards[currentIndex];
  const cardState = card ? states[card.id] : undefined;

  useEffect(() => {
    let active = true;
    setHydrated(false);
    setLoadError(undefined);
    void store.getTopicStates(topic).then((saved) => {
      if (!active) return;
      setStates(saved);
      setCurrentIndex(startingIndex);
      setVisitedIndexes(new Set([startingIndex]));
      setCompletedCardIds(new Set());
      setRevealed(false);
      setAutoReveal(false);
      setActiveTab(preferredWorkbenchTab(behavior.workbenchTabs));
      setHydrated(true);
    }).catch(() => {
      if (!active) return;
      setLoadError('学习进度读取失败，请重试。');
      setHydrated(true);
    });
    return () => { active = false; };
  }, [behavior.workbenchTabs, loadAttempt, startingIndex, store, topic]);

  const persistCard = useCallback((cardId: string, patch: Partial<CardLearningState>) => {
    const current = statesRef.current[cardId] ?? createEmptyCardState();
    const next = migrateLegacyCardState({
      ...current,
      ...patch,
      visited: current.visited || Boolean(patch.visited) || Object.keys(patch).length > 0,
      updatedAt: new Date().toISOString(),
    });
    const nextStates = { ...statesRef.current, [cardId]: next };
    statesRef.current = nextStates;
    setStates(nextStates);
    setSaveFailure(undefined);
    void store.saveCardState(topic.id, cardId, next).catch(() => {
      setSaveFailure({ cardId, message: '保存失败，内容仍保留在当前页面。' });
    });
    return next;
  }, [store, topic.id]);

  const retrySave = useCallback(() => {
    if (!saveFailure) return;
    const latest = statesRef.current[saveFailure.cardId];
    if (!latest) return;
    setSaveFailure(undefined);
    void store.saveCardState(topic.id, saveFailure.cardId, latest).catch(() => {
      setSaveFailure({ cardId: saveFailure.cardId, message: '再次保存失败，请稍后重试。' });
    });
  }, [saveFailure, store, topic.id]);

  const markCompleted = useCallback((cardId: string) => {
    setCompletedCardIds((current) => new Set(current).add(cardId));
    persistCard(cardId, { completed: true });
  }, [persistCard]);

  const revealCurrent = useCallback((persistAcrossCards = false) => {
    if (!card) return;
    if (persistAcrossCards) setAutoReveal(true);
    setRevealed(true);
    markCompleted(card.id);
  }, [card, markCompleted]);

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
    if (nextIndex < 0 || nextIndex >= topic.cards.length || nextIndex === currentIndex) return;
    setCurrentIndex(nextIndex);
    setVisitedIndexes((current) => new Set(current).add(nextIndex));
    setPlayRequestToken((current) => current + 1);
    setToolModeState(undefined);
    setActiveTab(preferredWorkbenchTab(behavior.workbenchTabs));
    setRevealed(autoReveal);
    if (autoReveal) markCompleted(topic.cards[nextIndex].id);
  }, [autoReveal, behavior.workbenchTabs, currentIndex, markCompleted, topic.cards]);

  const chooseOption = useCallback((choiceIndex: number) => {
    if (!card) return;
    persistCard(card.id, { selectedChoiceIndex: choiceIndex, completed: true });
    setCompletedCardIds((current) => new Set(current).add(card.id));
    setRevealed(true);
  }, [card, persistCard]);

  const recordAnswer = useCallback((recording: RecordingAsset) => {
    if (!card) return;
    const previous = recordingsRef.current[card.id];
    setRecordings((current) => ({ ...current, [card.id]: recording }));
    if (previous && previous.id !== recording.id) recordingRepository.discard(previous);
    persistCard(card.id, { recorded: true, recordingDurationMillis: recording.durationMillis, completed: true });
    setCompletedCardIds((current) => new Set(current).add(card.id));
    setRevealed(true);
    if (behavior.workbenchTabs.includes('mine')) setActiveTab('mine');
  }, [behavior.workbenchTabs, card, persistCard]);

  const clearRecording = useCallback(() => {
    if (!card) return;
    const previous = recordingsRef.current[card.id];
    setRecordings((current) => {
      const next = { ...current };
      delete next[card.id];
      return next;
    });
    if (previous) recordingRepository.discard(previous);
  }, [card]);

  const markTranscriptionAttempted = useCallback((recordingKey: string) => {
    setAttemptedTranscriptionKeys((current) => new Set(current).add(recordingKey));
  }, []);

  const updateAnswer = useCallback((text: string) => {
    if (!card) return;
    setAnswers((current) => ({ ...current, [card.id]: text }));
  }, [card]);

  const markFeedback = useCallback(() => {
    if (!card) return;
    setFeedbackCardIds((current) => new Set(current).add(card.id));
  }, [card]);

  const finish = useCallback(async (
    reason: 'abort' | 'complete',
    metrics?: { annotationCount?: number; noteCount?: number },
  ) => {
    const sessionCardIds = new Set(
      Array.from(visitedIndexes).flatMap((index) => topic.cards[index]?.id ?? []),
    );
    const sessionStates = Object.entries(statesRef.current).filter(([cardId]) => sessionCardIds.has(cardId));
    const legacyAnnotationCount = sessionStates.reduce(
      (count, [, state]) => count + (state.tagIds?.length ?? 0) + (state.highlights?.length ?? 0),
      0,
    );
    const legacyNoteCount = sessionStates.filter(([, state]) => state.note.trim()).length;
    const correctCount = topic.cards.reduce(
      (count, item) => count + (sessionCardIds.has(item.id) && statesRef.current[item.id]?.selectedChoiceIndex === item.correctChoiceIndex ? 1 : 0),
      0,
    );
    const updatedAt = new Date().toISOString();
    finishedAt.current ??= updatedAt;
    const nextReport: LearningRecord = {
      schemaVersion: 3,
      id: `session-${sessionId}`,
      sessionId,
      bankId: dataset.id,
      bankTitle: dataset.title,
      categoryTitle: category.name,
      topicTitle: topic.name,
      completedCount: completedCardIds.size,
      totalCount: topic.cards.length,
      correctCount,
      annotationCount: metrics?.annotationCount ?? legacyAnnotationCount,
      noteCount: metrics?.noteCount ?? legacyNoteCount,
      feedbackCount: feedbackCardIds.size,
      durationSeconds: Math.max(1, Math.round((Date.now() - startedAt.current) / 1000)),
      reason,
      createdAt: finishedAt.current,
      updatedAt,
      recordType: 'session',
    };
    await store.addRecord(nextReport);
    setReport(nextReport);
    recordingRepository.cleanupSession(sessionId);
    return nextReport;
  }, [category.name, completedCardIds.size, dataset.id, dataset.title, feedbackCardIds.size, sessionId, store, topic.cards, topic.name, visitedIndexes]);

  useEffect(() => () => recordingRepository.cleanupSession(sessionId), [sessionId]);

  return {
    behavior,
    sessionId,
    sessionStartedAt,
    hydrated,
    loadError,
    retryHydration: () => setLoadAttempt((current) => current + 1),
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
    answerText: card ? answers[card.id] ?? '' : '',
    recordings,
    recording: card ? recordings[card.id] : undefined,
    attemptedTranscriptionKeys,
    markTranscriptionAttempted,
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
