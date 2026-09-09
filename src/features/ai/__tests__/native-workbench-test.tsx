import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { useState } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import { StudyWorkbench } from '@/features/question-bank/components/StudyWorkbench.native';
import { AiOperationFailure } from '@/features/ai/ai-operation-failure.native';
import { ApiClientError } from '@/platform/api-client';
import type { StudyReviewKind } from '@/features/question-bank/types';
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
  savePendingAiOperation: async (_record: unknown, operationId: string) => ({ operationId, environment: 'sandbox', status: 'pending' }),
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
function Harness({ kind = 'opi-analysis', card = 'q1', recording = 'file:///one.m4a' }: { kind?: StudyReviewKind; card?: string; recording?: string }) {
  const [answer, setAnswer] = useState('My previous answer.');
  return <StudyWorkbench activeTab="mine" answerText={answer} bankId={kind === 'exact-match' ? 'sentences900' : 'opi'} bankTitle="OPI" cardKey={card}
    sourceCardId="original-q" categoryTitle="运行" topicTitle="飞行" questionText="Question" noteText="" referenceContent={null} referenceLabel="参考答案"
    reviewKind={kind} recordingUri={recording} sessionId="study-1" sessionStartedAt={new Date().toISOString()} tabs={['mine']}
    swipeGesture={Gesture.Pan().enabled(false)} learningStore={{ addRecord: mockSave }}
    onAnswerChange={(value) => { mockAnswer(value); setAnswer(value); }} onFeedback={mockFeedback} onBeforeAiOperation={mockCheckpoint}
    onNoteChange={jest.fn()} onRetrySave={jest.fn()} onEditingTabChange={jest.fn()} onTabChange={jest.fn()} />;
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
