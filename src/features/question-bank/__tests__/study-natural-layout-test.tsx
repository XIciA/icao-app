import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { createRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';

import { StudyWorkbench, type StudyWorkbenchHandle } from '../components/StudyWorkbench';

jest.mock('@/features/ai/ai-client', () => ({
  acceptAiConsent: jest.fn(async () => undefined),
  grammarReview: jest.fn(),
  hasAiConsent: jest.fn(async () => true),
  polishExpression: jest.fn(),
  transcribeRecording: jest.fn(),
}));

jest.mock('lucide-react-native', () => {
  const { View } = jest.requireActual('react-native');
  const Icon = (props: object) => <View {...props} />;
  return { Check: Icon, Eraser: Icon, Mic: Icon, NotebookPen: Icon, Pencil: Icon, Save: Icon, Sparkles: Icon };
});

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
    const input = screen.getByLabelText('学习笔记');

    expect(screen.getByTestId('study-workbench-content').props.scrollEnabled).toBeUndefined();
    expect(input.props.scrollEnabled).toBe(false);

    fireEvent(input, 'contentSizeChange', { nativeEvent: { contentSize: { height: 156, width: 280 } } });

    await waitFor(() => expect(StyleSheet.flatten(screen.getByLabelText('学习笔记').props.style).height).toBe(156));
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
    expect(screen.queryByLabelText('学习笔记')).toBeNull();
    expect(screen.getByLabelText('学习笔记内容')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('编辑笔记'));
    expect(onEditingTabChange).toHaveBeenCalledWith('notes');
  });

  it('keeps the primary edit action in the top-right header instead of the bottom controls', async () => {
    const screen = await render(<StudyWorkbench {...baseProps} activeTab="mine" tabs={['mine', 'reference', 'notes']} />);

    expect(within(screen.getByTestId('study-workbench-header')).getByLabelText('编辑我的回答')).toBeTruthy();
    expect(within(screen.getByTestId('study-workbench-footer')).queryByLabelText('编辑我的回答')).toBeNull();
  });

  it('uses compact dots for multi-section navigation and keeps the active state accessible', async () => {
    const onTabChange = jest.fn();
    const screen = await render(<StudyWorkbench {...baseProps} activeTab="mine" onTabChange={onTabChange} tabs={['mine', 'reference', 'notes']} />);

    expect(screen.getByTestId('study-workbench-tab-mine').props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByTestId('study-workbench-tab-reference').props.accessibilityState).toEqual({ selected: false });
    expect(screen.getByTestId('study-workbench-tab-notes').props.accessibilityState).toEqual({ selected: false });
    expect(screen.getByTestId('study-workbench-tab-reference').props.hitSlop).toBe(8);
    expect(StyleSheet.flatten(screen.getByTestId('study-workbench-tab-indicator-mine').props.style)).toMatchObject({ height: 6, width: 16 });
    expect(StyleSheet.flatten(screen.getByTestId('study-workbench-tab-indicator-reference').props.style)).toMatchObject({ height: 5, width: 5 });

    fireEvent.press(screen.getByLabelText('切换到参考答案'));
    expect(onTabChange).toHaveBeenCalledWith('reference');
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
