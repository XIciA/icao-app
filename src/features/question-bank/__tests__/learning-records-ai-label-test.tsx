import { render, waitFor } from '@testing-library/react-native';

import { sqliteLearningStore } from '../platform/learning-store';
import { LearningRecordsScreen } from '../components/LearningRecordsScreen';

jest.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ account: { accountId: 'account-1' } }),
}));

jest.mock('@/features/account/privacy-self-service', () => ({
  deleteAiResult: jest.fn(),
}));

jest.mock('../platform/learning-store', () => ({
  sqliteLearningStore: { getRecords: jest.fn() },
}));

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
