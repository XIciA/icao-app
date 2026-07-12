import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

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
  return { Check: Icon, Eraser: Icon, Mic: Icon, NotebookPen: Icon, Save: Icon, Sparkles: Icon };
});

const baseProps = {
  answerText: '',
  bankId: 'opi' as const,
  bankTitle: 'OPI',
  cardKey: 'opi-card-1',
  categoryTitle: '运行',
  noteText: '',
  onAnswerChange: jest.fn(),
  onFeedback: jest.fn(),
  onNoteChange: jest.fn(),
  onRetrySave: jest.fn(),
  onTabChange: jest.fn(),
  questionText: 'Question',
  referenceContent: null,
  referenceLabel: '参考答案',
  reviewKind: 'opi-analysis' as const,
  topicTitle: '燃油',
};

describe('study workbench natural layout', () => {
  it('grows the answer input with its content without creating a nested scroll view', async () => {
    const screen = await render(<StudyWorkbench {...baseProps} activeTab="mine" tabs={['mine']} />);
    const input = screen.getByLabelText('我的回答');

    expect(screen.getByTestId('study-workbench-content').props.scrollEnabled).toBeUndefined();
    expect(input.props.scrollEnabled).toBe(false);

    fireEvent(input, 'contentSizeChange', { nativeEvent: { contentSize: { height: 184, width: 280 } } });

    await waitFor(() => expect(StyleSheet.flatten(screen.getByLabelText('我的回答').props.style).height).toBe(184));
  });

  it('grows the notes input with its content without creating a nested scroll view', async () => {
    const screen = await render(<StudyWorkbench {...baseProps} activeTab="notes" tabs={['notes']} />);
    const input = screen.getByLabelText('学习笔记');

    expect(screen.getByTestId('study-workbench-content').props.scrollEnabled).toBeUndefined();
    expect(input.props.scrollEnabled).toBe(false);

    fireEvent(input, 'contentSizeChange', { nativeEvent: { contentSize: { height: 156, width: 280 } } });

    await waitFor(() => expect(StyleSheet.flatten(screen.getByLabelText('学习笔记').props.style).height).toBe(156));
  });
});
