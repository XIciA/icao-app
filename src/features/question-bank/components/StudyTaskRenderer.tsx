import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { GestureType } from 'react-native-gesture-handler';

import type { RecordingAsset } from '../recording/types';
import type { WordLookupInteraction } from '../lib/word-lookup-interaction';
import type { QuestionBankCard, StudyBehavior } from '../types';
import { ChoiceList } from './ChoiceList';
import { SpeakingPracticePanel } from './SpeakingPracticePanel';

export function StudyTaskRenderer({
  behavior,
  card,
  sessionId,
  selectedChoiceIndex,
  revealed,
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
  behavior: StudyBehavior;
  card: QuestionBankCard;
  sessionId: string;
  selectedChoiceIndex?: number;
  revealed: boolean;
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
        choices={card.choices}
        choicesZh={card.choicesZh}
        correctChoiceIndex={card.correctChoiceIndex}
        isLookupAvailable={isLookupAvailable}
        lookupInteraction={lookupInteraction}
        onLookupWord={onLookupWord}
        onSelect={onChoose}
        selectedChoiceIndex={selectedChoiceIndex}
        showResult={revealed && selectedChoiceIndex !== undefined}
        showTranslations={revealed}
      />
    ) : null;
  }

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

export function TaskSection({ children }: { children: ReactNode }) {
  return <View>{children}</View>;
}
