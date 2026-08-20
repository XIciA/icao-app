import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { createRef, useState } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';

import { reviewExpression } from '@/features/ai/ai-client';
import { colors } from '@/theme';

import { StudyWorkbench, type StudyWorkbenchHandle } from '../components/StudyWorkbench';

jest.mock('@/features/ai/ai-client', () => ({
  acceptAiConsent: jest.fn(async () => undefined),
  hasAiConsent: jest.fn(async () => true),
  reviewExpression: jest.fn(),
  transcribeRecording: jest.fn(),
}));

jest.mock('lucide-react-native', () => {
  const { View } = jest.requireActual('react-native');
  const Icon = (props: object) => <View {...props} />;
  return { BookOpenCheck: Icon, Check: Icon, Eraser: Icon, MessageSquareText: Icon, Mic: Icon, NotebookPen: Icon, Pencil: Icon, Save: Icon, Sparkles: Icon };
});

const mockReviewExpression = jest.mocked(reviewExpression);

const baseProps = {
  answerText: '',
  bankId: 'opi' as const,
  bankTitle: 'OPI',
  cardKey: 'opi-card-1',
  categoryTitle: '运行',
  learningStore: { addRecord: jest.fn(async () => undefined) },
  noteText: '',
  onAnswerChange: jest.fn(),
  onEditingTabChange: jest.fn(),
  onFeedback: jest.fn(),
  onNoteChange: jest.fn(),
  onRetrySave: jest.fn(),
  onTabChange: jest.fn(),
  questionText: 'Question',
  referenceContent: null,
  referenceLabel: '参考答案',
  reviewKind: 'opi-analysis' as const,
  sessionId: 'study-test-session',
  sessionStartedAt: '2026-07-15T00:00:00.000Z',
  swipeGesture: Gesture.Pan().enabled(false),
  topicTitle: '燃油',
};

describe('study workbench natural layout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('grows the answer input with its content without creating a nested scroll view', async () => {
    const screen = await render(<StudyWorkbench {...baseProps} activeTab="mine" editingTab="mine" tabs={['mine']} />);
    const input = screen.getByLabelText('我的回答');

    expect(screen.getByTestId('study-workbench-content').props.scrollEnabled).toBeUndefined();
    expect(input.props.scrollEnabled).toBe(false);

    fireEvent(input, 'contentSizeChange', { nativeEvent: { contentSize: { height: 184, width: 280 } } });

    await waitFor(() => expect(StyleSheet.flatten(screen.getByLabelText('我的回答').props.style).height).toBe(184));
  });

  it('grows the notes input with its content without creating a nested scroll view', async () => {
    const screen = await render(<StudyWorkbench {...baseProps} activeTab="notes" editingTab="notes" tabs={['notes']} />);
    const input = screen.getByLabelText('我的笔记');

    expect(screen.getByTestId('study-workbench-content').props.scrollEnabled).toBeUndefined();
    expect(input.props.scrollEnabled).toBe(false);

    fireEvent(input, 'contentSizeChange', { nativeEvent: { contentSize: { height: 156, width: 280 } } });

    await waitFor(() => expect(StyleSheet.flatten(screen.getByLabelText('我的笔记').props.style).height).toBe(156));
  });

  it('keeps answer content read-only until the explicit edit action is pressed', async () => {
    const onEditingTabChange = jest.fn();
    const screen = await render(<StudyWorkbench {...baseProps} activeTab="mine" onEditingTabChange={onEditingTabChange} tabs={['mine', 'notes']} />);

    expect(screen.queryByLabelText('我的回答')).toBeNull();
    expect(screen.getByLabelText('我的回答内容')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('编辑我的回答'));
    expect(onEditingTabChange).toHaveBeenCalledWith('mine');
  });

  it('keeps note content read-only until the explicit edit action is pressed', async () => {
    const onEditingTabChange = jest.fn();
    const screen = await render(<StudyWorkbench {...baseProps} activeTab="notes" onEditingTabChange={onEditingTabChange} tabs={['mine', 'notes']} />);
    expect(screen.queryByLabelText('我的笔记')).toBeNull();
    expect(screen.getByLabelText('我的笔记内容')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('编辑我的笔记'));
    expect(onEditingTabChange).toHaveBeenCalledWith('notes');
  });

  it('uses the approved icon and title for each reusable console section', async () => {
    const answerScreen = await render(<StudyWorkbench {...baseProps} activeTab="mine" tabs={['mine', 'reference', 'notes']} />);
    expect(answerScreen.getByText('我的回答')).toBeTruthy();
    expect(answerScreen.getByTestId('study-workbench-title-icon-mine')).toBeTruthy();
    await answerScreen.unmount();

    const referenceScreen = await render(<StudyWorkbench {...baseProps} activeTab="reference" tabs={['mine', 'reference', 'notes']} />);
    expect(referenceScreen.getByText('参考答案')).toBeTruthy();
    expect(referenceScreen.getByTestId('study-workbench-title-icon-reference')).toBeTruthy();
    await referenceScreen.unmount();

    const noteScreen = await render(<StudyWorkbench {...baseProps} activeTab="notes" tabs={['mine', 'reference', 'notes']} />);
    expect(noteScreen.getByText('我的笔记')).toBeTruthy();
    expect(noteScreen.getByTestId('study-workbench-title-icon-notes')).toBeTruthy();
  });

  it('removes nested surfaces from read-only answer and note content', async () => {
    const answerScreen = await render(<StudyWorkbench {...baseProps} activeTab="mine" tabs={['mine', 'notes']} />);
    expect(StyleSheet.flatten(answerScreen.getByLabelText('我的回答内容').props.style)).toMatchObject({
      backgroundColor: 'transparent',
      borderRadius: 0,
      borderWidth: 0,
    });
    await answerScreen.unmount();

    const noteScreen = await render(<StudyWorkbench {...baseProps} activeTab="notes" tabs={['mine', 'notes']} />);
    expect(StyleSheet.flatten(noteScreen.getByLabelText('我的笔记内容').props.style)).toMatchObject({
      backgroundColor: 'transparent',
      borderRadius: 0,
      borderWidth: 0,
    });
  });

  it('keeps answer and note editing transparent without introducing a nested surface', async () => {
    const answerScreen = await render(<StudyWorkbench {...baseProps} activeTab="mine" editingTab="mine" tabs={['mine', 'notes']} />);
    expect(StyleSheet.flatten(answerScreen.getByLabelText('我的回答').props.style)).toMatchObject({
      backgroundColor: 'transparent',
      borderRadius: 0,
      borderWidth: 0,
    });
    await answerScreen.unmount();

    const noteScreen = await render(<StudyWorkbench {...baseProps} activeTab="notes" editingTab="notes" tabs={['mine', 'notes']} />);
    expect(StyleSheet.flatten(noteScreen.getByLabelText('我的笔记').props.style)).toMatchObject({
      backgroundColor: 'transparent',
      borderRadius: 0,
      borderWidth: 0,
    });
  });

  it('keeps review and edit actions together in the top-right header', async () => {
    const screen = await render(<StudyWorkbench {...baseProps} activeTab="mine" answerText="ready for analysis" tabs={['mine', 'reference', 'notes']} />);
    const header = within(screen.getByTestId('study-workbench-header'));
    const reviewAction = header.getByLabelText('分析表达');
    const editAction = header.getByLabelText('编辑我的回答');

    expect(reviewAction.props.accessibilityState).toEqual({ disabled: false });
    expect(StyleSheet.flatten(screen.getByTestId('study-workbench-review-action').props.style)).toMatchObject({
      backgroundColor: 'transparent',
      borderColor: colors.primary20,
      borderRadius: 999,
      minHeight: 36,
    });
    expect(StyleSheet.flatten(screen.getByTestId('study-workbench-primary-action').props.style)).toMatchObject({
      backgroundColor: 'transparent',
      borderColor: colors.primary20,
      borderRadius: 999,
      borderWidth: 1,
      minHeight: 36,
    });
    expect(editAction).toBeTruthy();
    expect(within(screen.getByTestId('study-workbench-footer')).queryByLabelText('分析表达')).toBeNull();
    expect(within(screen.getByTestId('study-workbench-footer')).queryByLabelText('编辑我的回答')).toBeNull();
  });

  it('keeps review visible but disabled for an empty or actively edited answer', async () => {
    const emptyScreen = await render(<StudyWorkbench {...baseProps} activeTab="mine" tabs={['mine', 'notes']} />);
    expect(emptyScreen.getByLabelText('分析表达').props.accessibilityState).toEqual({ disabled: true });
    await emptyScreen.unmount();

    const editingScreen = await render(<StudyWorkbench {...baseProps} activeTab="mine" answerText="draft" editingTab="mine" tabs={['mine', 'notes']} />);
    expect(editingScreen.getByLabelText('分析表达').props.accessibilityState).toEqual({ disabled: true });
    expect(editingScreen.getByLabelText('完成我的回答')).toBeTruthy();
  });

  it('keeps the notes header limited to the edit action', async () => {
    const screen = await render(<StudyWorkbench {...baseProps} activeTab="notes" tabs={['mine', 'notes']} />);
    expect(within(screen.getByTestId('study-workbench-header')).getByLabelText('编辑我的笔记')).toBeTruthy();
    expect(within(screen.getByTestId('study-workbench-header')).queryByLabelText('分析表达')).toBeNull();
  });

  it('uses instructional empty states without rendering an AI placeholder', async () => {
    const answerScreen = await render(<StudyWorkbench {...baseProps} activeTab="mine" tabs={['mine', 'notes']} />);
    expect(answerScreen.getByText('录音或编辑后，回答会显示在这里')).toBeTruthy();
    expect(answerScreen.queryByText('暂无回答')).toBeNull();
    expect(answerScreen.queryByTestId('study-workbench-ai-region')).toBeNull();
    await answerScreen.unmount();

    const noteScreen = await render(<StudyWorkbench {...baseProps} activeTab="notes" tabs={['mine', 'notes']} />);
    expect(noteScreen.getByText('记录这道题的关键词、易错点或复盘想法')).toBeTruthy();
    expect(noteScreen.queryByText('暂无笔记')).toBeNull();
  });

  it('removes transcription-only copy from the web answer empty state', async () => {
    const originalPlatform = Platform.OS;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
    try {
      const screen = await render(<StudyWorkbench {...baseProps} activeTab="mine" recordingUri="blob:test-recording" tabs={['mine', 'notes']} />);
      expect(screen.getByText('回答会显示在这里')).toBeTruthy();
      expect(screen.queryByText('录音或编辑后，回答会显示在这里')).toBeNull();
      expect(screen.queryByText('录音仅用于本次转写。')).toBeNull();
    } finally {
      Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform });
    }
  });

  it('shows the correct original and exact-match summary in one flat blue AI region', async () => {
    const screen = await render(<StudyWorkbench {...baseProps} activeTab="mine" answerText="Different answer" questionText="The correct original." reviewKind="exact-match" tabs={['mine', 'notes']} />);

    await act(async () => { fireEvent.press(screen.getByLabelText('分析表达')); });

    await waitFor(() => expect(screen.getByTestId('study-workbench-ai-primary').props.children).toBe('The correct original.'));
    const regionStyle = StyleSheet.flatten(screen.getByTestId('study-workbench-ai-region').props.style);
    expect(regionStyle).toMatchObject({ backgroundColor: colors.primary06, borderRadius: 0, borderWidth: 0, width: '100%' });
    expect(screen.getAllByTestId('study-workbench-ai-region')).toHaveLength(1);
    expect(screen.getByTestId('study-workbench-ai-explanation').props.children).toContain('发现差异');
    expect(StyleSheet.flatten(screen.getByTestId('study-workbench-ai-divider').props.style).backgroundColor).toBe(colors.primary20);
    expect(screen.queryByText('正确原文')).toBeNull();
    expect(screen.queryByText('语法反馈')).toBeNull();
    expect(screen.queryByText('修改后表达')).toBeNull();
    expect(screen.queryByText('更自然的民航口语表达')).toBeNull();
  });

  it('renders the complete grammar correction structure', async () => {
    mockReviewExpression.mockResolvedValueOnce({
      grammar: {
        correctedText: 'The crew should request an amended heading.',
        issues: [{ before: 'crew request', after: 'crew should request', reasonZh: '情态表达需要补充 should。' }],
      },
      promptVersion: 'deepseek-review:v1',
    });
    const screen = await render(<StudyWorkbench {...baseProps} activeTab="mine" answerText="The crew request new heading." reviewKind="grammar" tabs={['mine', 'notes']} />);

    await act(async () => { fireEvent.press(screen.getByLabelText('分析表达')); });

    await waitFor(() => expect(screen.getByText('语法纠错')).toBeTruthy());
    expect(screen.getByText('1. crew request → crew should request')).toBeTruthy();
    expect(screen.getByText('情态表达需要补充 should。')).toBeTruthy();
    expect(screen.getByText('正确句子')).toBeTruthy();
    expect(screen.getByText('The crew should request an amended heading.')).toBeTruthy();
    expect(screen.getAllByTestId('study-workbench-ai-region')).toHaveLength(1);
  });

  it('renders grammar and polished OPI output from one review call', async () => {
    mockReviewExpression.mockResolvedValueOnce({
      grammar: {
        correctedText: 'The corrected grammar output.',
        issues: [{ before: 'draft answer', after: 'corrected answer', reasonZh: '修正明确语法错误。' }],
      },
      polishedText: 'The polished OPI output.',
      promptVersion: 'deepseek-review:v1',
    });
    const screen = await render(<StudyWorkbench {...baseProps} activeTab="mine" answerText="My draft answer." tabs={['mine', 'reference', 'notes']} />);

    await act(async () => { fireEvent.press(screen.getByLabelText('分析表达')); });

    await waitFor(() => expect(screen.getByText('The polished OPI output.')).toBeTruthy());
    expect(screen.getByText('The corrected grammar output.')).toBeTruthy();
    expect(screen.getByText('润色后的表达')).toBeTruthy();
    expect(mockReviewExpression).toHaveBeenCalledTimes(1);
    expect(screen.getAllByTestId('study-workbench-ai-region')).toHaveLength(1);
  });

  it('keeps analysis progress and retryable errors inside the same blue region', async () => {
    let rejectReview!: (reason: Error) => void;
    mockReviewExpression.mockImplementationOnce(() => new Promise((_, reject) => { rejectReview = reject; }));
    const screen = await render(<StudyWorkbench {...baseProps} activeTab="mine" answerText="Answer ready for review." reviewKind="grammar" tabs={['mine', 'notes']} />);

    await act(async () => { fireEvent.press(screen.getByLabelText('分析表达')); });
    await waitFor(() => expect(screen.getByText('正在分析表达…')).toBeTruthy());
    expect(screen.getAllByTestId('study-workbench-ai-region')).toHaveLength(1);

    await act(async () => { rejectReview(new Error('offline')); });
    await waitFor(() => expect(screen.getByText(/AI 请求失败，请检查网络后重试。.*A-/u)).toBeTruthy());
    expect(screen.getByLabelText('重试分析表达')).toBeTruthy();
    expect(screen.getAllByTestId('study-workbench-ai-region')).toHaveLength(1);

    mockReviewExpression.mockResolvedValueOnce({ grammar: { correctedText: 'Retry succeeded.', issues: [] }, promptVersion: 'deepseek-review:v1' });
    await act(async () => { fireEvent.press(screen.getByLabelText('重试分析表达')); });
    await waitFor(() => expect(screen.getByText('Retry succeeded.')).toBeTruthy());
    expect(screen.queryByText(/AI 请求失败，请检查网络后重试。/u)).toBeNull();
    expect(screen.getByText('未发现明确语法问题。')).toBeTruthy();
  });

  it('keeps the previous successful AI result visible when a later retry fails', async () => {
    mockReviewExpression.mockResolvedValueOnce({
      grammar: { correctedText: 'Previous validated result.', issues: [] },
      promptVersion: 'deepseek-review:v1',
    });
    const screen = await render(<StudyWorkbench {...baseProps} activeTab="mine" answerText="Answer ready for review." reviewKind="grammar" tabs={['mine', 'notes']} />);

    await act(async () => { fireEvent.press(screen.getByLabelText('分析表达')); });
    await waitFor(() => expect(screen.getByText('Previous validated result.')).toBeTruthy());

    mockReviewExpression.mockRejectedValueOnce(new Error('offline'));
    await act(async () => { fireEvent.press(screen.getByLabelText('分析表达')); });
    await waitFor(() => expect(screen.getByText(/AI 请求失败，请检查网络后重试。.*A-/u)).toBeTruthy());
    expect(screen.getByText('Previous validated result.')).toBeTruthy();
  });

  it('uses compact dots for multi-section navigation and keeps the active state accessible', async () => {
    const onTabChange = jest.fn();
    const screen = await render(<StudyWorkbench {...baseProps} activeTab="mine" onTabChange={onTabChange} tabs={['mine', 'reference', 'notes']} />);

    expect(screen.getByTestId('study-workbench-tab-mine').props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByTestId('study-workbench-tab-reference').props.accessibilityState).toEqual({ selected: false });
    expect(screen.getByTestId('study-workbench-tab-notes').props.accessibilityState).toEqual({ selected: false });
    expect(screen.getByTestId('study-workbench-tab-reference').props.hitSlop).toBe(8);
    expect(StyleSheet.flatten(screen.getByLabelText('学习控制台栏目').props.style)).toMatchObject({ backgroundColor: 'transparent', borderWidth: 0 });
    expect(StyleSheet.flatten(screen.getByTestId('study-workbench-tab-mine').props.style)).toMatchObject({ height: 28, width: 18 });
    expect(StyleSheet.flatten(screen.getByTestId('study-workbench-tab-indicator-mine').props.style)).toMatchObject({ height: 4, width: 10 });
    expect(StyleSheet.flatten(screen.getByTestId('study-workbench-tab-indicator-reference').props.style)).toMatchObject({ height: 4, width: 4 });

    fireEvent.press(screen.getByLabelText('切换到参考答案'));
    expect(onTabChange).toHaveBeenCalledWith('reference');
  });

  it('keeps the compact accessible pagination for a two-section console', async () => {
    const screen = await render(<StudyWorkbench {...baseProps} activeTab="mine" tabs={['mine', 'notes']} />);
    expect(screen.getByTestId('study-workbench-tab-mine')).toBeTruthy();
    expect(screen.getByTestId('study-workbench-tab-notes')).toBeTruthy();
    expect(screen.queryByTestId('study-workbench-tab-reference')).toBeNull();
    expect(screen.getByTestId('study-workbench-tab-notes').props.hitSlop).toBe(8);
    expect(StyleSheet.flatten(screen.getByTestId('study-workbench-tab-notes').props.style)).toMatchObject({ width: 18 });
  });

  it('hides dots for a single section and removes the old manual controls', async () => {
    const screen = await render(<StudyWorkbench {...baseProps} activeTab="mine" tabs={['mine']} />);

    expect(screen.queryByLabelText('学习控制台栏目')).toBeNull();
    expect(screen.queryByText('清空')).toBeNull();
    expect(screen.queryByText('保存到学习记录')).toBeNull();
    expect(screen.queryByText(/只有点击“保存到学习记录”/)).toBeNull();
  });

  it('serializes concurrent flushes and saves an intentionally cleared answer', async () => {
    const addRecord = jest.fn(async () => undefined);
    const learningStore = { addRecord };
    const ref = createRef<StudyWorkbenchHandle>();
    function Harness() {
      const [answerText, setAnswerText] = useState('initial answer');
      return <StudyWorkbench {...baseProps} ref={ref} activeTab="mine" answerText={answerText} editingTab="mine" learningStore={learningStore} onAnswerChange={setAnswerText} tabs={['mine']} />;
    }
    const screen = await render(<Harness />);

    fireEvent.changeText(screen.getByLabelText('我的回答'), 'updated answer');
    await waitFor(() => expect(screen.getByLabelText('我的回答').props.value).toBe('updated answer'));
    let firstResult: boolean | undefined;
    await act(async () => { firstResult = await ref.current?.flushAutoSave(); });
    expect(firstResult).toBe(true);
    await waitFor(() => expect(addRecord).toHaveBeenCalledTimes(1));
    fireEvent.changeText(screen.getByLabelText('我的回答'), '');
    await waitFor(() => expect(screen.getByLabelText('我的回答').props.value).toBe(''));
    let results: (boolean | undefined)[] = [];
    await act(async () => { results = await Promise.all([ref.current?.flushAutoSave(), ref.current?.flushAutoSave()]); });
    expect(results).toEqual([true, true]);
    await waitFor(() => expect(addRecord).toHaveBeenCalledTimes(2));

    expect(addRecord).toHaveBeenCalledTimes(2);
    expect(addRecord).toHaveBeenLastCalledWith(expect.objectContaining({
      aiResult: expect.objectContaining({ transcript: '' }),
    }));
  });

  it('keeps a package item identity separate from the original question id in saved AI results', async () => {
    const addRecord = jest.fn(async () => undefined);
    const ref = createRef<StudyWorkbenchHandle>();
    function Harness() {
      const [answerText, setAnswerText] = useState('');
      return <StudyWorkbench {...baseProps} ref={ref} activeTab="mine" answerText={answerText} cardKey="mock-item-17" editingTab="mine" learningStore={{ addRecord }} onAnswerChange={setAnswerText} sourceCardId="opi-original-card-17" tabs={['mine']} />;
    }
    const screen = await render(<Harness />);

    fireEvent.changeText(screen.getByLabelText('我的回答'), 'package answer');
    await waitFor(() => expect(screen.getByLabelText('我的回答').props.value).toBe('package answer'));
    let saved: boolean | undefined;
    await act(async () => { saved = await ref.current?.flushAutoSave(); });

    expect(saved).toBe(true);
    expect(addRecord).toHaveBeenCalledWith(expect.objectContaining({
      cardId: 'opi-original-card-17',
      aiResult: expect.objectContaining({ questionId: 'opi-original-card-17' }),
    }));
    await screen.unmount();
  });

  it('keeps flushing when a newer answer arrives during the active write', async () => {
    let releaseFirstWrite!: () => void;
    let signalFirstWrite!: () => void;
    const firstWriteStarted = new Promise<void>((resolve) => { signalFirstWrite = resolve; });
    const firstWriteGate = new Promise<void>((resolve) => { releaseFirstWrite = resolve; });
    const addRecord = jest.fn()
      .mockImplementationOnce(async () => { signalFirstWrite(); await firstWriteGate; })
      .mockResolvedValue(undefined);
    const learningStore = { addRecord };
    const ref = createRef<StudyWorkbenchHandle>();
    function Harness() {
      const [answerText, setAnswerText] = useState('');
      return <StudyWorkbench {...baseProps} ref={ref} activeTab="mine" answerText={answerText} editingTab="mine" learningStore={learningStore} onAnswerChange={setAnswerText} tabs={['mine']} />;
    }
    const screen = await render(<Harness />);
    fireEvent.changeText(screen.getByLabelText('我的回答'), 'first');
    await waitFor(() => expect(screen.getByLabelText('我的回答').props.value).toBe('first'));

    const flushing = ref.current!.flushAutoSave();
    await firstWriteStarted;
    fireEvent.changeText(screen.getByLabelText('我的回答'), 'latest');
    await waitFor(() => expect(screen.getByLabelText('我的回答').props.value).toBe('latest'));
    releaseFirstWrite();
    let result: boolean | undefined;
    await act(async () => { result = await flushing; });

    expect(result).toBe(true);
    expect(addRecord).toHaveBeenCalledTimes(2);
    expect(addRecord).toHaveBeenLastCalledWith(expect.objectContaining({ aiResult: expect.objectContaining({ transcript: 'latest' }) }));
  });

  it('retries a previously successful fingerprint after an intervening save failure', async () => {
    const addRecord = jest.fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('outbox_failed'))
      .mockResolvedValueOnce(undefined);
    const learningStore = { addRecord };
    const ref = createRef<StudyWorkbenchHandle>();
    function Harness() {
      const [answerText, setAnswerText] = useState('');
      return <StudyWorkbench {...baseProps} ref={ref} activeTab="mine" answerText={answerText} editingTab="mine" learningStore={learningStore} onAnswerChange={setAnswerText} tabs={['mine']} />;
    }
    const screen = await render(<Harness />);

    for (const [answer, expected] of [['answer-a', true], ['answer-b', false], ['answer-a', true]] as const) {
      fireEvent.changeText(screen.getByLabelText('我的回答'), answer);
      await waitFor(() => expect(screen.getByLabelText('我的回答').props.value).toBe(answer));
      let result: boolean | undefined;
      await act(async () => { result = await ref.current?.flushAutoSave(); });
      expect(result).toBe(expected);
    }

    expect(addRecord).toHaveBeenCalledTimes(3);
    expect(addRecord).toHaveBeenLastCalledWith(expect.objectContaining({ aiResult: expect.objectContaining({ transcript: 'answer-a' }) }));
  });
});
