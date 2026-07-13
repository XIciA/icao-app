import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';

import { StudyWorkbench } from '../components/StudyWorkbench';

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

    fireEvent.press(screen.getByLabelText('手动输入我的回答'));
    expect(onEditingTabChange).toHaveBeenCalledWith('mine');
  });

  it('keeps note content read-only until the explicit edit action is pressed', async () => {
    const onEditingTabChange = jest.fn();
    const screen = await render(<StudyWorkbench {...baseProps} activeTab="notes" onEditingTabChange={onEditingTabChange} tabs={['mine', 'notes']} />);
    expect(screen.queryByLabelText('学习笔记')).toBeNull();
    expect(screen.getByLabelText('学习笔记内容')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('添加笔记'));
    expect(onEditingTabChange).toHaveBeenCalledWith('notes');
  });
});
