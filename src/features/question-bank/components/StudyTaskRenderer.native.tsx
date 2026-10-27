import type { ReactNode } from 'react';
import type { GestureType } from 'react-native-gesture-handler';

import type { RecordingAsset } from '../recording/types';
import type { WordLookupInteraction } from '../lib/word-lookup-interaction';
import type { QuestionBankCard, StudyBehavior } from '../types';
import { ChoiceList } from './ChoiceList';
import { ExamSpeakingPractice } from './ExamSpeakingPractice.native';
import { SpeakingPracticePanel } from './SpeakingPracticePanel';

export function StudyTaskRenderer({
  examMode = false,
  highlightMode,
  renderChoiceText,
  behavior,
  card,
  sessionId,
  selectedChoiceIndex,
  revealed,
  choiceReadOnly = false,
  recording,
  onChoose,
  onLookupWord,
  isLookupAvailable,
  lookupInteraction,
  onClearRecording,
  onRecorded,
  onInteractionChange,
  interactionGesture,
  blockedExternalGesture,
  previewPauseRequest,
  onPreviewPlaybackStart,
  onRecordingIntent,
  variant = 'default',
}: {
  examMode?: boolean;
  highlightMode?: boolean;
  renderChoiceText?: (text: string, index: number) => ReactNode;
  behavior: StudyBehavior;
  card: QuestionBankCard;
  sessionId: string;
  selectedChoiceIndex?: number;
  revealed: boolean;
  choiceReadOnly?: boolean;
  recording?: RecordingAsset;
  onChoose: (index: number) => void;
  onLookupWord?: (word: string) => void;
  isLookupAvailable?: (word: string) => boolean;
  lookupInteraction?: WordLookupInteraction;
  onClearRecording: () => void;
  onRecorded: (recording: RecordingAsset) => void;
  onInteractionChange?: (active: boolean) => void;
  interactionGesture?: GestureType;
  blockedExternalGesture?: GestureType;
  previewPauseRequest?: number;
  onPreviewPlaybackStart?: () => void;
  onRecordingIntent?: () => void;
  variant?: 'default' | 'integrated';
}) {
  if (behavior.taskKind === 'choices') {
    return card.choices?.length ? (
      <ChoiceList
        highlightMode={highlightMode}
        renderChoiceText={renderChoiceText}
        choices={card.choices}
        choicesZh={card.choicesZh}
        correctChoiceIndex={card.correctChoiceIndex}
        isLookupAvailable={isLookupAvailable}
        lookupInteraction={lookupInteraction}
        onLookupWord={onLookupWord}
        onSelect={onChoose}
        readOnly={choiceReadOnly}
        selectedChoiceIndex={selectedChoiceIndex}
        showResult={revealed && (selectedChoiceIndex !== undefined || choiceReadOnly)}
        showTranslations={revealed}
      />
    ) : null;
  }

  if (examMode) return <ExamSpeakingPractice cardId={card.id} sessionId={sessionId} recording={recording} onRecorded={onRecorded} onClear={onClearRecording} onInteractionChange={onInteractionChange} onRecordingIntent={onRecordingIntent} interactionGesture={interactionGesture} />;

  return (
    <SpeakingPracticePanel
      blockedExternalGesture={blockedExternalGesture}
      cardId={card.id}
      mode={behavior.recordingMode ?? 'speaking'}
      interactionGesture={interactionGesture}
      onClear={onClearRecording}
      onInteractionChange={onInteractionChange}
      onPreviewPlaybackStart={onPreviewPlaybackStart}
      onRecordingIntent={onRecordingIntent}
      onRecorded={onRecorded}
      previewPauseRequest={previewPauseRequest}
      recording={recording}
      sessionId={sessionId}
      variant={variant}
    />
  );
}
