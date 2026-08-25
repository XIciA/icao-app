import { fireEvent, render } from '@testing-library/react-native';

import type { QuestionBankDataset } from '../types';
import { QuestionBankCatalog } from '../components/QuestionBankCatalog.native';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: mockPush, replace: jest.fn() }),
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}));
jest.mock('../lib/catalog-progress', () => ({
  loadCatalogProgress: jest.fn(async () => ({})),
}));

const dataset: QuestionBankDataset = {
  id: 'opi',
  title: 'OPI',
  nameEn: 'OPI',
  description: 'description',
  summary: 'summary',
  enabled: true,
  statusLabel: 'ready',
  icon: 'mic',
  declaredTopicCount: 1,
  declaredCardCount: 8,
  categoryUnit: '分类',
  topicUnit: '话题',
  cardUnit: '题',
  study: {
    interaction: 'speaking',
    tools: { recorder: true, choices: false, notes: true, dictionary: true, highlights: true, tags: true },
    copy: { transcriptLabel: '题目', referenceLabel: '参考' },
    audioTitlePattern: 'card-title',
    consoleTabs: ['mine', 'reference', 'notes'],
  },
  access: {
    policyVersion: 'content-access-v2',
    environment: null,
    membershipActive: false,
    membershipExpiresAt: null,
  },
  categories: [{
    id: 'opi-category-01',
    name: '会员话题',
    declaredTopicCount: 1,
    declaredCardCount: 8,
    topics: [{
      id: 'opi-topic-0004',
      name: '应急设备',
      declaredCardCount: 8,
      cards: [],
      access: { level: 'member', availableCardCount: 0, declaredCardCount: 8 },
    }],
  }],
};

describe('<QuestionBankCatalog /> Native content access', () => {
  beforeEach(() => mockPush.mockClear());

  it('shows locked catalog metadata and routes a free user to membership', async () => {
    const screen = await render(<QuestionBankCatalog dataset={dataset} />);

    expect(screen.getByText('会员')).toBeTruthy();
    await fireEvent.press(screen.getByText('会员话题'));
    expect(mockPush).toHaveBeenCalledWith('/account/membership');
  });
});
