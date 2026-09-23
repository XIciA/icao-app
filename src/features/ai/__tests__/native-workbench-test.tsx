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
const mockLookup = jest.fn();
const mockAuto = jest.fn(async () => false);
const mockPartial = jest.fn(async (...args: unknown[]) => ({ aiOperation: { operationId: args[1], environment: 'sandbox', status: 'complete' } }));
const mockSave = jest.fn(async (..._args: unknown[]) => undefined);
const mockFeedback = jest.fn();
const mockCheckpoint = jest.fn(async (): Promise<void> => undefined);
const mockAnswer = jest.fn();
const mockPush = jest.fn();
const mockPending = jest.fn(async (_record: unknown, operationId: string) => ({ operationId, environment: 'sandbox', status: 'pending' }));
let mockUuidSequence = 0;
jest.mock('@/features/ai/auto-transcription.native', () => ({ autoTranscriptionEnabled: () => mockAuto() }));
jest.mock('expo-crypto', () => ({ randomUUID: () => `operation-${++mockUuidSequence}` }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }), usePathname: () => '/question-bank/opi/categories/a/topics/b/study' }));
jest.mock('@/features/ai/ai-client.native', () => ({
  lookupAiOperation: (...args: unknown[]) => mockLookup(...args),
  hasAiConsent: () => mockHasConsent(), acceptAiConsent: () => mockAcceptConsent(),
  transcribeRecording: (...args: unknown[]) => mockTranscribe(...args),
  reviewExpression: (...args: unknown[]) => mockReview(...args),
  transcribeAndReviewRecording: (...args: unknown[]) => mockCombined(...args),
}));
jest.mock('@/features/ai/ai-operation-recovery.native', () => ({
  recoverPartialAiOperation: (...args: unknown[]) => mockPartial(...args),
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
function Harness({ kind = 'opi-analysis', card = 'q1', recording = 'file:///one.m4a', sessionId = 'study-1', initialAnswer = 'My previous answer.', token, initialFeedback, workbenchRef, feedbackCacheRef }: {
  initialAnswer?: string; token?: string;
  kind?: StudyReviewKind; card?: string; recording?: string; sessionId?: string;
  initialFeedback?: LearningRecord['aiResult']; workbenchRef?: Ref<StudyWorkbenchHandle>;
  feedbackCacheRef?: { current: StudyWorkbenchFeedbackCache | undefined };
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const answerKey = `${sessionId}:${card}`;
  const answer = answers[answerKey] ?? initialAnswer;
  const [editingTab, setEditingTab] = useState<'mine' | 'notes'>();
  return <StudyWorkbench activeTab="mine" answerText={answer} bankId={kind === 'exact-match' ? 'sentences900' : 'opi'} bankTitle="OPI" cardKey={card}
    sourceCardId="original-q" newRecordingToken={token} reviewSource={{ bankId: 'opi', categoryId: 'c', topicId: 't', version: 1, checksum: 'a'.repeat(64) }} categoryTitle="运行" topicTitle="飞行" questionText="Question" noteText="" referenceContent={null} referenceLabel="参考答案"
    reviewKind={kind} recordingUri={recording} sessionId={sessionId} sessionStartedAt={new Date().toISOString()} tabs={['mine']}
    initialFeedback={initialFeedback} feedbackCacheRef={feedbackCacheRef} ref={workbenchRef} editingTab={editingTab}
    swipeGesture={Gesture.Pan().enabled(false)} learningStore={{ addRecord: mockSave }}
    onAnswerChange={(value) => { mockAnswer(value); setAnswers((current) => ({ ...current, [answerKey]: value })); }} onFeedback={mockFeedback} onBeforeAiOperation={mockCheckpoint}
    onNoteChange={jest.fn()} onRetrySave={jest.fn()} onEditingTabChange={setEditingTab} onTabChange={jest.fn()} />;
}
beforeEach(() => {
  jest.clearAllMocks(); mockHasConsent.mockResolvedValue(true); mockAuto.mockResolvedValue(false); mockLookup.mockResolvedValue({ state: 'missing' });
  mockCombined.mockResolvedValue({ transcript: 'We are ready.', review, aiPoints: { charged: 10, remaining: 90 } });
  mockTranscribe.mockResolvedValue({ transcript: 'Standalone transcript.' });
  mockReview.mockResolvedValue(review);
});

async function score(screen: Awaited<ReturnType<typeof render>>) { await act(() => fireEvent.press(screen.getByLabelText('AI评分'))); }
it('defaults to no upload and two actions, then combines transcription and analysis for an empty answer', async () => {
  const screen = await render(<Harness initialAnswer="" token="fresh1" />);
  expect(mockCombined).not.toHaveBeenCalled(); expect(mockTranscribe).not.toHaveBeenCalled();
  expect(screen.queryByLabelText('转写')).toBeNull();
  expect(screen.getByLabelText('编辑我的回答').props.accessibilityState.disabled).toBe(true);
  await score(screen);
  await waitFor(() => expect(mockCombined).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(screen.getAllByText('We are ready.').length).toBeGreaterThan(0));
  expect(mockAcceptConsent).not.toHaveBeenCalled(); expect(mockReview).not.toHaveBeenCalled();
});
it('analyzes current editable text, never overwrites it with another transcription', async () => {
  const screen = await render(<Harness />);
  await fireEvent.press(screen.getByLabelText('编辑我的回答'));
  await fireEvent.changeText(screen.getByLabelText('我的回答'), 'Edited answer.');
  await fireEvent(screen.getByLabelText('我的回答'), 'blur');
  await score(screen);
  await waitFor(() => expect(mockReview).toHaveBeenCalledWith(expect.objectContaining({ transcript: 'Edited answer.', analysisVersion: 2 }), expect.any(AbortSignal), expect.any(String)));
  expect(mockCombined).not.toHaveBeenCalled(); expect(mockTranscribe).not.toHaveBeenCalled();
});
it('auto-transcribes only a fresh recording and waits for the same operation before requested review', async () => {
  mockAuto.mockResolvedValue(true);
  let resolve!: (value: { transcript: string }) => void;
  mockTranscribe.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
  const cache = { current: undefined as StudyWorkbenchFeedbackCache | undefined };
  const screen = await render(<Harness initialAnswer="" token="fresh2" feedbackCacheRef={cache} />);
  await waitFor(() => expect(mockTranscribe).toHaveBeenCalledTimes(1));
  await score(screen); await score(screen);
  expect(mockCombined).not.toHaveBeenCalled(); expect(mockReview).not.toHaveBeenCalled();
  await act(() => resolve({ transcript: 'New response.' }));
  await waitFor(() => expect(mockReview).toHaveBeenCalledTimes(1));
  expect(mockReview).toHaveBeenCalledWith(expect.objectContaining({ transcript: 'New response.' }), expect.any(AbortSignal), expect.any(String));
  await screen.unmount();
  const second = await render(<Harness initialAnswer="New response." token="fresh2" feedbackCacheRef={cache} />);
  expect(mockTranscribe).toHaveBeenCalledTimes(1);
  await second.unmount();
});
it('does not upload restored recordings merely because auto mode is enabled', async () => {
  mockAuto.mockResolvedValue(true);
  const screen = await render(<Harness initialAnswer="" />);
  expect(mockTranscribe).not.toHaveBeenCalled();
  await screen.unmount();
});
it('requires first manual consent, and cancellation retains the recording without a cloud request', async () => {
  mockHasConsent.mockResolvedValue(false);
  const screen = await render(<Harness initialAnswer="" />);
  await score(screen);
  await waitFor(() => expect(screen.getByLabelText('AI 数据处理提示')).toBeTruthy());
  expect(mockCombined).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText('暂不使用'));
  expect(mockAcceptConsent).not.toHaveBeenCalled(); expect(mockCombined).not.toHaveBeenCalled();
});
it('does not silently reacquire consent during automatic transcription after revocation', async () => {
  mockHasConsent.mockResolvedValue(false); mockAuto.mockResolvedValue(true);
  const screen = await render(<Harness initialAnswer="" token="fresh3" />);
  await waitFor(() => expect(screen.getByText(/同意已撤回/)).toBeTruthy());
  expect(mockTranscribe).not.toHaveBeenCalled(); expect(mockAcceptConsent).not.toHaveBeenCalled();
});
it('keeps 900 comparison local, including when transcription is needed first', async () => {
  const screen = await render(<Harness kind="exact-match" initialAnswer="" />);
  await score(screen);
  await waitFor(() => expect(screen.getByText(/缺失 .*多余/)).toBeTruthy());
  expect(mockTranscribe).toHaveBeenCalledTimes(1); expect(mockReview).not.toHaveBeenCalled(); expect(mockCombined).not.toHaveBeenCalled();
});
it('recovers intermediate transcription and resumes without uploading twice', async () => {
  mockCombined.mockRejectedValueOnce(new ApiClientError('ai_timeout', 503));
  mockLookup.mockResolvedValue({ state: 'released', partialTranscription: { transcript: 'Recovered words.', rawTranscript: 'Recovered words.', input: {} } });
  const screen = await render(<Harness initialAnswer="" />);
  await score(screen);
  await waitFor(() => expect(mockAnswer).toHaveBeenCalledWith('Recovered words.'));
  expect(mockPartial).toHaveBeenCalledTimes(1);
  await score(screen);
  await waitFor(() => expect(mockReview).toHaveBeenCalledWith(expect.objectContaining({ transcript: 'Recovered words.', resumeOperationId: expect.any(String) }), expect.any(AbortSignal), expect.any(String)));
  expect(mockCombined).toHaveBeenCalledTimes(1);
});
it('queries uncertain operations before retry and does not duplicate a pending provider task', async () => {
  mockReview.mockRejectedValueOnce(new Error('network_error'));
  const screen = await render(<Harness />); await score(screen);
  await waitFor(() => expect(screen.getByTestId('study-workbench-ai-retry')).toBeTruthy());
  mockLookup.mockResolvedValue({ state: 'pending' });
  await score(screen);
  await waitFor(() => expect(screen.getByText(/上一项 AI 任务/)).toBeTruthy());
  expect(mockReview).toHaveBeenCalledTimes(1);
});
it('does not deliver a late result into another card or send an old delayed checkpoint', async () => {
  let release!: () => void;
  mockCheckpoint.mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; }));
  const screen = await render(<Harness />); await score(screen);
  await waitFor(() => expect(mockCheckpoint).toHaveBeenCalledTimes(1));
  await screen.rerender(<Harness card="q2" />);
  await act(() => release()); expect(mockReview).not.toHaveBeenCalled();
});
it('cancels a pending operation without rendering a false failure', async () => {
  mockReview.mockImplementationOnce((_input, signal: AbortSignal) => new Promise((_resolve, reject) => { signal.addEventListener('abort', () => reject(new Error('request_aborted'))); }));
  const screen = await render(<Harness />); await score(screen);
  await waitFor(() => expect(mockReview).toHaveBeenCalledTimes(1));
  await fireEvent.press(screen.getByLabelText('取消当前 AI 操作'));
  await waitFor(() => expect(screen.queryByLabelText('取消当前 AI 操作')).toBeNull());
  expect(screen.queryByTestId('study-workbench-ai-retry')).toBeNull();
});
it('does not spend quota before the learning checkpoint is saved', async () => {
  mockCheckpoint.mockRejectedValueOnce(new Error('learning_save_failed'));
  const screen = await render(<Harness />); await score(screen);
  await waitFor(() => expect(screen.getByText(/本次学习暂未保存/)).toBeTruthy());
  expect(mockReview).not.toHaveBeenCalled();
});
it('quota failure keeps existing answer and has no misleading retry action', async () => {
  mockReview.mockRejectedValueOnce(new AiOperationFailure('polish', 'authorization', 'insufficient_ai_points', 'A-TEST-00', false, 'none', '额度不足', 403));
  const screen = await render(<Harness />); await score(screen);
  await waitFor(() => expect(screen.getByText('额度不足')).toBeTruthy());
  expect(screen.queryByTestId('study-workbench-ai-retry')).toBeNull(); expect(mockAnswer).not.toHaveBeenCalled();
});
it('renders structured categories and hides all empty issue sections', async () => {
  mockReview.mockResolvedValueOnce({ ...review, analysis: { module: 'opi', offTopic: null, grammarErrors: [], polishedText: 'Clear response.' } });
  const screen = await render(<Harness />); await score(screen);
  await waitFor(() => expect(screen.getByText('分析完成，未发现上述问题。')).toBeTruthy());
  expect(screen.queryByText('语法错误')).toBeNull(); expect(screen.queryByText('偏离题目要求')).toBeNull(); expect(screen.getByText('Clear response.')).toBeTruthy();
});
it('allows flushing and preserves category feedback through collapse without reprocessing', async () => {
  const ref = createRef<StudyWorkbenchHandle>(); const cache = { current: undefined as StudyWorkbenchFeedbackCache | undefined };
  const screen = await render(<Harness workbenchRef={ref} feedbackCacheRef={cache} />); await score(screen);
  await waitFor(() => expect(screen.getByText('We are ready to depart.')).toBeTruthy());
  await act(() => ref.current!.flushAutoSave()); await screen.unmount();
  const remounted = await render(<Harness workbenchRef={ref} feedbackCacheRef={cache} />);
  expect(remounted.getByText('We are ready to depart.')).toBeTruthy(); expect(mockReview).toHaveBeenCalledTimes(1);
});
