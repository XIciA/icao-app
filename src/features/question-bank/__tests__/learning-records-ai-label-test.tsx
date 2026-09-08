import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';
import type { LearningRecord, QuestionBankStudyPackage } from '../types';

import { sqliteLearningStore } from '../platform/learning-store';
import { LearningRecordsScreen } from '../components/LearningRecordsScreen';

// Browser acceptance covers Metro's lazy import; this CJS test checks the record passed to the screen.
jest.mock('react', () => ({
  ...jest.requireActual('react'),
  lazy: () => jest.requireMock('../components/QuestionBankStudyScreen').QuestionBankStudyScreen,
}));

jest.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ account: { accountId: 'account-1' } }),
}));

jest.mock('@/features/account/privacy-self-service', () => ({
  deleteAiResult: jest.fn(),
}));

jest.mock('../platform/learning-store', () => ({
  sqliteLearningStore: { getRecords: jest.fn() },
}));

jest.mock('../components/QuestionBankStudyScreen', () => {
  const { Pressable, Text, View } = jest.requireActual('react-native');
  return { QuestionBankStudyScreen: ({ onReturn, studyPackage }: { onReturn: () => void; studyPackage: QuestionBankStudyPackage }) => (
    <View><Text>{`saved-choice:${studyPackage.studyReviewRecord?.vercelListeningReview?.items[0].selectedChoiceIndex}`}</Text><Pressable accessibilityLabel="返回历史列表" onPress={onReturn} /></View>
  ) };
});

jest.mock('lucide-react-native', () => {
  const { View } = jest.requireActual('react-native');
  const Icon = (props: object) => <View {...props} />;
  return { ArrowLeft: Icon, Clock3: Icon, History: Icon, Sparkles: Icon, Target: Icon, Trash2: Icon, X: Icon };
});

const mockGetRecords = jest.mocked(sqliteLearningStore.getRecords);

describe('<LearningRecordsScreen /> AI generated-content labels', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('opens a saved Vercel paper from history and leaves legacy summaries readable', async () => {
    const originalPlatform = Platform.OS;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
    try {
      const oldRecord: LearningRecord = {
        id: 'old', bankId: 'mock_exam', bankTitle: 'AI 模考', categoryTitle: 'ICAO 4 初考', topicTitle: '自选听力',
        recordType: 'mock_exam', completedCount: 20, totalCount: 20, correctCount: 10, durationSeconds: 120,
        reason: 'complete', createdAt: '2026-09-05T00:00:00.000Z',
        mockExam: { examType: 'icao4-first', mode: 'custom', moduleIds: ['listening'], sectionCounts: [] },
      };
      const saved: LearningRecord = {
        ...oldRecord, id: 'saved',
        vercelListeningReview: {
          schemaVersion: 1, completedAt: oldRecord.createdAt,
          result: { answeredCount: 20, correctCount: 10, totalCount: 20, score: 25, level: 4 },
          items: Array.from({ length: 20 }, (_, index) => ({
            id: `item-${index}`, dataset: { id: 'listening' }, category: { id: 'category' }, topic: { id: 'topic' },
            card: { id: `card-${index}`, choices: ['A', 'B'], correctChoiceIndex: 0 }, selectedChoiceIndex: 1,
          })) as NonNullable<LearningRecord['vercelListeningReview']>['items'],
        },
      };
      mockGetRecords.mockResolvedValueOnce([saved, oldRecord]);
      const screen = await render(<LearningRecordsScreen />);
      await waitFor(() => expect(screen.getByText('查看听力复盘')).toBeTruthy());
      expect(screen.getByText('此记录未保存逐题详情')).toBeTruthy();
      await fireEvent.press(screen.getByText('查看听力复盘'));
      await waitFor(() => expect(screen.getByText('saved-choice:1')).toBeTruthy());
      await fireEvent.press(screen.getByLabelText('返回历史列表'));
      expect(screen.getAllByText('查看听力复盘')).toHaveLength(1);
      expect(mockGetRecords).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform });
    }
  });

  it('labels a persisted structured DeepSeek result accessibly', async () => {
    mockGetRecords.mockResolvedValueOnce([{
      id: 'structured-ai-result',
      bankId: 'opi',
      bankTitle: 'OPI',
      categoryTitle: '运行',
      topicTitle: '燃油',
      completedCount: 1,
      totalCount: 1,
      correctCount: 0,
      durationSeconds: 5,
      reason: 'complete',
      createdAt: '2026-08-29T00:00:00.000Z',
      recordType: 'ai_result',
      aiResult: {
        questionId: 'q-1',
        transcript: 'My answer.',
        grammar: {
          correctedText: 'My corrected answer.',
          issues: [{ before: 'answer', after: 'corrected answer', reasonZh: '测试修正。' }],
        },
      },
    }]);

    const screen = await render(<LearningRecordsScreen />);

    await waitFor(() => expect(screen.getByText('My corrected answer.')).toBeTruthy());
    expect(screen.getByLabelText('AI 辅助生成')).toBeTruthy();
    expect(screen.getAllByTestId('ai-generated-content-label')).toHaveLength(1);
  });

  it('labels a legacy persisted result that stores issue strings', async () => {
    mockGetRecords.mockResolvedValueOnce([{
      id: 'legacy-ai-result',
      bankId: 'opi',
      bankTitle: 'OPI',
      categoryTitle: '运行',
      topicTitle: '天气',
      completedCount: 1,
      totalCount: 1,
      correctCount: 0,
      durationSeconds: 5,
      reason: 'complete',
      createdAt: '2026-08-29T00:00:00.000Z',
      recordType: 'ai_result',
      aiResult: {
        questionId: 'q-2',
        transcript: 'Legacy answer.',
        grammar: { correctedText: 'Legacy corrected answer.', issues: ['旧版语法建议'] },
        polishedText: 'Legacy polished answer.',
      },
    }]);

    const screen = await render(<LearningRecordsScreen />);

    await waitFor(() => expect(screen.getByText('Legacy polished answer.')).toBeTruthy());
    expect(screen.getByLabelText('AI 辅助生成')).toBeTruthy();
    expect(screen.getAllByTestId('ai-generated-content-label')).toHaveLength(1);
  });
});
