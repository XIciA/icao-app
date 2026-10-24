// Exercise the historical implementation explicitly, independently of the formal Web default.
jest.mock('@/config/web-runtime', () => {
  const previous = process.env.EXPO_PUBLIC_ICAO_WEB_RUNTIME;
  process.env.EXPO_PUBLIC_ICAO_WEB_RUNTIME = 'vercel-legacy';
  try {
    return jest.requireActual('@/config/web-runtime');
  } finally {
    if (previous === undefined) delete process.env.EXPO_PUBLIC_ICAO_WEB_RUNTIME;
    else process.env.EXPO_PUBLIC_ICAO_WEB_RUNTIME = previous;
  }
});

import { act, render, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';

import type { QuestionBankDataset } from '../types';
import { loadCatalogProgress } from '../lib/catalog-progress';

const { QuestionBankCatalog } = jest.requireActual('../components/QuestionBankCatalog.tsx') as typeof import('../components/QuestionBankCatalog');

let focusCallback: (() => void | (() => void)) | undefined;

jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  return {
    useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn() }),
    useFocusEffect: (callback: () => void | (() => void)) => {
      focusCallback = callback;
      React.useEffect(() => callback(), [callback]);
    },
  };
});
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
jest.mock('lucide-react-native', () => {
  const { View } = jest.requireActual('react-native');
  const Icon = (props: object) => <View {...props} />;
  return new Proxy({}, { get: () => Icon });
});
jest.mock('@/components/ui', () => {
  const { Text, View } = jest.requireActual('react-native');
  return {
    AppText: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text>,
    Card: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    Screen: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});
jest.mock('@/components/visual/SoftGlow', () => ({ SoftGlow: () => null }));
jest.mock('../components/QuestionBankSwitcherHeader', () => ({ QuestionBankSwitcherHeader: () => null }));
jest.mock('../data/repository', () => ({ getEmbeddedQuestionBanks: () => [] }));
jest.mock('../lib/catalog-progress', () => ({ loadCatalogProgress: jest.fn() }));

const dataset: QuestionBankDataset = {
  id: 'listening',
  title: '听力',
  nameEn: 'Listening',
  description: '',
  summary: '',
  enabled: true,
  statusLabel: '',
  icon: 'headphones',
  declaredTopicCount: 1,
  declaredCardCount: 3,
  categoryUnit: '类',
  topicUnit: '组',
  cardUnit: '题',
  study: {
    interaction: 'choices',
    tools: { recorder: false, choices: true, notes: true, dictionary: true, highlights: true, tags: true },
    copy: { transcriptLabel: '音频原文', referenceLabel: '参考答案' },
    audioTitlePattern: 'card-title',
    consoleTabs: ['notes'],
  },
  categories: [{
    id: 'category',
    name: '10s航空英语',
    declaredTopicCount: 1,
    declaredCardCount: 3,
    topics: [{
      id: 'topic',
      name: '题组',
      declaredCardCount: 3,
      cards: Array.from({ length: 3 }, (_, index) => ({ id: `card-${index}`, taskTitle: 'Card', audioText: 'Question' })),
    }],
  }],
};

describe('<QuestionBankCatalog /> Vercel progress', () => {
  const originalPlatform = Platform.OS;

  beforeEach(() => {
    jest.clearAllMocks();
    focusCallback = undefined;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
  });

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform });
  });

  it('refreshes persisted topic progress whenever the Vercel catalog regains focus', async () => {
    let learned = 1;
    (loadCatalogProgress as jest.Mock).mockImplementation(async () => ({ topic: { learned, total: 3 } }));
    const screen = await render(<QuestionBankCatalog dataset={dataset} />);

    await waitFor(() => expect(screen.getByText('1/3')).toBeTruthy());
    expect(focusCallback).toBeDefined();
    const callsBeforeRefocus = (loadCatalogProgress as jest.Mock).mock.calls.length;
    learned = 2;
    await act(async () => {
      focusCallback?.();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(loadCatalogProgress).toHaveBeenCalledTimes(callsBeforeRefocus + 1);
    await waitFor(() => expect(screen.getByText('2/3')).toBeTruthy());
  });
});
