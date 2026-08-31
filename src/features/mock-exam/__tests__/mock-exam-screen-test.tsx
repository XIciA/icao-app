import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { MockExamScreen } from '@/features/content/MockExamScreen';
import { buildMockExamSession, toQuestionBankStudyPackage } from '../build-session';
import { discardLegacyMockExamDraft } from '../legacy-draft-cleanup';

const { MockExamScreen: WebMockExamScreen } = jest.requireActual(
  '@/features/content/MockExamScreen.tsx',
) as { MockExamScreen: typeof MockExamScreen };

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
    QuestionBankStudyScreen: ({ onReturn, returnLabel }: { onReturn: () => void; returnLabel: string }) => (
      <MockPressable accessibilityLabel={returnLabel} onPress={onReturn}><MockText>共享题库学习页</MockText></MockPressable>
    ),
  };
});

describe('MockExamScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('keeps the selection page and hands the generated package to the shared study screen', async () => {
    const screen = await render(<MockExamScreen />);

    expect(screen.getAllByText('模拟练习')).toHaveLength(2);
    expect(screen.queryByText(/模考/u)).toBeNull();
    expect(screen.getByText('考试类型')).toBeTruthy();
    expect(screen.getByText('考试板块')).toBeTruthy();
    expect(screen.getByText('已选 4/4')).toBeTruthy();
    expect(screen.getByText('开始完整练习')).toBeTruthy();
    expect(discardLegacyMockExamDraft).toHaveBeenCalledTimes(1);

    await act(async () => { await fireEvent.press(screen.getByText('开始完整练习')); });
    await waitFor(() => expect(screen.getByText('共享题库学习页')).toBeTruthy());
    expect(buildMockExamSession).toHaveBeenCalledWith({
      examType: 'icao4-first',
      modules: ['listening', 'sentences900', 'radiotelephony', 'opi'],
    });
    expect(toQuestionBankStudyPackage).toHaveBeenCalledWith({ id: 'session' });

    await fireEvent.press(screen.getByLabelText('返回模拟练习'));
    await waitFor(() => expect(screen.getByText('开始完整练习')).toBeTruthy());
    expect(screen.queryByText('共享题库学习页')).toBeNull();
  });

  it('shows deferred listening-score guidance only on the Vercel Web surface', async () => {
    const originalPlatform = Platform.OS;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
    try {
      const screen = await render(<WebMockExamScreen />);
      expect(screen.getByText('听力20题完成后统一显示50分制成绩、等级和逐题复盘；其他板块保持现有学习流程。')).toBeTruthy();
    } finally {
      Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform });
    }
  });

  it('does not expose internal generation errors on the formal screen', async () => {
    jest.mocked(buildMockExamSession).mockRejectedValueOnce(
      new Error('https://private.example/mock-exam internal_failure'),
    );
    const screen = await render(<MockExamScreen />);

    await fireEvent.press(screen.getByText('开始完整练习'));

    await waitFor(() => expect(screen.getByText('暂时无法生成练习卷，请检查网络或调整板块后重试。')).toBeTruthy());
    expect(screen.queryByText(/private\.example|internal_failure/u)).toBeNull();
  });
});
