import { render, waitFor } from '@testing-library/react-native';
import { useState } from 'react';
import { Gesture } from 'react-native-gesture-handler';

import { StudyWorkbench } from '@/features/question-bank/components/StudyWorkbench';

const mockTranscribeRecording = jest.fn(async (_uri: string, _signal?: AbortSignal) => ({
  hintsVersion: 'transcribe-hints:v1',
  rawTranscript: 'raw aviation transcript',
  transcript: 'normalized aviation transcript',
}));
const mockAcceptAiConsent = jest.fn(async () => ({ policyVersion: 'v1', acceptedAt: new Date().toISOString() }));
const mockHasAiConsent = jest.fn(async () => true);
const mockAddRecord = jest.fn(async () => undefined);

jest.mock('@/features/ai/ai-client', () => ({
  acceptAiConsent: () => mockAcceptAiConsent(),
  grammarReview: jest.fn(),
  hasAiConsent: () => mockHasAiConsent(),
  polishExpression: jest.fn(),
  transcribeRecording: (uri: string, signal?: AbortSignal) => mockTranscribeRecording(uri, signal),
}));

jest.mock('lucide-react-native', () => {
  const { View } = jest.requireActual('react-native');
  const Icon = (props: object) => <View {...props} />;
  return { Check: Icon, Eraser: Icon, Mic: Icon, NotebookPen: Icon, Pencil: Icon, Save: Icon, Sparkles: Icon };
});

describe('AI speaking workbench', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('automatically transcribes each completed recording once', async () => {
    const onAnswerChange = jest.fn();
    const learningStore = { addRecord: mockAddRecord };
    function Harness() {
      const [answerText, setAnswerText] = useState('');
      return (
        <StudyWorkbench
          activeTab="mine"
          answerText={answerText}
          bankId="opi"
          bankTitle="OPI"
          cardKey="opi-card-1"
          categoryTitle="运行"
          learningStore={learningStore}
          noteText=""
          onAnswerChange={(text) => { onAnswerChange(text); setAnswerText(text); }}
          onEditingTabChange={jest.fn()}
          onFeedback={jest.fn()}
          onNoteChange={jest.fn()}
          onRetrySave={jest.fn()}
          onTabChange={jest.fn()}
          questionText="Question"
          recordingKey="file:///recording.wav:3000"
          recordingUri="file:///recording.wav"
          referenceContent={null}
          referenceLabel="参考答案"
          reviewKind="opi-analysis"
          sessionId="study-test-session"
          sessionStartedAt="2026-07-15T00:00:00.000Z"
          swipeGesture={Gesture.Pan().enabled(false)}
          tabs={['mine']}
          topicTitle="燃油"
        />
      );
    }
    const screen = await render(
      <Harness />,
    );

    await waitFor(() => expect(mockHasAiConsent).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockTranscribeRecording).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onAnswerChange).toHaveBeenCalledWith('normalized aviation transcript'));
    await waitFor(() => expect(screen.getByText('normalized aviation transcript')).toBeTruthy());
    await waitFor(() => expect(mockAddRecord).toHaveBeenCalledWith(expect.objectContaining({
      cardId: 'opi-card-1',
      id: expect.stringContaining('study-test-session'),
      schemaVersion: 3,
      aiResult: expect.objectContaining({ transcript: 'normalized aviation transcript' }),
    })));
    expect(screen.queryByLabelText('我的回答')).toBeNull();
    expect(screen.queryByText('转写录音')).toBeNull();
    expect(screen.queryByText('原始识别文本（只读）')).toBeNull();
    expect(screen.queryByText('raw aviation transcript')).toBeNull();
  });

  it('does not transcribe the same recording again after the workbench remounts', async () => {
    const onTranscriptionAttempted = jest.fn();
    const commonProps = {
      activeTab: 'mine' as const,
      answerText: '',
      bankId: 'opi' as const,
      bankTitle: 'OPI',
      cardKey: 'opi-card-1',
      categoryTitle: '运行',
      learningStore: { addRecord: mockAddRecord },
      noteText: '',
      onAnswerChange: jest.fn(),
      onEditingTabChange: jest.fn(),
      onFeedback: jest.fn(),
      onNoteChange: jest.fn(),
      onRetrySave: jest.fn(),
      onTabChange: jest.fn(),
      onTranscriptionAttempted,
      questionText: 'Question',
      recordingKey: 'file:///recording.wav:3000',
      recordingUri: 'file:///recording.wav',
      referenceContent: null,
      referenceLabel: '参考答案',
      reviewKind: 'opi-analysis' as const,
      sessionId: 'study-test-session',
      sessionStartedAt: '2026-07-15T00:00:00.000Z',
      swipeGesture: Gesture.Pan().enabled(false),
      tabs: ['mine'] as const,
      topicTitle: '燃油',
    };
    const first = await render(<StudyWorkbench {...commonProps} tabs={[...commonProps.tabs]} />);
    await waitFor(() => expect(mockTranscribeRecording).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onTranscriptionAttempted).toHaveBeenCalledWith('file:///recording.wav:3000'));
    await first.unmount();

    await render(<StudyWorkbench {...commonProps} tabs={[...commonProps.tabs]} transcriptionAttempted />);

    expect(mockTranscribeRecording).toHaveBeenCalledTimes(1);
  });
});
