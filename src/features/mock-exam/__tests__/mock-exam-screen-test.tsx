import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import { MockExamScreen } from '@/features/content/MockExamScreen';
import { buildMockExamSession, toQuestionBankStudyPackage } from '../build-session';
import { discardLegacyMockExamDraft } from '../legacy-draft-cleanup';

jest.mock('@/features/mock-exam/build-session', () => ({
  buildMockExamSession: jest.fn(async () => ({ id: 'session' })),
  toQuestionBankStudyPackage: jest.fn(() => ({ id: 'package' })),
}));
jest.mock('@/features/mock-exam/legacy-draft-cleanup', () => ({
  discardLegacyMockExamDraft: jest.fn(async () => undefined),
}));
jest.mock('@/features/question-bank/components/QuestionBankStudyScreen', () => {
  const { Pressable: MockPressable, Text: MockText } = jest.requireActual('react-native');
  return {
    QuestionBankStudyScreen: ({ onReturn }: { onReturn: () => void }) => (
      <MockPressable accessibilityLabel="返回 AI 模考" onPress={onReturn}><MockText>共享题库学习页</MockText></MockPressable>
    ),
  };
});

describe('MockExamScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('keeps the selection page and hands the generated package to the shared study screen', async () => {
    const screen = await render(<MockExamScreen />);

    expect(screen.getByText('学习型模考')).toBeTruthy();
    expect(screen.getByText('考试类型')).toBeTruthy();
    expect(screen.getByText('考试板块')).toBeTruthy();
    expect(screen.getByText('已选 4/4')).toBeTruthy();
    expect(screen.getByText('开始完整模考')).toBeTruthy();
    expect(discardLegacyMockExamDraft).toHaveBeenCalledTimes(1);

    await act(async () => { fireEvent.press(screen.getByText('开始完整模考')); });
    await waitFor(() => expect(screen.getByText('共享题库学习页')).toBeTruthy());
    expect(buildMockExamSession).toHaveBeenCalledWith({
      examType: 'icao4-first',
      modules: ['listening', 'sentences900', 'radiotelephony', 'opi'],
    });
    expect(toQuestionBankStudyPackage).toHaveBeenCalledWith({ id: 'session' });

    fireEvent.press(screen.getByLabelText('返回 AI 模考'));
    await waitFor(() => expect(screen.getByText('开始完整模考')).toBeTruthy());
    expect(screen.queryByText('共享题库学习页')).toBeNull();
  });
});
