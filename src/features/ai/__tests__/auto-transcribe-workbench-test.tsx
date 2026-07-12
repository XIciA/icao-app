import { render, waitFor } from '@testing-library/react-native';

import { StudyWorkbench } from '@/features/question-bank/components/StudyWorkbench';

const mockTranscribeRecording = jest.fn(async (_uri: string, _signal?: AbortSignal) => ({
  hintsVersion: 'transcribe-hints-v1',
  rawTranscript: 'raw aviation transcript',
  transcript: 'normalized aviation transcript',
}));
const mockAcceptAiConsent = jest.fn(async () => ({ policyVersion: 'v1', acceptedAt: new Date().toISOString() }));
const mockHasAiConsent = jest.fn(async () => true);

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
  return { Check: Icon, Eraser: Icon, Mic: Icon, NotebookPen: Icon, Save: Icon, Sparkles: Icon };
});

describe('AI speaking workbench', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('automatically transcribes each completed recording once', async () => {
    const onAnswerChange = jest.fn();
    const screen = await render(
      <StudyWorkbench
        activeTab="mine"
        answerText=""
        bankId="opi"
        bankTitle="OPI"
        cardKey="opi-card-1"
        categoryTitle="运行"
        noteText=""
        onAnswerChange={onAnswerChange}
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
        tabs={['mine']}
        topicTitle="燃油"
      />,
    );

    await waitFor(() => expect(mockHasAiConsent).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockTranscribeRecording).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onAnswerChange).toHaveBeenCalledWith('normalized aviation transcript'));
    expect(screen.getByText('raw aviation transcript')).toBeTruthy();
  });
});
