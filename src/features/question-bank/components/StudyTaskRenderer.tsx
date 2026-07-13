import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { GestureType } from 'react-native-gesture-handler';

import type { LocalRecordingState } from '../hooks/useStudySession';
import type { QuestionBankCard, StudyBehavior } from '../types';
import { ChoiceList } from './ChoiceList';
import { SpeakingPracticePanel } from './SpeakingPracticePanel';

export function StudyTaskRenderer({
  behavior,
  card,
  selectedChoiceIndex,
  revealed,
  recording,
  onChoose,
  onClearRecording,
  onRecorded,
  onInteractionChange,
  interactionGesture,
}: {
  behavior: StudyBehavior;
  card: QuestionBankCard;
  selectedChoiceIndex?: number;
  revealed: boolean;
  recording?: LocalRecordingState;
  onChoose: (index: number) => void;
  onClearRecording: () => void;
  onRecorded: (recording: LocalRecordingState) => void;
  onInteractionChange?: (active: boolean) => void;
  interactionGesture?: GestureType;
}) {
  if (behavior.taskKind === 'choices') {
    return card.choices?.length ? (
      <ChoiceList
        choices={card.choices}
        correctChoiceIndex={card.correctChoiceIndex}
        onSelect={onChoose}
        selectedChoiceIndex={selectedChoiceIndex}
        showResult={revealed && selectedChoiceIndex !== undefined}
      />
    ) : null;
  }

  return (
    <SpeakingPracticePanel
      mode={behavior.recordingMode ?? 'speaking'}
      interactionGesture={interactionGesture}
      onClear={onClearRecording}
      onInteractionChange={onInteractionChange}
      onRecorded={onRecorded}
      recording={recording}
    />
  );
}

export function TaskSection({ children }: { children: ReactNode }) {
  return <View>{children}</View>;
}
