import { View } from 'react-native';
import { AppText } from '@/components/ui';
import { AiGeneratedContentLabel } from '@/features/ai/AiGeneratedContentLabel';
import { spacing } from '@/theme';
import type { QuestionAnnotationEntry, AnnotationDefinition } from '../annotations/types';
import type { LearningRecord } from '../types';

export function StudyHistoryPersonalContent({ answer, selectedChoiceIndex, recorded, feedback, note, tags, definitions }: {
  answer: string;
  selectedChoiceIndex?: number;
  recorded?: boolean;
  feedback?: LearningRecord['aiResult'];
  note?: QuestionAnnotationEntry['note'];
  tags?: string[];
  definitions: AnnotationDefinition[];
}) {
  const labels = definitions.filter((definition) => tags?.includes(definition.id)).map((definition) => definition.label);
  const analyzed = feedback?.analyzedTranscript ?? feedback?.transcript;
  const currentAnswer = answer.trim();
  const recoveredTranscript = feedback?.rawTranscript?.trim();
  const previousAnswerFeedback = analyzed !== (currentAnswer || recoveredTranscript || '');
  return <View style={{ gap: spacing[2], paddingVertical: spacing[2] }}>
    <AppText variant="button">我的回答</AppText>
    {!currentAnswer && recoveredTranscript ? <AppText variant="caption">本次转写</AppText> : null}
    <AppText>{currentAnswer || recoveredTranscript || (selectedChoiceIndex !== undefined ? `已选 ${String.fromCharCode(65 + selectedChoiceIndex)}` : recorded ? '本题仅录音，未保存文字回答' : '未作答')}</AppText>
    {currentAnswer && recoveredTranscript && currentAnswer !== recoveredTranscript ? <><AppText variant="button">本次转写</AppText><AppText>{recoveredTranscript}</AppText></> : null}
    {feedback && (feedback.grammar || feedback.polishedText) ? <>
      <AppText variant="button">{previousAnswerFeedback ? '此前回答的 AI 反馈' : '本次 AI 反馈'}</AppText>
      {previousAnswerFeedback ? <AppText>{analyzed}</AppText> : null}
      <AiGeneratedContentLabel />
      {feedback.grammar ? <>
        <AppText>{feedback.grammar.correctedText}</AppText>
        {feedback.grammar.issues.map((issue, index) => <AppText key={index} variant="caption">{typeof issue === 'string' ? issue : `${issue.before} → ${issue.after}：${issue.reasonZh}`}</AppText>)}
      </> : null}
      {feedback.polishedText ? <AppText>{feedback.polishedText}</AppText> : null}
    </> : null}
    {note?.trim() ? <><AppText variant="button">我的笔记</AppText><AppText>{note}</AppText></> : null}
    {labels.length ? <><AppText variant="button">标签</AppText><AppText>{labels.join(' · ')}</AppText></> : null}
  </View>;
}
