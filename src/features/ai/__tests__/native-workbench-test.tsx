import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { createRef, useState, type Ref } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import { StudyWorkbench, type StudyWorkbenchHandle, type StudyWorkbenchFeedbackCache } from '@/features/question-bank/components/StudyWorkbench.native';
import { AiOperationFailure } from '@/features/ai/ai-operation-failure.native';
import { ApiClientError } from '@/platform/api-client';
import type { LearningRecord, StudyReviewKind } from '@/features/question-bank/types';
const mockHasConsent = jest.fn(async () => true);
const mockAcceptConsent = jest.fn(async () => undefined);
const mockTranscribe = jest.fn();
const mockReview = jest.fn();
const mockCombined = jest.fn();
const mockSave = jest.fn(async (..._args: unknown[]) => undefined);
const mockFeedback = jest.fn();
const mockCheckpoint = jest.fn(async (): Promise<void> => undefined);
const mockAnswer = jest.fn();
const mockPush = jest.fn();
const mockPending = jest.fn(async (_record: unknown, operationId: string) => ({ operationId, environment: 'sandbox', status: 'pending' }));
let mockUuidSequence = 0;
jest.mock('expo-crypto', () => ({ randomUUID: () => `operation-${++mockUuidSequence}` }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }), usePathname: () => '/question-bank/opi/categories/a/topics/b/study' }));
jest.mock('@/features/ai/ai-client.native', () => ({
  hasAiConsent: () => mockHasConsent(), acceptAiConsent: () => mockAcceptConsent(),
  transcribeRecording: (...args: unknown[]) => mockTranscribe(...args),
  reviewExpression: (...args: unknown[]) => mockReview(...args),
  transcribeAndReviewRecording: (...args: unknown[]) => mockCombined(...args),
}));
jest.mock('@/features/ai/ai-operation-recovery.native', () => ({
  savePendingAiOperation: (...args: [unknown, string]) => mockPending(...args),
  completePendingAiOperation: async (_recordId: string, operationId: string) => ({ aiOperation: { operationId, environment: 'sandbox', status: 'complete' } }),
  abandonPendingAiOperation: jest.fn(async () => undefined),
}));
jest.mock('@/features/sync/learning-sync.native', () => ({ captureLearningWriteContext: () => ({ accountId: 'account-a', generation: 1 }) }));
jest.mock('@/features/question-bank/platform/learning-store.native', () => ({ sqliteLearningStore: { addRecord: (...args: unknown[]) => mockSave(...args) } }));
jest.mock('@/components/ui', () => {
  const actual = jest.requireActual('@/components/ui');
  const { View } = jest.requireActual('react-native');
  return { ...actual, BottomSheet: ({ children, visible }: { children: React.ReactNode; visible: boolean }) => visible ? <View>{children}</View> : null };
});
const review = { grammar: { correctedText: 'We are ready.', issues: [] }, polishedText: 'We are ready to depart.', promptVersion: 'deepseek-review:v1' as const };
function Harness({ kind = 'opi-analysis', card = 'q1', recording = 'file:///one.m4a', sessionId = 'study-1', initialFeedback, workbenchRef, feedbackCacheRef }: {
  kind?: StudyReviewKind; card?: string; recording?: string; sessionId?: string;
  initialFeedback?: LearningRecord['aiResult']; workbenchRef?: Ref<StudyWorkbenchHandle>;
  feedbackCacheRef?: { current: StudyWorkbenchFeedbackCache | undefined };
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const answerKey = `${sessionId}:${card}`;
  const answer = answers[answerKey] ?? 'My previous answer.';
  const [editingTab, setEditingTab] = useState<'mine' | 'notes'>();
  return <StudyWorkbench activeTab="mine" answerText={answer} bankId={kind === 'exact-match' ? 'sentences900' : 'opi'} bankTitle="OPI" cardKey={card}
    sourceCardId="original-q" categoryTitle="运行" topicTitle="飞行" questionText="Question" noteText="" referenceContent={null} referenceLabel="参考答案"
    reviewKind={kind} recordingUri={recording} sessionId={sessionId} sessionStartedAt={new Date().toISOString()} tabs={['mine']}
    initialFeedback={initialFeedback} feedbackCacheRef={feedbackCacheRef} ref={workbenchRef} editingTab={editingTab}
    swipeGesture={Gesture.Pan().enabled(false)} learningStore={{ addRecord: mockSave }}
    onAnswerChange={(value) => { mockAnswer(value); setAnswers((current) => ({ ...current, [answerKey]: value })); }} onFeedback={mockFeedback} onBeforeAiOperation={mockCheckpoint}
    onNoteChange={jest.fn()} onRetrySave={jest.fn()} onEditingTabChange={setEditingTab} onTabChange={jest.fn()} />;
}
beforeEach(() => {
  jest.clearAllMocks(); mockHasConsent.mockResolvedValue(true);
  mockCombined.mockResolvedValue({ transcript: 'We are ready.', review, aiPoints: { charged: 10, remaining: 90 } });
  mockTranscribe.mockResolvedValue({ transcript: 'Standalone transcript.' });
  mockReview.mockResolvedValue(review);
});
async function chooseCombination(screen: Awaited<ReturnType<typeof render>>) {
  await act(() => fireEvent.press(screen.getByLabelText('转写')));
  await act(() => fireEvent.press(screen.getByText('转写并分析')));
}
it('only sends the selected atomic action and saves both outputs under the original question without unit labels', async () => {
  const screen = await render(<Harness />);
  await waitFor(() => expect(mockHasConsent).toHaveBeenCalled());
  expect(mockCombined).not.toHaveBeenCalled();
  await chooseCombination(screen);
  await waitFor(() => expect(screen.getByTestId('study-workbench-review-result')).toBeTruthy());
  expect(mockTranscribe).not.toHaveBeenCalled(); expect(mockReview).not.toHaveBeenCalled();
  expect(mockCombined).toHaveBeenCalledWith('file:///one.m4a', { mode: 'opi', module: 'opi', questionId: 'original-q' }, expect.any(AbortSignal), expect.any(String));
  expect(mockAnswer).toHaveBeenCalledWith('We are ready.');
  expect(screen.queryByText(/本次已扣|剩余.*点|转写.*点|分析表达.*点/)).toBeNull();
  await waitFor(() => expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({ cardId: 'original-q', schemaVersion: 5,
    aiResult: expect.objectContaining({ transcript: 'We are ready.', analyzedTranscript: 'We are ready.', polishedText: review.polishedText }) }), expect.objectContaining({ accountId: 'account-a' })));
});
it('keeps the original answer on uncertain failure and reuses the task id for retry', async () => {
  mockCombined.mockRejectedValueOnce(new ApiClientError('ai_timeout', 408));
  const screen = await render(<Harness />); await chooseCombination(screen);
  await waitFor(() => expect(screen.getByTestId('study-workbench-ai-retry')).toBeTruthy());
  expect(mockAnswer).not.toHaveBeenCalled(); expect(screen.getByText('My previous answer.')).toBeTruthy();
  await act(() => fireEvent.press(screen.getByTestId('study-workbench-ai-retry')));
  await waitFor(() => expect(mockCombined).toHaveBeenCalledTimes(2));
  expect(mockCombined.mock.calls[0][3]).toBe(mockCombined.mock.calls[1][3]);
  await chooseCombination(screen);
  await waitFor(() => expect(mockCombined).toHaveBeenCalledTimes(3));
  expect(mockCombined.mock.calls[2][3]).toBe(mockCombined.mock.calls[1][3]);
});
it('offers standalone transcription without analysis, and preserves 900 local exact-match behavior', async () => {
  const screen = await render(<Harness />);
  await act(() => fireEvent.press(screen.getByLabelText('转写')));
  await act(() => fireEvent.press(screen.getByText('仅转写')));
  await waitFor(() => expect(mockTranscribe).toHaveBeenCalledTimes(1));
  expect(mockCombined).not.toHaveBeenCalled(); await screen.unmount();
  const exact = await render(<Harness kind="exact-match" />);
  await act(() => fireEvent.press(exact.getByLabelText('转写')));
  await waitFor(() => expect(mockTranscribe).toHaveBeenCalledTimes(2));
  expect(exact.queryByText('转写并分析')).toBeNull();
  await act(() => fireEvent.press(exact.getByLabelText('分析表达')));
  await waitFor(() => expect(exact.getByTestId('study-workbench-ai-explanation')).toBeTruthy());
  expect(mockReview).not.toHaveBeenCalled();
});
it('shows both processing destinations before combined upload and honours cancellation', async () => {
  mockHasConsent.mockResolvedValue(false); const screen = await render(<Harness />);
  await chooseCombination(screen);
  await waitFor(() => expect(screen.getByText(/转写后的文本会发送至/)).toBeTruthy());
  expect(mockCombined).not.toHaveBeenCalled();
  await act(() => fireEvent.press(screen.getByText('暂不使用')));
  expect(mockAcceptConsent).not.toHaveBeenCalled(); expect(mockCombined).not.toHaveBeenCalled();
  await chooseCombination(screen);
  await waitFor(() => expect(screen.getByText('同意并继续')).toBeTruthy());
  await act(() => fireEvent.press(screen.getByText('同意并继续')));
  await waitFor(() => expect(mockCombined).toHaveBeenCalledTimes(1));
  expect(mockAcceptConsent).toHaveBeenCalledTimes(1);
});
it('quota failure has an accurate local explanation without redundant retry or diagnostic buttons', async () => {
  mockCombined.mockRejectedValueOnce(new AiOperationFailure('polish', 'authorization', 'insufficient_ai_points', 'D-1', false, 'none', '本周期 AI 额度不足，将于9月15日恢复。', 402));
  const screen = await render(<Harness />); await chooseCombination(screen);
  await waitFor(() => expect(screen.getByText('本周期 AI 额度不足，将于9月15日恢复。')).toBeTruthy());
  expect(screen.queryByTestId('study-workbench-ai-retry')).toBeNull();
  expect(screen.queryByLabelText('提交 AI 诊断')).toBeNull(); expect(mockAnswer).not.toHaveBeenCalled();
});
it('does not deliver a late result into another question and gives a new recording a new task id', async () => {
  let resolve!: (value: unknown) => void;
  mockCombined.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
  const screen = await render(<Harness />); await chooseCombination(screen);
  await waitFor(() => expect(mockCombined).toHaveBeenCalledTimes(1));
  await screen.rerender(<Harness card="q2" recording="file:///two.m4a" />);
  await act(() => resolve({ transcript: 'Old private response', review }));
  expect(mockAnswer).not.toHaveBeenCalled();
  await chooseCombination(screen); await waitFor(() => expect(mockCombined).toHaveBeenCalledTimes(2));
  expect(mockCombined.mock.calls[0][3]).not.toBe(mockCombined.mock.calls[1][3]);
});

it('does not send or consume AI when the current learning checkpoint cannot be saved', async () => {
  mockCheckpoint.mockRejectedValueOnce(new Error('checkpoint_failed'));
  const screen = await render(<Harness />); await chooseCombination(screen);
  await waitFor(() => expect(screen.getByTestId('study-workbench-ai-retry')).toBeTruthy());
  expect(mockCheckpoint).toHaveBeenCalledTimes(1); expect(mockCombined).not.toHaveBeenCalled(); expect(mockAnswer).not.toHaveBeenCalled();
});

it('cancels a pending AI request without showing a false failure or replacing the answer', async () => {
  mockCombined.mockImplementationOnce((_uri, _input, signal: AbortSignal) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('ai_cancelled')), { once: true });
  }));
  const screen = await render(<Harness />); await chooseCombination(screen);
  await waitFor(() => expect(mockCombined).toHaveBeenCalledTimes(1));
  await act(() => fireEvent.press(screen.getByLabelText('取消当前 AI 操作')));
  await waitFor(() => expect(screen.queryByLabelText('取消当前 AI 操作')).toBeNull());
  expect(screen.queryByTestId('study-workbench-ai-retry')).toBeNull();
  expect(screen.queryByLabelText('提交 AI 诊断')).toBeNull(); expect(mockAnswer).not.toHaveBeenCalled();
});
it('does not start an old question request after its delayed checkpoint finishes on a new question', async () => {
  let resolve!: () => void;
  mockCheckpoint.mockImplementationOnce(() => new Promise<void>((done) => { resolve = done; }));
  const screen = await render(<Harness />); await chooseCombination(screen);
  await waitFor(() => expect(mockCheckpoint).toHaveBeenCalledTimes(1));
  await screen.rerender(<Harness card="q2" recording="file:///two.m4a" />);
  await act(() => resolve());
  expect(mockCombined).not.toHaveBeenCalled();
  await chooseCombination(screen); await waitFor(() => expect(mockCombined).toHaveBeenCalledTimes(1));
  expect(mockCombined.mock.calls[0][0]).toBe('file:///two.m4a');
});

const historicalFeedback: NonNullable<LearningRecord['aiResult']> = {
  questionId: 'original-q', itemId: 'q1', transcript: 'Earlier final answer.',
  rawTranscript: 'Earlier speech transcript.', analyzedTranscript: 'Earlier analyzed answer.',
  grammar: { correctedText: 'Earlier corrected answer.', issues: [] }, polishedText: 'Earlier polished answer.',
};

it('displays historical AI, raw and analyzed text without creating a record or marking browsing dirty', async () => {
  jest.useFakeTimers();
  try {
    const workbenchRef = createRef<StudyWorkbenchHandle>();
    const screen = await render(<Harness initialFeedback={historicalFeedback} workbenchRef={workbenchRef} />);
    expect(screen.getByText('Earlier corrected answer.')).toBeTruthy();
    expect(screen.getByText('Earlier polished answer.')).toBeTruthy();
    expect(screen.getByTestId('study-workbench-raw-transcript').props.children).toBe('Earlier speech transcript.');
    expect(screen.getByTestId('study-workbench-analyzed-transcript').props.children).toBe('Earlier analyzed answer.');
    await act(async () => { jest.advanceTimersByTime(1200); expect(await workbenchRef.current?.flushAutoSave()).toBe(true); });
    await screen.rerender(<Harness card="q2" workbenchRef={workbenchRef} />);
    expect(screen.queryByTestId('study-workbench-review-result')).toBeNull();
    await screen.rerender(<Harness initialFeedback={historicalFeedback} workbenchRef={workbenchRef} />);
    expect(screen.getByText('Earlier polished answer.')).toBeTruthy();
    await act(async () => { jest.advanceTimersByTime(1200); expect(await workbenchRef.current?.flushAutoSave()).toBe(true); });
    expect(mockSave).not.toHaveBeenCalled(); expect(mockPending).not.toHaveBeenCalled();
    expect(mockCheckpoint).not.toHaveBeenCalled(); expect(mockFeedback).not.toHaveBeenCalled();
    expect(mockAnswer).not.toHaveBeenCalled();
    await screen.unmount();
  } finally { jest.useRealTimers(); }
});

it('clears historical feedback on answer edits and does not rehydrate it when returning to the same card', async () => {
  const workbenchRef = createRef<StudyWorkbenchHandle>();
  const screen = await render(<Harness initialFeedback={historicalFeedback} workbenchRef={workbenchRef} />);
  await act(() => fireEvent.press(screen.getByLabelText('编辑我的回答')));
  await act(() => fireEvent.changeText(screen.getByLabelText('我的回答'), 'My edited answer.'));
  expect(screen.queryByTestId('study-workbench-ai-region')).toBeNull();
  await act(async () => { expect(await workbenchRef.current?.flushAutoSave()).toBe(true); });
  expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 'study-1', aiResult: expect.objectContaining({
    transcript: 'My edited answer.', grammar: undefined, polishedText: undefined, analyzedTranscript: undefined, rawTranscript: undefined,
  }) }), expect.any(Object));
  const savedCount = mockSave.mock.calls.length;
  await screen.rerender(<Harness card="q2" workbenchRef={workbenchRef} />);
  await screen.rerender(<Harness initialFeedback={{ ...historicalFeedback }} workbenchRef={workbenchRef} />);
  expect(screen.getByLabelText('我的回答').props.value).toBe('My edited answer.');
  expect(screen.queryByTestId('study-workbench-ai-region')).toBeNull();
  await act(async () => { expect(await workbenchRef.current?.flushAutoSave()).toBe(true); });
  expect(mockSave).toHaveBeenCalledTimes(savedCount);
});

it('keeps new feedback across card navigation, assigns it to the new session and isolates subsequent sessions', async () => {
  const workbenchRef = createRef<StudyWorkbenchHandle>();
  const screen = await render(<Harness initialFeedback={historicalFeedback} sessionId="history-restudy-1" workbenchRef={workbenchRef} />);
  await chooseCombination(screen);
  await waitFor(() => expect(screen.getByText(review.polishedText)).toBeTruthy());
  expect(mockCheckpoint).toHaveBeenCalledTimes(1);
  expect(mockPending).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 'history-restudy-1', id: expect.stringContaining('ai-history-restudy-1-'), cardId: 'original-q' }), expect.any(String), expect.objectContaining({ accountId: 'account-a' }), undefined);
  expect(mockPending.mock.calls[0][0]).toEqual(expect.objectContaining({ feedbackCount: 0, aiResult: expect.objectContaining({ grammar: undefined, polishedText: undefined, rawTranscript: undefined, analyzedTranscript: undefined }) }));
  await act(async () => { expect(await workbenchRef.current?.flushAutoSave()).toBe(true); });
  const savedCount = mockSave.mock.calls.length;
  await screen.rerender(<Harness card="q2" sessionId="history-restudy-1" workbenchRef={workbenchRef} />);
  expect(screen.queryByTestId('study-workbench-ai-region')).toBeNull();
  await screen.rerender(<Harness initialFeedback={historicalFeedback} sessionId="history-restudy-1" workbenchRef={workbenchRef} />);
  expect(screen.getByText(review.polishedText)).toBeTruthy();
  expect(screen.queryByText('Earlier polished answer.')).toBeNull();
  await act(async () => { expect(await workbenchRef.current?.flushAutoSave()).toBe(true); });
  expect(mockSave).toHaveBeenCalledTimes(savedCount);
  await screen.rerender(<Harness initialFeedback={historicalFeedback} sessionId="history-restudy-2" workbenchRef={workbenchRef} />);
  expect(screen.getByText('Earlier polished answer.')).toBeTruthy();
  expect(screen.queryByText(review.polishedText)).toBeNull();
  await act(async () => { expect(await workbenchRef.current?.flushAutoSave()).toBe(true); });
  expect(mockSave).toHaveBeenCalledTimes(savedCount);
});

it('preserves older text-only issue details and does not invent a correction for polished-only feedback', async () => {
  const screen = await render(<Harness initialFeedback={{ ...historicalFeedback, grammar: { correctedText: 'Original correction.', issues: ['Legacy explanation.'] } }} />);
  expect(screen.getByText('Legacy explanation.')).toBeTruthy();
  expect(screen.getByText('Original correction.')).toBeTruthy();
  await screen.rerender(<Harness card="q2" initialFeedback={{ questionId: 'q2', transcript: 'Input.', polishedText: 'Polished only.' }} />);
  expect(screen.getByText('Polished only.')).toBeTruthy();
  expect(screen.queryByText('正确句子')).toBeNull();
  expect(mockSave).not.toHaveBeenCalled();
});

it('retains edited and newly generated feedback through the real collapsed-card unmount boundary', async () => {
  const feedbackCacheRef: { current: StudyWorkbenchFeedbackCache | undefined } = { current: undefined };
  const workbenchRef = createRef<StudyWorkbenchHandle>();
  const props = { initialFeedback: historicalFeedback, feedbackCacheRef, workbenchRef };
  const first = await render(<Harness {...props} />);
  await act(() => fireEvent.press(first.getByLabelText('编辑我的回答')));
  await act(() => fireEvent.changeText(first.getByLabelText('我的回答'), 'New answer.'));
  await act(async () => { expect(await workbenchRef.current?.flushAutoSave()).toBe(true); });
  await first.unmount();
  const reopened = await render(<Harness {...props} />);
  expect(reopened.queryByTestId('study-workbench-ai-region')).toBeNull();
  await chooseCombination(reopened);
  await waitFor(() => expect(reopened.getByText(review.polishedText)).toBeTruthy());
  await act(async () => { expect(await workbenchRef.current?.flushAutoSave()).toBe(true); });
  const savedCount = mockSave.mock.calls.length;
  await reopened.unmount();
  const final = await render(<Harness {...props} />);
  expect(final.getByText(review.polishedText)).toBeTruthy();
  expect(final.queryByText('Earlier polished answer.')).toBeNull();
  await act(async () => { expect(await workbenchRef.current?.flushAutoSave()).toBe(true); });
  expect(mockSave).toHaveBeenCalledTimes(savedCount);
});
