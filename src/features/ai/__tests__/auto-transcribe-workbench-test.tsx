jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { useState } from 'react';
import { Gesture } from 'react-native-gesture-handler';

// Keep coverage for the frozen shared/Web implementation; Native has its own suite.
const { StudyWorkbench } = jest.requireActual('@/features/question-bank/components/StudyWorkbench.tsx') as typeof import('@/features/question-bank/components/StudyWorkbench');

const mockTranscribeRecording = jest.fn(async (_uri: string, _signal?: AbortSignal) => ({
  transcript: 'normalized aviation transcript',
  aiPoints: { operationId: 'op-transcribe', ruleVersion: 'ai-points-v1' as const, estimated: 5, charged: 5, remaining: 95 },
}));
const mockAcceptAiConsent = jest.fn(async () => ({ policyVersion: 'v1', acceptedAt: new Date().toISOString() }));
const mockHasAiConsent = jest.fn(async () => true);
const mockAddRecord = jest.fn(async () => undefined);
const mockReviewExpression = jest.fn(async (_input: unknown, _signal?: AbortSignal) => ({
  grammar: { correctedText: 'He has informed ATC.', issues: [{ before: 'He have', after: 'He has', reasonZh: '主谓一致错误。' }] },
  promptVersion: 'deepseek-review:v1' as const,
  aiPoints: { operationId: 'op-review', ruleVersion: 'ai-points-v1' as const, estimated: 3, charged: 3, remaining: 92 },
}));
const mockRouterPush = jest.fn();

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockRouterPush }) }));

jest.mock('@/features/ai/ai-client', () => ({
  acceptAiConsent: () => mockAcceptAiConsent(),
  hasAiConsent: () => mockHasAiConsent(),
  reviewExpression: (input: unknown, signal?: AbortSignal) => mockReviewExpression(input, signal),
  transcribeRecording: (uri: string, signal?: AbortSignal) => mockTranscribeRecording(uri, signal),
}));

jest.mock('lucide-react-native', () => {
  const { View } = jest.requireActual('react-native');
  const Icon = (props: object) => <View {...props} />;
  return { BookOpenCheck: Icon, Check: Icon, Eraser: Icon, MessageSquareText: Icon, Mic: Icon, NotebookPen: Icon, Pencil: Icon, Save: Icon, Sparkles: Icon };
});

describe('shared AI speaking workbench', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHasAiConsent.mockResolvedValue(true);
  });

  it('waits for an explicit transcribe action before processing a completed recording', async () => {
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
    expect(mockTranscribeRecording).not.toHaveBeenCalled();
    expect(screen.getByLabelText('转写')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByLabelText('转写'));
      await Promise.resolve();
    });

    await waitFor(() => expect(mockHasAiConsent).toHaveBeenCalledTimes(2));
    expect(mockAcceptAiConsent).not.toHaveBeenCalled();
    await waitFor(() => expect(mockTranscribeRecording).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onAnswerChange).toHaveBeenCalledWith('normalized aviation transcript'));
    await waitFor(() => expect(screen.getByText('normalized aviation transcript')).toBeTruthy());
    expect(screen.getByText('本次已扣 5 点，剩余 95 点')).toBeTruthy();
    await waitFor(() => expect(mockAddRecord).toHaveBeenCalledWith(expect.objectContaining({
      cardId: 'opi-card-1',
      id: expect.stringContaining('study-test-session'),
      schemaVersion: 4,
      aiResult: expect.objectContaining({ transcript: 'normalized aviation transcript' }),
    })));
    expect(screen.queryByLabelText('我的回答')).toBeNull();
    expect(screen.getByTestId('study-workbench-transcribe-action')).toBeTruthy();
    expect(screen.queryByText('原始识别文本（只读）')).toBeNull();
    expect(screen.queryByText('raw aviation transcript')).toBeNull();
  });

  it('does not upload audio until the user explicitly accepts AI data processing', async () => {
    mockHasAiConsent.mockResolvedValue(false);
    const screen = await render(
      <StudyWorkbench
        activeTab="mine"
        answerText=""
        bankId="opi"
        bankTitle="OPI"
        cardKey="opi-card-explicit-consent"
        categoryTitle="运行"
        learningStore={{ addRecord: mockAddRecord }}
        noteText=""
        onAnswerChange={jest.fn()}
        onEditingTabChange={jest.fn()}
        onFeedback={jest.fn()}
        onNoteChange={jest.fn()}
        onRetrySave={jest.fn()}
        onTabChange={jest.fn()}
        questionText="Question"
        recordingUri="file:///private-recording.wav"
        referenceContent={null}
        referenceLabel="参考答案"
        reviewKind="opi-analysis"
        sessionId="study-test-session"
        sessionStartedAt="2026-07-15T00:00:00.000Z"
        swipeGesture={Gesture.Pan().enabled(false)}
        tabs={['mine']}
        topicTitle="燃油"
      />,
    );

    await waitFor(() => expect(mockHasAiConsent).toHaveBeenCalled());
    await act(async () => {
      fireEvent.press(screen.getByLabelText('转写'));
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.getByLabelText('AI 数据处理提示')).toBeTruthy());
    expect(screen.getByText(/发送至腾讯云语音识别/u)).toBeTruthy();
    expect(mockAcceptAiConsent).not.toHaveBeenCalled();
    expect(mockTranscribeRecording).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.press(screen.getByText('暂不使用'));
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.queryByLabelText('AI 数据处理提示')).toBeNull());
    expect(mockAcceptAiConsent).not.toHaveBeenCalled();
    expect(mockTranscribeRecording).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.press(screen.getByLabelText('转写'));
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.getByLabelText('AI 数据处理提示')).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByText('同意并继续'));
      await Promise.resolve();
    });

    await waitFor(() => expect(mockAcceptAiConsent).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockTranscribeRecording).toHaveBeenCalledTimes(1));
  });

  it('discloses DeepSeek before sending Native text for review', async () => {
    mockHasAiConsent.mockResolvedValue(false);
    const screen = await render(
      <StudyWorkbench
        activeTab="mine"
        answerText="He have informed ATC."
        bankId="opi"
        bankTitle="OPI"
        cardKey="opi-card-text-consent"
        categoryTitle="运行"
        learningStore={{ addRecord: mockAddRecord }}
        noteText=""
        onAnswerChange={jest.fn()}
        onEditingTabChange={jest.fn()}
        onFeedback={jest.fn()}
        onNoteChange={jest.fn()}
        onRetrySave={jest.fn()}
        onTabChange={jest.fn()}
        questionText="Question"
        referenceContent={null}
        referenceLabel="参考答案"
        reviewKind="grammar"
        sessionId="study-test-session"
        sessionStartedAt="2026-07-15T00:00:00.000Z"
        swipeGesture={Gesture.Pan().enabled(false)}
        tabs={['mine']}
        topicTitle="燃油"
      />,
    );

    await waitFor(() => expect(mockHasAiConsent).toHaveBeenCalled());
    await act(async () => { fireEvent.press(screen.getByLabelText('分析表达')); });
    await waitFor(() => expect(screen.getByText(/发送至 DeepSeek/u)).toBeTruthy());
    expect(mockReviewExpression).not.toHaveBeenCalled();

    await act(async () => { fireEvent.press(screen.getByText('同意并继续')); });
    await waitFor(() => expect(mockReviewExpression).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText('语法纠错')).toBeTruthy());
  });

  it('explains when the provider detects no speech in the recording', async () => {
    mockTranscribeRecording.mockRejectedValueOnce(new Error('no_speech_detected'));
    const screen = await render(
      <StudyWorkbench
        activeTab="mine"
        answerText=""
        bankId="opi"
        bankTitle="OPI"
        cardKey="opi-card-no-speech"
        categoryTitle="运行"
        learningStore={{ addRecord: mockAddRecord }}
        noteText=""
        onAnswerChange={jest.fn()}
        onEditingTabChange={jest.fn()}
        onFeedback={jest.fn()}
        onNoteChange={jest.fn()}
        onRetrySave={jest.fn()}
        onTabChange={jest.fn()}
        questionText="Question"
        recordingUri="file:///silent.webm"
        referenceContent={null}
        referenceLabel="参考答案"
        reviewKind="opi-analysis"
        sessionId="study-test-session"
        sessionStartedAt="2026-07-15T00:00:00.000Z"
        swipeGesture={Gesture.Pan().enabled(false)}
        tabs={['mine']}
        topicTitle="燃油"
      />,
    );

    expect(mockTranscribeRecording).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('转写'));
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.getByText(/未检测到清晰语音，请回放录音并检查麦克风后重新录制。.*A-/u)).toBeTruthy());
    fireEvent.press(screen.getByLabelText('提交 AI 诊断'));
    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: '/info/[slug]',
      params: expect.objectContaining({
        correlationId: expect.stringMatching(/^A-[A-Z0-9]{5}-[A-Z0-9]{2}$/u),
        feature: 'ai',
        slug: 'feedback',
      }),
    });
  });

  it('does not show an AI fault when an in-flight transcription is cancelled', async () => {
    mockTranscribeRecording.mockImplementationOnce((_uri, signal) => new Promise((_, reject) => {
      signal?.addEventListener('abort', () => reject(new Error('ai_cancelled')), { once: true });
    }));
    const screen = await render(
      <StudyWorkbench
        activeTab="mine"
        answerText=""
        bankId="opi"
        bankTitle="OPI"
        cardKey="opi-card-cancel-transcription"
        categoryTitle="运行"
        learningStore={{ addRecord: mockAddRecord }}
        noteText=""
        onAnswerChange={jest.fn()}
        onEditingTabChange={jest.fn()}
        onFeedback={jest.fn()}
        onNoteChange={jest.fn()}
        onRetrySave={jest.fn()}
        onTabChange={jest.fn()}
        questionText="Question"
        recordingUri="file:///recording.m4a"
        referenceContent={null}
        referenceLabel="参考答案"
        reviewKind="opi-analysis"
        sessionId="study-test-session"
        sessionStartedAt="2026-07-15T00:00:00.000Z"
        swipeGesture={Gesture.Pan().enabled(false)}
        tabs={['mine']}
        topicTitle="燃油"
      />,
    );

    await act(async () => { fireEvent.press(screen.getByLabelText('转写')); });
    await waitFor(() => expect(screen.getByLabelText('取消当前 AI 操作')).toBeTruthy());
    await act(async () => { fireEvent.press(screen.getByLabelText('取消当前 AI 操作')); });
    await waitFor(() => expect(screen.queryByLabelText('取消当前 AI 操作')).toBeNull());
    expect(screen.queryByText(/诊断编号：A-/u)).toBeNull();
  });

  it('requires explicit consent when another device revokes after this screen cached acceptance', async () => {
    mockHasAiConsent.mockReset();
    mockHasAiConsent.mockResolvedValueOnce(true).mockResolvedValue(false);
    const screen = await render(
      <StudyWorkbench
        activeTab="mine"
        answerText=""
        bankId="opi"
        bankTitle="OPI"
        cardKey="opi-card-consent"
        categoryTitle="运行"
        learningStore={{ addRecord: mockAddRecord }}
        noteText=""
        onAnswerChange={jest.fn()}
        onEditingTabChange={jest.fn()}
        onFeedback={jest.fn()}
        onNoteChange={jest.fn()}
        onRetrySave={jest.fn()}
        onTabChange={jest.fn()}
        questionText="Question"
        recordingUri="file:///recording.wav"
        referenceContent={null}
        referenceLabel="参考答案"
        reviewKind="opi-analysis"
        sessionId="study-test-session"
        sessionStartedAt="2026-07-15T00:00:00.000Z"
        swipeGesture={Gesture.Pan().enabled(false)}
        tabs={['mine']}
        topicTitle="燃油"
      />,
    );

    await waitFor(() => expect(mockHasAiConsent).toHaveBeenCalledTimes(1));
    await act(async () => {
      fireEvent.press(screen.getByLabelText('转写'));
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.getByLabelText('AI 数据处理提示')).toBeTruthy());
    expect(mockAcceptAiConsent).not.toHaveBeenCalled();
    expect(mockTranscribeRecording).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.press(screen.getByText('同意并继续'));
      await Promise.resolve();
    });

    await waitFor(() => expect(mockAcceptAiConsent).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockTranscribeRecording).toHaveBeenCalledTimes(1));
    expect(mockAcceptAiConsent.mock.invocationCallOrder[0]).toBeLessThan(mockTranscribeRecording.mock.invocationCallOrder[0]);
  });

  it('does not start a transcription after the workbench remounts until the user presses transcribe', async () => {
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
      questionText: 'Question',
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
    expect(mockTranscribeRecording).not.toHaveBeenCalled();
    await first.unmount();

    const second = await render(<StudyWorkbench {...commonProps} tabs={[...commonProps.tabs]} />);

    expect(mockTranscribeRecording).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.press(second.getByLabelText('转写'));
      await Promise.resolve();
    });
    await waitFor(() => expect(mockTranscribeRecording).toHaveBeenCalledTimes(1));
  });
});
